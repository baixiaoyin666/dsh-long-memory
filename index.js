/**
 * dsh-long-memory — automatic long-term memory for DeepSeek Harness.
 *
 * After every completed turn the plugin asks the session's own model for the
 * few durable facts worth keeping (user preferences -> global, project facts ->
 * per-workspace), merges them into a small JSON store, and puts a compact
 * digest of the most relevant rows back into the system prompt of later
 * sessions. Three tools expose explicit search / save / forget.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  buildBrief,
  cleanText,
  clip,
  mergeCandidate,
  normalizeCwd,
  parseCandidates,
  prune,
  similarity,
} from './lib/memory.js'

export const inject = ['tools', 'systemPrompt', 'llm']

const STORE_VERSION = 1
const MAX_ENTRIES = 500
const MAX_CANDIDATES = 3
const EXTRACT_TIMEOUT_MS = 60000
const MAX_QUEUE = 4
const BRIEF_MAX_CHARS = 1400

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()
  return path.join(homedir(), '.dsh')
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

export function apply(ctx) {
  const dataDir = path.join(dshHome(), 'plugin-data', 'dsh-long-memory')
  const storeFile = path.join(dataDir, 'memories.json')
  const statusFile = path.join(dataDir, 'last-run.json')
  const statsFile = path.join(dataDir, 'status.json')

  const state = { version: STORE_VERSION, entries: [] }
  let ready = false
  let writeChain = Promise.resolve()
  let taskChain = Promise.resolve()
  let queued = 0
  const buffers = new Map()
  const controllers = new Set()

  const warn = (...args) => {
    try {
      ctx.logger?.warn?.(...args)
    } catch {
      /* logging must never break the plugin */
    }
  }

  async function load() {
    try {
      const raw = await readFile(storeFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.entries)) {
        state.entries = parsed.entries.filter(
          entry =>
            entry &&
            typeof entry.id === 'string' &&
            typeof entry.text === 'string' &&
            (entry.scope === 'global' || entry.scope === 'workspace'),
        )
        for (const entry of state.entries) {
          entry.workspace = entry.scope === 'workspace' ? normalizeCwd(entry.workspace) : ''
          entry.tags = Array.isArray(entry.tags) ? entry.tags.filter(tag => typeof tag === 'string') : []
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load store:', error)
    } finally {
      ready = true
    }
  }

  function persist() {
    const snapshot = JSON.stringify({ version: STORE_VERSION, entries: state.entries })
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${storeFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, storeFile)
      })
      .catch(error => warn('[long-memory] failed to persist store:', error))
    return writeChain
  }

  async function recordRun(patch) {
    try {
      await mkdir(dataDir, { recursive: true })
      await writeFile(statusFile, JSON.stringify({ at: new Date().toISOString(), ...patch }, null, 2), 'utf8')
    } catch {
      /* status is diagnostic only */
    }
  }

  const stats = {
    startedAt: new Date().toISOString(),
    turnsSeen: 0,
    lastTurnAt: null,
    extractions: 0,
    failures: 0,
    lastExtractionAt: null,
    lastError: null,
  }
  let statusChain = Promise.resolve()

  /** Diagnostic counters for `status.json`; never load-bearing. */
  function writeStatus() {
    const snapshot = JSON.stringify(stats, null, 2)
    statusChain = statusChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        await writeFile(statsFile, snapshot, 'utf8')
      })
      .catch(() => {})
    return statusChain
  }

  /** Resolve the route the session already used, falling back to the default. */
  function routeFor(session) {
    try {
      const config = session?.requestHeader?.()?.config
      if (config?.provider && config?.model) return { provider: config.provider, model: config.model }
    } catch {
      /* no header yet */
    }
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection?.provider && selection?.model) return { provider: selection.provider, model: selection.model }
    } catch {
      /* optional service */
    }
    return undefined
  }

  async function complete(prompt, route) {
    const controller = new AbortController()
    controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)
    try {
      let out = ''
      const stream = ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        maxTokens: 700,
        temperature: 0.2,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
          out += chunk.text
        } else if (chunk?.type === 'finish') {
          const kind = chunk.reason?.kind
          if (kind === 'error' || kind === 'aborted') {
            throw new Error(`model ${kind}: ${chunk.reason?.failure?.message || 'request failed'}`)
          }
        }
      }
      return out
    } finally {
      clearTimeout(timer)
      controllers.delete(controller)
    }
  }

  function buildExtractPrompt(userText, assistantText) {
    return [
      '你是一个长期记忆提炼器。阅读下面这一轮对话，找出值得跨会话长期记住的稳定事实。',
      '',
      '规则：',
      '- scope 为 global 时记录用户本人的身份、偏好、习惯、禁忌、语言与风格要求；scope 为 workspace 时记录当前项目的技术栈、命令、目录约定、关键决定和踩过的坑。',
      `- 最多 ${MAX_CANDIDATES} 条；没有值得记住的内容就输出 []。`,
      '- 不要记录临时任务进度、本轮一次性的输出内容、或能从代码里直接读到的显而易见信息。',
      '- 每条一句话，不超过 80 字，独立可读，不要用代词指代上文。',
      '- 只输出 JSON 数组，不要解释。格式：[{"scope":"global|workspace","text":"...","tags":["..."]}]',
      '',
      '【用户】',
      clip(userText, 2400) || '（无）',
      '',
      '【助手】',
      clip(assistantText, 2400) || '（无）',
    ].join('\n')
  }

  async function extractTurn({ userText, assistantText, cwd, route, sessionId, turn }) {
    const started = Date.now()
    const workspace = normalizeCwd(cwd)
    try {
      const raw = await complete(buildExtractPrompt(userText, assistantText), route)
      const candidates = parseCandidates(raw, MAX_CANDIDATES)
      let added = 0
      let merged = 0
      for (const candidate of candidates) {
        const scope = candidate.scope === 'workspace' ? 'workspace' : 'global'
        if (scope === 'workspace' && !workspace) continue
        const result = mergeCandidate(
          state.entries,
          { text: candidate.text, scope, tags: candidate.tags, workspace },
          Date.now(),
          'auto',
        )
        if (result.action === 'added') added += 1
        else merged += 1
      }
      if (added > 0) prune(state.entries, MAX_ENTRIES)
      if (added > 0 || merged > 0) await persist()
      stats.extractions += 1
      stats.lastExtractionAt = new Date().toISOString()
      stats.lastError = null
      writeStatus()
      await recordRun({
        ok: true,
        sessionId,
        turn,
        workspace,
        ms: Date.now() - started,
        candidates: candidates.length,
        added,
        merged,
      })
    } catch (error) {
      warn('[long-memory] extraction failed:', error)
      stats.failures += 1
      stats.lastError = String(error?.message || error)
      writeStatus()
      await recordRun({
        ok: false,
        sessionId,
        turn,
        workspace,
        ms: Date.now() - started,
        error: String(error?.message || error),
      })
    }
  }

  function enqueueExtraction(task) {
    if (queued >= MAX_QUEUE) return
    queued += 1
    taskChain = taskChain
      .then(task)
      .catch(error => warn('[long-memory] extraction task failed:', error))
      .finally(() => {
        queued -= 1
      })
  }

  /** Rebuild one turn's text from the log, for a turn that started before load. */
  function deriveTurnText(session, turn) {
    const user = []
    const assistant = []
    try {
      for (const entry of session.snapshotEvents()) {
        if (entry?.data?.turn !== turn) continue
        if (entry.type === 'user/message') {
          if (entry.data?.source?.kind !== 'user') continue
          const text = textOf(entry.data?.content).trim()
          if (text) user.push(text)
        } else if (entry.type === 'assistant/message') {
          const text = textOf(entry.data?.message?.content).trim()
          if (text) assistant.push(text)
        }
      }
    } catch (error) {
      warn('[long-memory] failed to derive turn text:', error)
    }
    return { userText: user.join('\n').trim(), assistantText: assistant.join('\n').trim() }
  }

  function onSessionEvent(session, event) {
    if (!ready || !event || typeof event.type !== 'string') return
    if (!session || !session.id) return
    if (session.header?.origin === 'subagent') return

    const id = session.id
    switch (event.type) {
      case 'turn/start': {
        buffers.set(id, { turn: event.data?.turn, user: [], assistant: [] })
        break
      }
      case 'user/message': {
        const buffer = buffers.get(id)
        if (!buffer) break
        const message = event.data
        if (message?.source?.kind !== 'user') break
        const text = textOf(message?.content).trim()
        if (text) buffer.user.push(text)
        break
      }
      case 'assistant/message': {
        const buffer = buffers.get(id)
        if (!buffer) break
        const text = textOf(event.data?.message?.content).trim()
        if (text) buffer.assistant.push(text)
        break
      }
      case 'turn/end': {
        const buffer = buffers.get(id)
        buffers.delete(id)
        stats.turnsSeen += 1
        stats.lastTurnAt = new Date().toISOString()
        const reason = event.data?.reason?.kind
        if (reason && reason !== 'completed') {
          writeStatus()
          break
        }
        const turn = buffer?.turn ?? event.data?.turn
        let userText = buffer ? buffer.user.join('\n').trim() : ''
        let assistantText = buffer ? buffer.assistant.join('\n').trim() : ''
        if (!userText && !assistantText) {
          const derived = deriveTurnText(session, turn)
          userText = derived.userText
          assistantText = derived.assistantText
        }
        if (userText.length < 6 && assistantText.length < 30) {
          writeStatus()
          break
        }
        const route = routeFor(session)
        if (!route) {
          stats.lastError = 'no model route for this session'
          writeStatus()
          break
        }
        const cwd = cwdOfSession(session)
        enqueueExtraction(() =>
          extractTurn({ userText, assistantText, cwd, route, sessionId: String(id), turn }),
        )
        break
      }
      default:
        break
    }
  }

  /** Live working directory of a session, falling back to its immutable header. */
  function cwdOfSession(session) {
    try {
      const directories = ctx.get('workingDirectory')
      if (directories && session) {
        const current = directories.get(session)
        if (typeof current === 'string' && current) return current
      }
    } catch {
      /* optional service, or a session it does not track */
    }
    try {
      const header = session?.header?.cwd
      return typeof header === 'string' ? header : ''
    } catch {
      return ''
    }
  }

  function cwdOf(context) {
    try {
      const agent = context?.agent || context?.scope
      return cwdOfSession(agent?.session) || (typeof agent?.header?.cwd === 'string' ? agent.header.cwd : '')
    } catch {
      return ''
    }
  }

  function resolveCwd(agent) {
    try {
      return cwdOfSession(agent?.session)
    } catch {
      return ''
    }
  }

  function scoreEntry(entry, query) {
    if (typeof query !== 'string' || !query.trim()) return 0
    const haystack = `${entry.text} ${(entry.tags || []).join(' ')}`
    const direct = haystack.toLowerCase().includes(query.trim().toLowerCase()) ? 2 : 0
    return direct + similarity(haystack, query)
  }

  function visibleEntries(cwd, scope) {
    const workspace = normalizeCwd(cwd)
    if (scope === 'global') return state.entries.filter(entry => entry.scope === 'global')
    if (scope === 'workspace') {
      return workspace ? state.entries.filter(entry => entry.scope === 'workspace' && entry.workspace === workspace) : []
    }
    return state.entries.filter(
      entry => entry.scope === 'global' || (workspace !== '' && entry.workspace === workspace),
    )
  }

  // The digest is frozen per agent so the system-prompt prefix stays identical
  // for every step and turn of a session (prompt caching). New rows saved
  // during the session arrive with the next session; memory_search reads them now.
  const briefs = new WeakMap()

  ctx.on('session/event', onSessionEvent)

  ctx.systemPrompt.context({
    name: 'long-memory-brief',
    order: 60,
    text: context => {
      if (!ready) return ''
      try {
        const agent = context?.agent || context?.scope
        if (agent && typeof agent === 'object') {
          const cached = briefs.get(agent)
          if (cached !== undefined) return cached
          const brief = buildBrief(state.entries, cwdOf(context), BRIEF_MAX_CHARS)
          briefs.set(agent, brief)
          return brief
        }
        return buildBrief(state.entries, cwdOf(context), BRIEF_MAX_CHARS)
      } catch (error) {
        warn('[long-memory] failed to build brief:', error)
        return ''
      }
    },
  })

  ctx.tools.register({
    name: 'memory_search',
    description:
      'Search long-term memory: durable facts carried over from earlier sessions. Covers user-wide preferences (global) and this workspace\'s project facts. Returns matching rows with ids for memory_forget.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look for. Natural language or keywords; matched against memory text and tags.',
        },
        scope: {
          type: 'string',
          enum: ['auto', 'global', 'workspace'],
          description:
            'Which memories to search. Default auto: global facts plus this workspace\'s facts. Use global or workspace to narrow it.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum rows to return. Default 8.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const query = cleanText(String(args?.query ?? ''), 200)
      if (!query) return { error: 'query required', results: [] }
      const scope = args?.scope === 'global' || args?.scope === 'workspace' ? args.scope : 'auto'
      const rawLimit = Number(args?.limit)
      const limit = Number.isFinite(rawLimit) ? Math.min(20, Math.max(1, Math.floor(rawLimit))) : 8
      const pool = visibleEntries(resolveCwd(exec?.agent), scope)
      const ranked = pool
        .map(entry => ({ entry, score: scoreEntry(entry, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0))
        .slice(0, limit)
        .map(({ entry, score }) => ({
          id: entry.id,
          scope: entry.scope,
          text: entry.text,
          tags: entry.tags || [],
          updatedAt: entry.updatedAt || 0,
          score: Number(score.toFixed(3)),
        }))
      return { total: pool.length, results: ranked }
    },
  })

  ctx.tools.register({
    name: 'memory_save',
    description:
      'Save one durable fact to long-term memory so later sessions know it. Use it when the user states a lasting preference (global) or a project fact, convention, command, or decision (workspace). Near-duplicates merge into the existing row.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'One self-contained sentence, at most 80 characters, readable without this conversation.',
        },
        scope: {
          type: 'string',
          enum: ['global', 'workspace'],
          description:
            'global: about the user, valid in every workspace. workspace: about this project, valid only here. Default global.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional retrieval keywords, at most 5.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const text = cleanText(String(args?.text ?? ''), 240)
      if (!text) return { saved: false, reason: 'text required' }
      const scope = args?.scope === 'workspace' ? 'workspace' : 'global'
      const cwd = normalizeCwd(resolveCwd(exec?.agent))
      if (scope === 'workspace' && !cwd) {
        return { saved: false, reason: 'this session has no workspace directory; save as global instead' }
      }
      const tags = Array.isArray(args?.tags) ? args.tags.filter(tag => typeof tag === 'string').map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 5) : []
      const result = mergeCandidate(state.entries, { text, scope, tags, workspace: cwd }, Date.now(), 'tool')
      if (result.action === 'added') prune(state.entries, MAX_ENTRIES)
      await persist()
      return { saved: true, id: result.entry.id, merged: result.action === 'merged' }
    },
  })

  ctx.tools.register({
    name: 'memory_forget',
    description: 'Delete one long-term memory row by id. Get ids from memory_search.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Exact memory id, e.g. m-abc123-xy4z9q.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const id = String(args?.id ?? '').trim()
      if (!id) return { removed: false, reason: 'id required' }
      const index = state.entries.findIndex(entry => entry.id === id)
      if (index < 0) return { removed: false, reason: 'no memory with that id' }
      state.entries.splice(index, 1)
      await persist()
      return { removed: true, id }
    },
  })

  ctx.effect(() => () => {
    for (const controller of controllers) {
      try {
        controller.abort()
      } catch {
        /* ignore */
      }
    }
    controllers.clear()
    buffers.clear()
  })

  ready = false
  load().catch(error => warn('[long-memory] load crashed:', error))
}
