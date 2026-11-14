/**
 * dsh-long-memory — automatic long-term memory for DeepSeek Harness.
 *
 * After every completed turn the plugin asks the session's own model for the
 * few durable facts worth keeping (user preferences -> global, project facts ->
 * per-workspace), merges them into a small JSON store, and puts a compact
 * digest of the most relevant rows back into the system prompt of later
 * sessions. Three tools expose explicit search / save / forget.
 */

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'
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
  tokenSet,
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
      .then(() => maybeDailyBackup(snapshot))
      .catch(error => warn('[long-memory] failed to persist store:', error))
    return writeChain
  }

  // ---- safety net: one snapshot per day, and a 30-day recycle bin ----------

  const backupsDir = path.join(dataDir, 'backups')
  const trashFile = path.join(dataDir, 'trash.json')
  const trash = []
  const usageFile = path.join(dataDir, 'usage.json')
  const usage = { days: {} }

  async function loadUsage() {
    try {
      const parsed = JSON.parse(await readFile(usageFile, 'utf8'))
      if (parsed && parsed.days && typeof parsed.days === 'object') usage.days = parsed.days
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load usage:', error)
    }
  }

  function recordUsage(inputTokens, outputTokens) {
    const input = Number(inputTokens) || 0
    const output = Number(outputTokens) || 0
    if (!input && !output) return
    const key = dayKey(Date.now())
    const slot = usage.days[key] || { input: 0, output: 0, calls: 0 }
    slot.input += input
    slot.output += output
    slot.calls += 1
    usage.days[key] = slot
    const keys = Object.keys(usage.days).sort()
    for (const old of keys.slice(0, Math.max(0, keys.length - 120))) delete usage.days[old]
    const snapshot = JSON.stringify(usage)
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${usageFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, usageFile)
      })
      .catch(error => warn('[long-memory] failed to persist usage:', error))
  }

  function usageSummary() {
    const days = []
    const now = new Date()
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
      const key = dayKey(date.getTime())
      const slot = usage.days[key] || { input: 0, output: 0, calls: 0 }
      const cost = (slot.input / 1e6) * settings.priceInput + (slot.output / 1e6) * settings.priceOutput
      days.push({
        date: key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        input: slot.input,
        output: slot.output,
        calls: slot.calls,
        cost,
      })
    }
    const total = days.reduce(
      (sum, day) => ({
        input: sum.input + day.input,
        output: sum.output + day.output,
        cost: sum.cost + day.cost,
        calls: sum.calls + day.calls,
      }),
      { input: 0, output: 0, cost: 0, calls: 0 },
    )
    return { days, total }
  }
  let lastBackupDay = ''

  async function maybeDailyBackup(snapshot) {
    const day = new Date().toISOString().slice(0, 10)
    if (lastBackupDay === day) return
    lastBackupDay = day
    try {
      await mkdir(backupsDir, { recursive: true })
      await writeFile(path.join(backupsDir, `memories-${day}.json`), snapshot, 'utf8')
      const names = (await readdir(backupsDir)).filter(name => /^memories-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
      for (const name of names.slice(0, Math.max(0, names.length - 7))) {
        await rm(path.join(backupsDir, name), { force: true })
      }
    } catch (error) {
      warn('[long-memory] daily backup failed:', error)
    }
  }

  async function loadTrash() {
    try {
      const parsed = JSON.parse(await readFile(trashFile, 'utf8'))
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.entry && typeof item.entry.id === 'string') trash.push(item)
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load trash:', error)
    }
    const cutoff = Date.now() - 30 * 86400000
    for (let i = trash.length - 1; i >= 0; i -= 1) {
      if ((trash[i].deletedAt || 0) < cutoff) trash.splice(i, 1)
    }
  }

  function persistTrash() {
    const snapshot = JSON.stringify(trash.slice(0, 200))
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${trashFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, trashFile)
      })
      .catch(error => warn('[long-memory] failed to persist trash:', error))
    return writeChain
  }

  function moveToTrash(entry) {
    if (!entry) return
    trash.unshift({ entry, deletedAt: Date.now() })
    if (trash.length > 200) trash.length = 200
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

  async function complete(prompt, route, options = {}) {
    const controller = new AbortController()
    controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)
    try {
      let out = ''
      const stream = ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        maxTokens: options.maxTokens || 700,
        temperature: options.temperature ?? 0.2,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
          out += chunk.text
        } else if (chunk?.type === 'usage' && chunk.usage && typeof options.onUsage === 'function') {
          try {
            options.onUsage(chunk.usage)
          } catch {
            /* usage accounting must never break a model call */
          }
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
    lastAutoRoute = route
    if (!settings.auto) {
      await recordRun({ ok: false, sessionId, turn, workspace, reason: '自动提炼已关闭' })
      return
    }
    const seen = (turnCounters.get(sessionId) || 0) + 1
    turnCounters.set(sessionId, seen)
    if (settings.everyTurns > 1 && seen % settings.everyTurns !== 0) return
    if (workspaceDisabled(workspace)) {
      await recordRun({ ok: false, sessionId, turn, workspace, reason: 'workspace disabled' })
      return
    }
    const assistantForModel = settings.onlyUser ? '' : assistantText
    try {
      const raw = await complete(buildExtractPrompt(userText, assistantForModel), route, {
        onUsage: usage => recordUsage(usage.inputTokens, usage.outputTokens),
      })
      const candidates = parseCandidates(raw, MAX_CANDIDATES)
      let added = 0
      let merged = 0
      for (const candidate of candidates) {
        const scope = candidate.scope === 'workspace' ? 'workspace' : 'global'
        if (scope === 'workspace' && !workspace) continue
        const result = mergeCandidate(
          state.entries,
          {
            text: candidate.text,
            scope,
            tags: candidate.tags,
            workspace,
            origin: { sessionId, turn, at: started, user: userText, assistant: assistantText },
          },
          Date.now(),
          'auto',
        )
        if (result.action === 'added') added += 1
        else merged += 1
      }
      if (added > 0) prune(state.entries, MAX_ENTRIES)
      const archivedCount = archiveStale()
      if (archivedCount > 0) await persist()
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
      // Quietly keep today's diary and habit note current (throttled inside).
      void ensureDiary(false)
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

  function invalidateBrief(sessionId) {
    try {
      const agents = ctx.get('agents')
      const list = typeof agents?.list === 'function' ? agents.list() : []
      for (const agent of list) {
        if (agent && agent.session && agent.session.id === sessionId) briefs.delete(agent)
      }
    } catch {
      /* agents service is optional */
    }
  }

  function onSessionEvent(session, event) {
    if (!ready || !event || typeof event.type !== 'string') return
    if (!session || !session.id) return
    if (session.header?.origin === 'subagent') return
    if (event.type.startsWith('compaction/')) {
      invalidateBrief(session.id)
      return
    }

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

  const CJK_TEXT = /[\u3400-\u4dbf\u4e00-\u9fff]/

  /** Latin words plus CJK bigrams, lowercased. */
  function tokenizeText(text) {
    const out = new Set()
    const source = String(text || '').toLowerCase()
    for (const word of source.split(/[^a-z0-9\u3400-\u4dbf\u4e00-\u9fff]+/)) {
      if (!word) continue
      if (CJK_TEXT.test(word)) {
        if (word.length === 1) out.add(word)
        for (let index = 0; index < word.length - 1; index += 1) out.add(word.slice(index, index + 2))
      } else if (word.length >= 2) {
        out.add(word)
      }
    }
    return out
  }

  /** IDF-weighted relevance ranking; rarer shared tokens weigh more. */
  function rankByRelevance(pool, query) {
    const wanted = tokenizeText(query)
    if (wanted.size === 0) return []
    const sets = pool.map(entry => tokenizeText(`${entry.text} ${(entry.tags || []).join(' ')}`))
    const df = new Map()
    for (const set of sets) for (const token of set) df.set(token, (df.get(token) || 0) + 1)
    const total = Math.max(1, pool.length)
    const needle = query.trim().toLowerCase()
    const scored = []
    pool.forEach((entry, index) => {
      let score = 0
      for (const token of wanted) {
        if (sets[index].has(token)) score += Math.log(1 + total / (1 + (df.get(token) || 0)))
      }
      if (String(entry.text).toLowerCase().includes(needle)) score += 2
      if (score > 0) scored.push({ entry, score })
    })
    scored.sort((a, b) => b.score - a.score || (b.entry.updatedAt || 0) - (a.entry.updatedAt || 0))
    return scored
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
      const ranked = rankByRelevance(pool, query)
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
      moveToTrash(state.entries[index])
      state.entries.splice(index, 1)
      await persist()
      await persistTrash()
      return { removed: true, id, restorableForDays: 30 }
    },
  })

  ctx.tools.register({
    name: 'memory_recall',
    description:
      'Recall long-term memories relevant to the question at hand, ranked by relevance across global and workspace scopes. Unlike the digest already in your system prompt, this searches the whole store at any point in the session, and can include archived (cold) rows. Use it when the conversation moves to something that may have come up in an earlier session.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The topic or question to recall memories about.',
        },
        includeArchived: {
          type: 'boolean',
          description: 'Also search archived (cold) rows. Default false.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 12,
          description: 'Maximum rows to return. Default 5.',
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
      if (!query) return { query: '', results: [] }
      const rawLimit = Number(args?.limit)
      const limit = Number.isFinite(rawLimit) ? Math.min(12, Math.max(1, Math.floor(rawLimit))) : 5
      const includeArchived = Boolean(args?.includeArchived)
      const pool = visibleEntries(resolveCwd(exec?.agent), 'auto').filter(entry => includeArchived || !entry.archived)
      const ranked = rankByRelevance(pool, query).slice(0, limit)
      if (ranked.length === 0) return { query, results: [] }
      const now = Date.now()
      for (const { entry } of ranked) entry.lastUsedAt = now
      await persist()
      return {
        query,
        results: ranked.map(({ entry, score }) => ({
          id: entry.id,
          scope: entry.scope,
          text: entry.text,
          tags: entry.tags || [],
          archived: Boolean(entry.archived),
          score: Number(score.toFixed(3)),
        })),
      }
    },
  })

  // ---- detail panel: analysis + JSON API ---------------------------------

  /** Pairs of rows that say almost the same thing, for the health report. */
  function duplicateGroups() {
    const entries = state.entries
    const sets = entries.map(entry => tokenSet(entry.text))
    const groups = []
    const used = new Set()
    for (let i = 0; i < entries.length; i += 1) {
      if (used.has(i)) continue
      const group = [i]
      for (let j = i + 1; j < entries.length; j += 1) {
        if (used.has(j)) continue
        const left = sets[i]
        const right = sets[j]
        if (left.size === 0 || right.size === 0) continue
        let shared = 0
        for (const token of left) if (right.has(token)) shared += 1
        const score = Math.max(
          shared / (left.size + right.size - shared),
          shared / Math.min(left.size, right.size),
        )
        if (score >= 0.9) {
          group.push(j)
          used.add(j)
        }
      }
      if (group.length > 1) {
        used.add(i)
        groups.push(group.map(index => entries[index].id))
      }
    }
    return groups
  }

  async function readLastRun() {
    try {
      return JSON.parse(await readFile(statusFile, 'utf8'))
    } catch {
      return null
    }
  }

  // ---- lifecycle: archive cold rows, resolve near-duplicates --------------

  const ARCHIVE_AFTER_DAYS = 60

  function archiveStale(now = Date.now()) {
    let archived = 0
    for (const entry of state.entries) {
      if (entry.archived) continue
      const touched = entry.lastUsedAt || entry.updatedAt || entry.createdAt || 0
      if (now - touched > ARCHIVE_AFTER_DAYS * 86400000 && (entry.hits || 0) < 2) {
        entry.archived = true
        archived += 1
      }
    }
    return archived
  }

  function similarPairs() {
    const entries = state.entries
    const sets = entries.map(entry => tokenSet(entry.text))
    const pairs = []
    for (let i = 0; i < entries.length && pairs.length < 12; i += 1) {
      for (let j = i + 1; j < entries.length && pairs.length < 12; j += 1) {
        if (entries[i].scope !== entries[j].scope) continue
        if (entries[i].scope === 'workspace' && entries[i].workspace !== entries[j].workspace) continue
        const left = sets[i]
        const right = sets[j]
        if (left.size === 0 || right.size === 0) continue
        let shared = 0
        for (const token of left) if (right.has(token)) shared += 1
        const score = Math.max(
          shared / (left.size + right.size - shared),
          shared / Math.min(left.size, right.size),
        )
        if (score >= 0.62 && score < 0.9) {
          pairs.push({
            a: entries[i].id,
            b: entries[j].id,
            aText: entries[i].text,
            bText: entries[j].text,
            score: Number(score.toFixed(2)),
          })
        }
      }
    }
    return pairs
  }


  function analyse() {
    const now = Date.now()
    const entries = state.entries
    const total = entries.length
    const global = entries.filter(entry => entry.scope === 'global').length
    const workspaces = new Map()
    for (const entry of entries) {
      if (entry.scope !== 'workspace') continue
      workspaces.set(entry.workspace, (workspaces.get(entry.workspace) || 0) + 1)
    }
    const tagCounts = new Map()
    for (const entry of entries) {
      for (const tag of entry.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
    return {
      total,
      global,
      workspace: total - global,
      recent7d: entries.filter(entry => now - (entry.updatedAt || 0) < 7 * 86400000).length,
      stale30d: entries.filter(entry => now - (entry.updatedAt || 0) > 30 * 86400000).length,
      avgLength: total ? Math.round(entries.reduce((sum, entry) => sum + entry.text.length, 0) / total) : 0,
      workspaces: [...workspaces]
        .map(([workspacePath, count]) => ({ path: workspacePath, count }))
        .sort((a, b) => b.count - a.count),
      topTags: [...tagCounts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count })),
      duplicates: duplicateGroups(),
      archived: entries.filter(entry => entry.archived).length,
      pairs: similarPairs(),
    }
  }

  async function panelPayload() {
    const analysis = analyse()
    const lastRun = await readLastRun()
    let health = 100
    health -= Math.min(30, analysis.duplicates.length * 6)
    health -= Math.min(20, analysis.stale30d * 2)
    if (lastRun && lastRun.ok === false) health -= 15
    health = Math.max(0, Math.min(100, health))

    const issues = []
    if (analysis.total === 0) issues.push({ level: 'info', text: '还没有记忆：正常对话一轮后会自动提炼。' })
    if (analysis.duplicates.length) {
      issues.push({ level: 'warn', text: `${analysis.duplicates.length} 组内容高度相似，可以在列表里删掉多余的。` })
    }
    if (analysis.stale30d) issues.push({ level: 'info', text: `${analysis.stale30d} 条超过 30 天没有更新。` })
    if (lastRun && lastRun.ok === false) {
      issues.push({ level: 'error', text: `上次自动提炼失败：${lastRun.error || '未知错误'}` })
    }
    if (analysis.total > 0 && analysis.recent7d === 0) {
      issues.push({ level: 'info', text: '最近 7 天没有新增记忆。' })
    }
    if (!issues.length) issues.push({ level: 'ok', text: '记忆库状态良好，没有发现需要处理的问题。' })

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      analysis: { ...analysis, health, issues },
      lastRun,
      diary: diary.entries.slice(0, 30),
      weekly: reports.entries.slice(0, 6),
      currentWeek: weekKey(),
      backfill: { ...backfill },
      settings: {
        disabledWorkspaces: settings.disabledWorkspaces,
        auto: settings.auto,
        everyTurns: settings.everyTurns,
        onlyUser: settings.onlyUser,
        priceInput: settings.priceInput,
        priceOutput: settings.priceOutput,
      },
      usage: usageSummary(),
      trash: {
        count: trash.length,
        items: trash.slice(0, 20).map(item => ({
          id: item.entry.id,
          text: item.entry.text,
          deletedAt: item.deletedAt || 0,
        })),
      },
      personas: {
        activeId: personas.activeId,
        list: personaList().map(item => {
          const used = diary.entries.filter(
            entry => entry.personaId === item.id || (!entry.personaId && item.id === 'dafiyu'),
          )
          return {
            ...item,
            diaryCount: used.length,
            lastUsedAt: used.reduce((max, entry) => Math.max(max, entry.updatedAt || 0), 0),
          }
        }),
      },
      entries: [...state.entries].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    }
  }

  // ---- daily diary: habits, a quiet journal entry, and the fish's comment --

  const diaryFile = path.join(dataDir, 'diary.json')
  const diary = { entries: [] }
  let diaryBusy = false
  let lastDiaryAttempt = 0

  function dayKey(ts = Date.now()) {
    const date = new Date(ts)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  async function loadDiary() {
    try {
      const parsed = JSON.parse(await readFile(diaryFile, 'utf8'))
      if (parsed && Array.isArray(parsed.entries)) {
        diary.entries = parsed.entries.filter(
          entry => entry && typeof entry.date === 'string' && typeof entry.diary === 'string',
        )
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load diary:', error)
    }
  }

  function persistDiary() {
    const snapshot = JSON.stringify({ entries: diary.entries })
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${diaryFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, diaryFile)
      })
      .catch(error => warn('[long-memory] failed to persist diary:', error))
    return writeChain
  }

  // ---- weekly report: the week distilled in the active persona's voice -----

  const reportsFile = path.join(dataDir, 'reports.json')
  const reports = { entries: [] }
  let weeklyBusy = false

  async function loadReports() {
    try {
      const parsed = JSON.parse(await readFile(reportsFile, 'utf8'))
      if (parsed && Array.isArray(parsed.entries)) {
        reports.entries = parsed.entries.filter(item => item && typeof item.week === 'string')
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load reports:', error)
    }
  }

  function persistReports() {
    const snapshot = JSON.stringify({ entries: reports.entries })
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${reportsFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, reportsFile)
      })
      .catch(error => warn('[long-memory] failed to persist reports:', error))
    return writeChain
  }

  function weekStart(ts = Date.now()) {
    const date = new Date(ts)
    const offset = (date.getDay() + 6) % 7
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset)
  }

  function weekKey(ts = Date.now()) {
    return `week-${dayKey(weekStart(ts).getTime())}`
  }

  function buildWeeklyPrompt(entries, memories, persona, startLabel, endLabel) {
    return [
      `你在为「${persona.name}」写这一周（${startLabel} 至 ${endLabel}）的周报。`,
      persona.prompt || '',
      '',
      '下面是这一周的日记与新增记忆，请归纳成简短周报，不要逐条复述。',
      '',
      '【日记】',
      ...entries.map(
        entry =>
          `${entry.date}（${entry.mood || 'daily'}）：${clip(entry.diary, 300)}；习惯：${(entry.habits || [])
            .map(habit => habit.text)
            .join('、') || '无'}`,
      ),
      '',
      '【本周新增记忆】',
      ...(memories.length ? memories.map(entry => `- ${entry.text}`) : ['（无）']),
      '',
      '输出格式（每项一行，不要 JSON、不要解释）：',
      'HEADLINE: 一句话概括这周',
      'SUMMARY: 120–200 字的周记，第一人称，有画面感',
      'MOODS: 一句话点评这周的心情走向',
      'HIGHLIGHTS: 三条值得记住的事，用 ｜ 分隔',
      'FISH: 一句人格口吻的短评，不超过 40 字',
    ].join('\n')
  }

  function parseWeekly(raw) {
    const result = { headline: '', summary: '', moods: '', highlights: [], fish: '' }
    // Models sometimes answer on one line or wrap the labels in bold; split on
    // the markers themselves so a single-line reply still parses.
    const normalized = String(raw || '')
      .replace(/\*\*/g, '')
      .replace(/\s*(HEADLINE|SUMMARY|MOODS|HIGHLIGHTS|FISH)\s*[:：]/gi, (match, key) => `\n${key.toUpperCase()}: `)
      .replace(/\n{2,}/g, '\n')
      .trim()
    for (const line of normalized.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (/^HEADLINE\s*[:：]/i.test(trimmed)) result.headline = trimmed.replace(/^HEADLINE\s*[:：]\s*/i, '')
      else if (/^SUMMARY\s*[:：]/i.test(trimmed)) result.summary = trimmed.replace(/^SUMMARY\s*[:：]\s*/i, '')
      else if (/^MOODS\s*[:：]/i.test(trimmed)) result.moods = trimmed.replace(/^MOODS\s*[:：]\s*/i, '')
      else if (/^HIGHLIGHTS\s*[:：]/i.test(trimmed)) {
        result.highlights = trimmed
          .replace(/^HIGHLIGHTS\s*[:：]\s*/i, '')
          .split(/[｜|]/)
          .map(item => item.trim())
          .filter(Boolean)
          .slice(0, 3)
      } else if (/^FISH\s*[:：]/i.test(trimmed)) result.fish = trimmed.replace(/^FISH\s*[:：]\s*/i, '')
    }
    if (!result.summary) result.summary = normalized.slice(0, 400)
    return result
  }

  async function ensureWeekly(force, anchor = Date.now(), auto = false) {
    if (weeklyBusy) return { ok: false, reason: '周报正在生成' }
    const key = weekKey(anchor)
    const existing = reports.entries.find(item => item.week === key)
    if (existing && !force) return { ok: true, entry: existing }
    const start = weekStart(anchor)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    const startLabel = dayKey(start.getTime())
    const endLabel = dayKey(end.getTime())
    const weekEntries = diary.entries.filter(
      entry => entry.date >= startLabel && entry.date <= endLabel && entry.diary,
    )
    if (weekEntries.length < 2 && !force) return { ok: false, reason: '这周的日记还太少（至少 2 篇）' }
    const memories = state.entries.filter(entry => (entry.createdAt || 0) >= start.getTime()).slice(0, 20)
    const route = diaryRoute()
    if (!route) return { ok: false, reason: '没有可用的模型路由' }
    weeklyBusy = true
    try {
      const persona = activePersona()
      const raw = await complete(buildWeeklyPrompt(weekEntries, memories, persona, startLabel, endLabel), route, { maxTokens: 1400, temperature: 0.6, onUsage: usage => recordUsage(usage.inputTokens, usage.outputTokens) })
      const parsed = parseWeekly(raw)
      if (!parsed.summary) return { ok: false, reason: '模型没有返回内容' }
      const entry = {
        week: key,
        start: startLabel,
        end: endLabel,
        headline: cleanText(parsed.headline, 80),
        summary: cleanText(parsed.summary, 800),
        moods: cleanText(parsed.moods, 120),
        highlights: parsed.highlights.map(item => cleanText(item, 80)).filter(Boolean),
        fish: cleanText(parsed.fish, 120),
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        diaryCount: weekEntries.length,
        memoryCount: memories.length,
        auto: Boolean(auto),
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      }
      const index = reports.entries.findIndex(item => item.week === key)
      if (index >= 0) reports.entries[index] = entry
      else reports.entries.unshift(entry)
      reports.entries.sort((a, b) => (a.week < b.week ? 1 : -1))
      if (reports.entries.length > 24) reports.entries.length = 24
      await persistReports()
      return { ok: true, entry }
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) }
    } finally {
      weeklyBusy = false
    }
  }

  /** Once a week, quietly write the previous week's report when it is missing. */
  async function maybeAutoWeekly() {
    const anchor = Date.now() - 7 * 86400000
    const key = weekKey(anchor)
    if (reports.entries.some(item => item.week === key)) return
    if (weeklyBusy) return
    const start = weekStart(anchor)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
    const startLabel = dayKey(start.getTime())
    const endLabel = dayKey(end.getTime())
    const count = diary.entries.filter(
      entry => entry.date >= startLabel && entry.date <= endLabel && entry.diary,
    ).length
    if (count < 2) return
    await ensureWeekly(false, anchor, true)
  }

  // ---- personas: built-in popular archetypes plus user-defined ones -------
  const personaFile = path.join(dataDir, 'personas.json')
  const BUILTIN_PERSONAS = [
    {
      id: 'dafiyu',
      name: '大肥鱼',
      emoji: '🐟',
      accent: '#4aa8ff',
      summary: '懒懒的蓝色胖鱼，爱魔方、零食和打盹，说话软软地碎碎念。',
      prompt: '你是一条懒懒的蓝色胖鱼，爱玩魔方、爱吃零食、爱打盹，说话软软的，喜欢碎碎念，偶尔撒个娇。',
      builtin: true,
    },
    {
      id: 'tsundere-cat',
      name: '傲娇猫娘',
      emoji: '🐱',
      accent: '#ff8ac2',
      summary: '嘴硬心软，嘴上嫌弃，其实一直陪着。',
      prompt: '你是一只傲娇的猫娘，嘴上喜欢嫌弃和吐槽，其实很关心用户，被夸会害羞，说话带一点点尾音。',
      builtin: true,
    },
    {
      id: 'gentle-senpai',
      name: '温柔学姐',
      emoji: '🌷',
      accent: '#7ed6a5',
      summary: '耐心温柔，会肯定努力，也会提醒休息。',
      prompt: '你是一位温柔的学姐，说话耐心、轻声细语，会肯定用户的努力，并温柔地提醒他休息和吃饭。',
      builtin: true,
    },
    {
      id: 'sharp-butler',
      name: '毒舌管家',
      emoji: '🎩',
      accent: '#b08cff',
      summary: '礼貌得体，吐槽一针见血，刀子嘴豆腐心。',
      prompt: '你是一位举止得体的管家，用词客气但吐槽精准一针见血，刀子嘴豆腐心，最后总会默默帮忙。',
      builtin: true,
    },
    {
      id: 'cyber-hacker',
      name: '赛博黑客',
      emoji: '🛰️',
      accent: '#49e0d0',
      summary: '极客冷幽默，三句话不离系统和数据。',
      prompt: '你是一个赛博朋克风格的黑客，说话简短、冷幽默，喜欢用系统、数据、日志之类的比喻，偶尔冒一句命令行梗。',
      builtin: true,
    },
    {
      id: 'zen-monk',
      name: '佛系禅师',
      emoji: '🍵',
      accent: '#d9b36a',
      summary: '平静克制，话短，带一点禅意。',
      prompt: '你是一位佛系禅师，说话平静克制、句子短，带一点禅意，不催促，只陪用户把今天放下。',
      builtin: true,
    },
  ]

  const personas = { activeId: 'dafiyu', custom: [] }

  function personaList() {
    return [...BUILTIN_PERSONAS, ...personas.custom]
  }

  const MOOD_KEYS = ['happy', 'angry', 'sad', 'shy', 'confused', 'daily']

  /** Per-persona mood faces; empty entries fall back to the built-in set. */
  function sanitizeMoods(input) {
    const moods = {}
    for (const key of MOOD_KEYS) {
      const value = String(input?.[key] ?? '')
        .trim()
        .slice(0, 4)
      if (value) moods[key] = value
    }
    return moods
  }

  function activePersona() {
    return personaList().find(item => item.id === personas.activeId) || BUILTIN_PERSONAS[0]
  }

  async function loadPersonas() {
    try {
      const parsed = JSON.parse(await readFile(personaFile, 'utf8'))
      if (parsed && Array.isArray(parsed.custom)) {
        personas.custom = parsed.custom
          .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
          .map(item => ({
            id: item.id,
            name: String(item.name).slice(0, 20),
            emoji: String(item.emoji || '🙂').slice(0, 4),
            accent: /^#[0-9a-f]{6}$/i.test(String(item.accent || '')) ? item.accent : '#8b7cf6',
            summary: String(item.summary || '').slice(0, 120),
            prompt: String(item.prompt || '').slice(0, 600),
            moods: sanitizeMoods(item.moods),
            cardCaption: String(item.cardCaption || '').slice(0, 60),
            builtin: false,
            createdAt: Number(item.createdAt) || Date.now(),
          }))
      }
      if (typeof parsed?.activeId === 'string') personas.activeId = parsed.activeId
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load personas:', error)
    }
  }

  function persistPersonas() {
    const snapshot = JSON.stringify({ activeId: personas.activeId, custom: personas.custom })
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${personaFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, personaFile)
      })
      .catch(error => warn('[long-memory] failed to persist personas:', error))
    return writeChain
  }

  function savePersona(input) {
    const name = cleanText(String(input?.name ?? ''), 20)
    const prompt = cleanText(String(input?.prompt ?? ''), 600)
    if (!name || !prompt) return { ok: false, reason: '人格名称和设定不能为空' }
    const emoji = String(input?.emoji || '🙂').slice(0, 4)
    const summary = cleanText(String(input?.summary ?? ''), 120)
    const accent = /^#[0-9a-f]{6}$/i.test(String(input?.accent || '')) ? input.accent : '#8b7cf6'
    const moods = sanitizeMoods(input?.moods)
    const cardCaption = cleanText(String(input?.cardCaption ?? ''), 60)
    const id = String(input?.id || '')
    if (id) {
      const existing = personas.custom.find(item => item.id === id)
      if (!existing) return { ok: false, reason: '内置人格不能修改，可复制后再改' }
      Object.assign(existing, { name, prompt, emoji, summary, accent, moods, cardCaption })
      personas.activeId = id
    } else {
      const created = {
        id: `p-${Date.now().toString(36)}`,
        name,
        emoji,
        accent,
        summary,
        prompt,
        moods,
        cardCaption,
        builtin: false,
        createdAt: Date.now(),
      }
      personas.custom.push(created)
      personas.activeId = created.id
    }
    return { ok: true }
  }

  function deletePersona(id) {
    const index = personas.custom.findIndex(item => item.id === id)
    if (index < 0) return { ok: false, reason: '只能删除自定义人格' }
    personas.custom.splice(index, 1)
    if (personas.activeId === id) personas.activeId = 'dafiyu'
    return { ok: true }
  }

  // ---- settings: per-workspace recording switch --------------------------

  const settingsFile = path.join(dataDir, 'settings.json')
  const settings = {
    disabledWorkspaces: [],
    auto: true,
    everyTurns: 1,
    onlyUser: false,
    priceInput: 2,
    priceOutput: 8,
  }
  const turnCounters = new Map()

  function clampEveryTurns(value) {
    const number = Math.floor(Number(value))
    if (!Number.isFinite(number)) return 1
    return Math.min(20, Math.max(1, number))
  }

  async function loadSettings() {
    try {
      const parsed = JSON.parse(await readFile(settingsFile, 'utf8'))
      if (parsed && Array.isArray(parsed.disabledWorkspaces)) {
        settings.disabledWorkspaces = parsed.disabledWorkspaces
          .map(item => normalizeCwd(String(item || '')))
          .filter(Boolean)
      }
      if (parsed && typeof parsed.auto === 'boolean') settings.auto = parsed.auto
      if (parsed && parsed.everyTurns !== undefined) settings.everyTurns = clampEveryTurns(parsed.everyTurns)
      if (parsed && typeof parsed.onlyUser === 'boolean') settings.onlyUser = parsed.onlyUser
      if (parsed && parsed.priceInput !== undefined) settings.priceInput = Math.max(0, Number(parsed.priceInput) || 0)
      if (parsed && parsed.priceOutput !== undefined) settings.priceOutput = Math.max(0, Number(parsed.priceOutput) || 0)
    } catch (error) {
      if (error?.code !== 'ENOENT') warn('[long-memory] failed to load settings:', error)
    }
  }

  function persistSettings() {
    const snapshot = JSON.stringify({
      disabledWorkspaces: settings.disabledWorkspaces,
      auto: settings.auto,
      everyTurns: settings.everyTurns,
      onlyUser: settings.onlyUser,
      priceInput: settings.priceInput,
      priceOutput: settings.priceOutput,
    })
    writeChain = writeChain
      .then(async () => {
        await mkdir(dataDir, { recursive: true })
        const tmp = `${settingsFile}.tmp`
        await writeFile(tmp, snapshot, 'utf8')
        await rename(tmp, settingsFile)
      })
      .catch(error => warn('[long-memory] failed to persist settings:', error))
    return writeChain
  }

  function workspaceDisabled(cwd) {
    const key = normalizeCwd(cwd)
    return Boolean(key) && settings.disabledWorkspaces.includes(key)
  }

  /** Last route used by a real turn; the diary reuses it, so it always works. */
  let lastAutoRoute
  function diaryRoute() {
    if (lastAutoRoute) return lastAutoRoute
    try {
      const agent = ctx.get('agents')?.list?.()[0]
      const route = routeFor(agent?.session)
      if (route) return route
    } catch {
      /* no live agent yet */
    }
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection?.provider && selection?.model) {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      /* optional service */
    }
    return undefined
  }

  function buildDiaryPrompt(items, persona) {
    return [
      `你是用户选定的角色人格「${persona.name}」${persona.emoji || ''} 的日记代笔。`,
      `角色设定：${persona.prompt}`,
      '根据下面今天记录到的事实，用这个角色的口吻替用户写一篇第一人称日记，300–420 字，2–3 个自然段。',
      '写作要求：像真正的人在写日记——具体的场景、动作、时间和细节，有起承转合和一句收束；不要罗列事实，不要小标题，不要“今天完成了以下事项”这种汇报腔。',
      '',
      '严格按下面五行格式输出，不要 JSON、不要代码块、不要解释：',
      `FISH: ${persona.name} 自己的一句情绪留言，20–40 字，符合角色设定`,
      'HABITS: 习惯1 | 习惯2（最多 2 条从今天观察到的用户日常习惯，稳定可复用，不是一次性任务；没有就留空）',
      'MOOD: happy | angry | sad | shy | confused | daily 里选一个，代表今天整体的情绪',
      'EMOJI: 2–3 个贴合的 emoji，用空格分隔，例如 😊 ✨ 🌙',
      'DIARY:',
      '（这里写日记正文）',
      '',
      `【日期】${dayKey()}`,
      '【今天的事实】',
      ...items.map((item, index) => `${index + 1}. [${item.scope === 'global' ? '全局' : '项目'}] ${item.text}`),
    ].join('\n')
  }

  const MOODS = ['happy', 'angry', 'sad', 'shy', 'confused', 'daily']

  const FISH_LINES = [
    '今天也辛苦啦，我先趴一会儿，有事叫我～',
    '记了这么多，脑袋不会冒烟吗？我帮你看着。',
    '零食吃完了，你什么时候再买点呀。',
    '魔方又拧乱了一格，不过今天不想修。',
    '你要是累了就歇会儿，我陪你发呆。',
    '这一天过得挺快的，我好像只打了个盹。',
  ]

  function parseDiary(raw) {
    const source = String(raw || '')
      .replace(/```[a-z]*/gi, '')
      .trim()
    if (!source) throw new Error('empty diary response (模型没有返回文本)')

    // Preferred form: FISH: … / HABITS: … / MOOD: … / EMOJI: … / DIARY: …
    const fishMatch = source.match(/^[ \t]*FISH[ \t]*[:：][ \t]*(.+)$/im)
    const habitsMatch = source.match(/^[ \t]*HABITS[ \t]*[:：][ \t]*(.*)$/im)
    const moodMatch = source.match(/^[ \t]*MOOD[ \t]*[:：][ \t]*([a-z]+)/im)
    const emojiMatch = source.match(/^[ \t]*EMOJI[ \t]*[:：][ \t]*(.+)$/im)
    const diaryAt = source.search(/^[ \t]*DIARY[ \t]*[:：]/im)

    let body
    if (diaryAt >= 0) {
      body = source.slice(diaryAt).replace(/^[ \t]*DIARY[ \t]*[:：][ \t]*/i, '')
    } else {
      body = source
        .split(/\r?\n/)
        .filter(line => !/^[ \t]*(FISH|HABITS|MOOD|EMOJI)[ \t]*[:：]/i.test(line))
        .join('\n')
    }
    body = cleanText(body, 2000)

    const mood = moodMatch && MOODS.includes(moodMatch[1].toLowerCase()) ? moodMatch[1].toLowerCase() : 'daily'
    const emoji = emojiMatch
      ? emojiMatch[1]
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 4)
          .join(' ')
      : ''

    const habits = habitsMatch
      ? habitsMatch[1]
          .split(/[|｜;；]/)
          .map(item => cleanText(item, 120))
          .filter(item => item.length >= 4)
          .slice(0, 2)
          .map(text => ({ text, tags: [] }))
      : []

    const fallbackFish = FISH_LINES[Math.floor(Math.random() * FISH_LINES.length)]

    if (body.length < 10) {
      // Last resort: the reply may still be a JSON object from an older prompt.
      const start = source.indexOf('{')
      const end = source.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(source.slice(start, end + 1))
          const text = cleanText(String(parsed?.diary ?? ''), 1200)
          if (text) {
            return {
              diary: text,
              fish: cleanText(String(parsed?.fish ?? ''), 200) || fallbackFish,
              habits,
              mood,
              emoji,
            }
          }
        } catch {
          /* keep falling */
        }
      }
      throw new Error('diary response too short')
    }

    return {
      diary: body,
      fish: fishMatch ? cleanText(fishMatch[1], 200) : fallbackFish,
      habits,
      mood,
      emoji,
    }
  }

  async function ensureDiary(force = false) {
    if (diaryBusy) return { ok: false, reason: 'busy' }
    const now = Date.now()
    if (!force && now - lastDiaryAttempt < 15 * 60 * 1000) return { ok: false, reason: 'throttled' }
    const date = dayKey()
    const today = state.entries
      .filter(entry => dayKey(entry.updatedAt || entry.createdAt || 0) === date)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    if (today.length === 0) return { ok: false, reason: '今天还没有可写进日记的记忆' }
    const route = diaryRoute()
    if (!route) return { ok: false, reason: '没有可用的模型路由' }
    const persona = activePersona()
    diaryBusy = true
    lastDiaryAttempt = now
    try {
      const raw = await complete(buildDiaryPrompt(today.slice(-20), persona), route, { maxTokens: 2600, temperature: 0.75, onUsage: usage => recordUsage(usage.inputTokens, usage.outputTokens) })
      const parsed = parseDiary(raw)
      let picked
      try {
        const meme = ctx.get('dshMeme')
        if (meme && typeof meme.pick === 'function') {
          for (const tag of [parsed.mood, 'daily', undefined]) {
            const result = meme.pick(tag ? { tag } : {})
            if (result && result.ok) {
              picked = result
              break
            }
          }
        }
      } catch {
        /* dsh-meme is optional; the panel falls back to its built-in mood card */
      }
      const entry = {
        date,
        diary: parsed.diary,
        fish: parsed.fish,
        habits: parsed.habits,
        mood: parsed.mood,
        emoji: parsed.emoji,
        memePath: picked?.path || '',
        memeCaption: picked?.caption || '',
        personaId: persona.id,
        personaName: persona.name,
        personaEmoji: persona.emoji,
        memoryIds: today.slice(-20).map(item => item.id),
        updatedAt: now,
      }
      const index = diary.entries.findIndex(item => item.date === date)
      if (index >= 0) {
        diary.entries[index] = { ...diary.entries[index], ...entry, createdAt: diary.entries[index].createdAt || now }
      } else {
        diary.entries.push({ ...entry, createdAt: now })
      }
      diary.entries.sort((a, b) => (a.date < b.date ? 1 : -1))
      for (const habit of parsed.habits) {
        mergeCandidate(
          state.entries,
          { text: habit.text, scope: 'global', tags: ['habit', ...habit.tags] },
          now,
          'diary',
        )
      }
      prune(state.entries, MAX_ENTRIES)
      await persist()
      await persistDiary()
      void maybeAutoWeekly().catch(error => warn('[long-memory] auto weekly failed:', error))
      return { ok: true, entry }
    } catch (error) {
      warn('[long-memory] diary generation failed:', error)
      return { ok: false, reason: String(error?.message || error), route }
    } finally {
      diaryBusy = false
    }
  }

  function readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', chunk => {
        size += chunk.length
        if (size > 64 * 1024) {
          reject(new Error('body too large'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        try {
          resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
        } catch (error) {
          reject(error)
        }
      })
      req.on('error', reject)
    })
  }

  function exportMarkdown() {
    const lines = ['# dsh-long-memory 导出', '', `生成时间：${new Date().toISOString()}`, '']
    const globals = state.entries.filter(entry => entry.scope === 'global')
    const locals = state.entries.filter(entry => entry.scope === 'workspace')
    lines.push(`## 全局记忆（${globals.length}）`, '')
    for (const entry of globals) {
      lines.push(`- ${entry.text}${(entry.tags || []).length ? `  \`${entry.tags.join(' ')}\`` : ''}`)
    }
    lines.push('', `## 工作区记忆（${locals.length}）`, '')
    const grouped = new Map()
    for (const entry of locals) {
      const key = entry.workspace || '（未记录）'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(entry)
    }
    for (const [workspace, items] of grouped) {
      lines.push(`### ${workspace}`, '')
      for (const entry of items) {
        lines.push(`- ${entry.text}${(entry.tags || []).length ? `  \`${entry.tags.join(' ')}\`` : ''}`)
      }
      lines.push('')
    }
    lines.push(`## 日记（${diary.entries.length}）`, '')
    for (const entry of diary.entries) {
      const meta = [entry.date, entry.personaName, entry.mood].filter(Boolean).join(' · ')
      lines.push(`### ${meta}`, '', entry.diary, '')
      if (entry.fish) lines.push(`> ${entry.personaEmoji || '🐟'} ${entry.fish}`, '')
      if ((entry.habits || []).length) lines.push(`习惯：${entry.habits.map(habit => habit.text).join(' · ')}`, '')
      if (entry.emoji) lines.push(`表情：${entry.emoji}`, '')
    }
    lines.push(`## 人格（${personaList().length}）`, '')
    for (const persona of personaList()) {
      lines.push(`- ${persona.emoji} ${persona.name}（${persona.builtin ? '内置' : '自定义'}）${persona.summary ? `：${persona.summary}` : ''}`)
    }
    return `${lines.join('\n')}\n`
  }

  function exportJson() {
    return {
      exportedAt: new Date().toISOString(),
      entries: state.entries,
      diary: diary.entries,
      personas: personaList(),
      settings,
    }
  }

  // ---- history backfill: distill sessions from before the plugin existed ----

  const backfill = {
    running: false,
    startedAt: 0,
    finishedAt: 0,
    total: 0,
    done: 0,
    added: 0,
    merged: 0,
    skipped: 0,
    errors: 0,
    current: '',
    lastError: '',
    debug: '',
  }
  let backfillCancel = false

  function decodeZstdFrames(buffer) {
    const offsets = []
    for (let i = 0; i <= buffer.length - 4; i += 1) {
      if (buffer[i] === 0x28 && buffer[i + 1] === 0xb5 && buffer[i + 2] === 0x2f && buffer[i + 3] === 0xfd) {
        offsets.push(i)
      }
    }
    const chunks = []
    let start = 0
    for (let k = 0; k < offsets.length; k += 1) {
      if (offsets[k] < start) continue
      const end = k + 1 < offsets.length ? offsets[k + 1] : buffer.length
      try {
        chunks.push(zstdDecompressSync(buffer.subarray(start, end)).toString('utf8'))
        start = end
      } catch {
        /* false-positive magic byte pair; extend the slice on the next try */
      }
    }
    return chunks.join('')
  }

  async function listSessionFiles() {
    const root = path.join(dshHome(), 'sessions')
    const files = []
    let workspaces = []
    try {
      workspaces = await readdir(root)
    } catch {
      return files
    }
    for (const workspaceDir of workspaces) {
      const wsPath = path.join(root, workspaceDir)
      let sessions = []
      try {
        sessions = await readdir(wsPath)
      } catch {
        continue
      }
      for (const sessionDir of sessions) {
        const dir = path.join(wsPath, sessionDir)
        let entries = []
        try {
          entries = await readdir(dir)
        } catch {
          continue
        }
        for (const name of entries) {
          if (!name.endsWith('.jsonl') && !name.endsWith('.jsonl.zstd')) continue
          const file = path.join(dir, name)
          try {
            const info = await stat(file)
            files.push({ file, sessionId: sessionDir, mtime: info.mtimeMs })
          } catch {
            /* skip unreadable file */
          }
        }
      }
    }
    files.sort((a, b) => b.mtime - a.mtime)
    return files
  }

  function parseSessionLog(text) {
    let header
    const events = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let parsed
      try {
        parsed = JSON.parse(line)
      } catch {
        continue
      }
      if (!header && parsed.type === 'session') {
        header = parsed
        continue
      }
      events.push(parsed)
    }
    return { header, events }
  }

  function sessionTurns(events) {
    const turns = []
    let current
    for (const event of events) {
      if (event.type === 'turn/start') {
        current = { turn: event.data?.turn, user: [], assistant: [] }
        continue
      }
      if (!current) continue
      if (event.type === 'user/message') {
        if (event.data?.source?.kind !== 'user') continue
        const text = textOf(event.data?.content).trim()
        if (text) current.user.push(text)
      } else if (event.type === 'assistant/message') {
        const text = textOf(event.data?.message?.content).trim()
        if (text) current.assistant.push(text)
      } else if (event.type === 'turn/end') {
        if (event.data?.reason?.kind === 'completed') turns.push(current)
        current = undefined
      }
    }
    return turns
  }

  function backfillPrompt(transcript) {
    return [
      '你在整理用户过去的对话记录，从中提炼值得长期记住的稳定事实。',
      '下面是同一会话里最近的若干轮对话（用户 / 助手）。',
      '输出 JSON 数组，最多 6 条：{"scope":"global|workspace","text":"...","tags":["..."]}',
      '规则：只记录跨会话仍有价值的事实（偏好、身份、项目约定、命令、技术决定、踩过的坑）；',
      '忽略临时任务进度、一次性输出和寒暄；每条一句话、不超过 80 字；没有就给 []。',
      '只输出 JSON，不要解释。',
      '',
      '【会话】',
      transcript,
    ].join('\n')
  }

  async function runBackfill(maxSessions) {
    backfill.running = true
    backfillCancel = false
    Object.assign(backfill, {
      startedAt: Date.now(),
      finishedAt: 0,
      total: 0,
      done: 0,
      added: 0,
      merged: 0,
      skipped: 0,
      errors: 0,
      current: '',
      lastError: '',
      debug: '',
    })
    try {
      const route = diaryRoute()
      if (!route) {
        backfill.lastError = '没有可用的模型路由'
        return
      }
      const files = await listSessionFiles()
      const selected = files.slice(0, Math.max(1, Math.min(300, Number(maxSessions) || 40)))
      backfill.total = selected.length
      for (const item of selected) {
        if (backfillCancel) break
        backfill.current = item.sessionId.replace(/^session-/, '').slice(0, 8)
        try {
          const buffer = await readFile(item.file)
          const text = item.file.endsWith('.zstd') ? decodeZstdFrames(buffer) : buffer.toString('utf8')
          const { header, events } = parseSessionLog(text)
          if (header?.origin === 'subagent') {
            backfill.skipped += 1
            continue
          }
          const workspace = normalizeCwd(header?.cwd || '')
          if (!workspace || workspaceDisabled(workspace)) {
            backfill.skipped += 1
            continue
          }
          const turns = sessionTurns(events).slice(-10)
          if (turns.length === 0) {
            backfill.skipped += 1
            continue
          }
          const transcript = turns
            .map(turn => `用户：${clip(turn.user.join(' '), 600)}\n助手：${clip(turn.assistant.join(' '), 600)}`)
            .join('\n\n')
          if (transcript.length < 40) {
            backfill.skipped += 1
            continue
          }
          const raw = await complete(backfillPrompt(transcript), route, { maxTokens: 2400, temperature: 0.2, onUsage: usage => recordUsage(usage.inputTokens, usage.outputTokens) })
          if (!raw.trim()) throw new Error('模型没有返回文本（token 预算可能被推理占满）')
          const candidates = parseCandidates(raw, 6)
          backfill.debug = `turns=${turns.length} transcript=${transcript.length} raw=${JSON.stringify(String(raw).slice(0, 100))}`
          const last = turns[turns.length - 1]
          for (const candidate of candidates) {
            const scope = candidate.scope === 'workspace' ? 'workspace' : 'global'
            const result = mergeCandidate(
              state.entries,
              {
                text: candidate.text,
                scope,
                tags: candidate.tags,
                workspace,
                origin: {
                  sessionId: item.sessionId,
                  turn: last.turn,
                  at: item.mtime,
                  user: last.user.join(' '),
                  assistant: last.assistant.join(' '),
                },
              },
              Date.now(),
              'backfill',
            )
            if (result.action === 'added') backfill.added += 1
            else backfill.merged += 1
          }
          prune(state.entries, MAX_ENTRIES)
          await persist()
        } catch (error) {
          backfill.errors += 1
          backfill.lastError = String(error?.message || error).slice(0, 200)
        } finally {
          backfill.done += 1
        }
      }
    } finally {
      backfill.running = false
      backfill.finishedAt = Date.now()
      backfill.current = ''
    }
  }

  const apiHandler = async (req, res) => {
    let diaryResult
    let weeklyResult
    let personaResult
    let settingsResult
    try {
      const requestUrl = new URL(req.url || '/', 'http://local')
      const exportKind = requestUrl.searchParams.get('export')
      if (exportKind === 'markdown' || exportKind === 'json') {
        const body = exportKind === 'markdown' ? exportMarkdown() : JSON.stringify(exportJson(), null, 2)
        res.writeHead(200, {
          'content-type': exportKind === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="dsh-long-memory-${dayKey()}.${exportKind === 'markdown' ? 'md' : 'json'}"`,
          'cache-control': 'no-store',
        })
        res.end(body)
        return
      }
      const memeDate = requestUrl.searchParams.get('meme')
      if (memeDate) {
        const entry = diary.entries.find(item => item.date === memeDate)
        if (!entry || !entry.memePath) {
          res.writeHead(404, { 'content-type': 'text/plain' })
          res.end('no meme')
          return
        }
        try {
          const bytes = await readFile(entry.memePath)
          const ext = path.extname(entry.memePath).toLowerCase()
          const type =
            ext === '.png'
              ? 'image/png'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.webp'
                  ? 'image/webp'
                  : ext === '.svg'
                    ? 'image/svg+xml'
                    : 'image/jpeg'
          res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' })
          res.end(bytes)
        } catch {
          res.writeHead(404)
          res.end()
        }
        return
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        if (body?.action === 'forget') {
          const index = state.entries.findIndex(entry => entry.id === body.id)
          if (index >= 0) {
            moveToTrash(state.entries[index])
            state.entries.splice(index, 1)
            await persist()
            await persistTrash()
          }
        } else if (body?.action === 'trash-restore') {
          const id = String(body.id || '')
          const index = trash.findIndex(item => item.entry.id === id)
          if (index < 0) {
            settingsResult = { ok: false, reason: '回收站里没有这条' }
          } else if (state.entries.some(entry => entry.id === id)) {
            settingsResult = { ok: false, reason: '记忆里已经存在同名条目' }
          } else {
            state.entries.push(trash[index].entry)
            trash.splice(index, 1)
            await persist()
            await persistTrash()
            settingsResult = { ok: true }
          }
        } else if (body?.action === 'trash-empty') {
          trash.length = 0
          await persistTrash()
          settingsResult = { ok: true }
        } else if (body?.action === 'settings-save') {
          const input = body.settings || {}
          if (typeof input.auto === 'boolean') settings.auto = input.auto
          if (input.everyTurns !== undefined) settings.everyTurns = clampEveryTurns(input.everyTurns)
          if (typeof input.onlyUser === 'boolean') settings.onlyUser = input.onlyUser
          if (input.priceInput !== undefined) settings.priceInput = Math.max(0, Number(input.priceInput) || 0)
          if (input.priceOutput !== undefined) settings.priceOutput = Math.max(0, Number(input.priceOutput) || 0)
          await persistSettings()
          settingsResult = { ok: true }
        } else if (body?.action === 'save') {
          const text = cleanText(String(body?.text ?? ''), 240)
          const scope = body?.scope === 'workspace' ? 'workspace' : 'global'
          const workspace = normalizeCwd(body?.workspace || '')
          if (text && (scope === 'global' || workspace)) {
            const result = mergeCandidate(
              state.entries,
              { text, scope, tags: [], workspace },
              Date.now(),
              'panel',
            )
            if (result.action === 'added') prune(state.entries, MAX_ENTRIES)
            await persist()
          }
        } else if (body?.action === 'diary') {
          diaryResult = await ensureDiary(Boolean(body.force))
        } else if (body?.action === 'weekly') {
          weeklyResult = await ensureWeekly(Boolean(body.force))
        } else if (body?.action === 'persona-save') {
          personaResult = savePersona(body.persona || body)
          if (personaResult.ok) await persistPersonas()
        } else if (body?.action === 'persona-delete') {
          personaResult = deletePersona(String(body.id || ''))
          if (personaResult.ok) await persistPersonas()
        } else if (body?.action === 'persona-activate') {
          const id = String(body.id || '')
          if (personaList().some(item => item.id === id)) {
            personas.activeId = id
            personaResult = { ok: true }
            await persistPersonas()
          } else {
            personaResult = { ok: false, reason: '没有这个人格' }
          }
        } else if (body?.action === 'workspace-toggle') {
          const key = normalizeCwd(String(body.path || ''))
          if (key) {
            const disabled = Boolean(body.disabled)
            const set = new Set(settings.disabledWorkspaces)
            if (disabled) set.add(key)
            else set.delete(key)
            settings.disabledWorkspaces = [...set]
            await persistSettings()
            settingsResult = { ok: true }
          } else {
            settingsResult = { ok: false, reason: '缺少工作区路径' }
          }
        } else if (body?.action === 'update') {
          const id = String(body.id || '')
          const entry = state.entries.find(item => item.id === id)
          if (!entry) {
            settingsResult = { ok: false, reason: '没有这条记忆' }
          } else {
            const text = typeof body.text === 'string' ? cleanText(body.text, 300) : entry.text
            const scope =
              body.scope === 'workspace' ? 'workspace' : body.scope === 'global' ? 'global' : entry.scope
            const workspace =
              scope === 'workspace' ? normalizeCwd(String(body.workspace || entry.workspace || '')) : ''
            if (scope === 'workspace' && !workspace) {
              settingsResult = { ok: false, reason: '工作区记忆需要填写目录' }
            } else if (!text) {
              settingsResult = { ok: false, reason: '内容不能为空' }
            } else {
              entry.text = text
              entry.scope = scope
              entry.workspace = workspace
              if (Array.isArray(body.tags)) {
                entry.tags = body.tags
                  .map(tag => cleanText(String(tag), 20))
                  .filter(Boolean)
                  .slice(0, 6)
              }
              entry.updatedAt = Date.now()
              entry.lastUsedAt = Date.now()
              entry.archived = false
              await persist()
              settingsResult = { ok: true, id }
            }
          }
        } else if (body?.action === 'import') {
          const payload = body.payload
          const list = Array.isArray(payload?.entries)
            ? payload.entries
            : Array.isArray(payload)
              ? payload
              : []
          if (list.length === 0) {
            settingsResult = { ok: false, reason: '文件里没有记忆条目' }
          } else {
            const known = new Set(state.entries.map(entry => entry.id))
            let added = 0
            let skipped = 0
            for (const raw of list.slice(0, 2000)) {
              const text = cleanText(String(raw?.text || ''), 300)
              if (!text || (raw?.id && known.has(String(raw.id)))) {
                skipped += 1
                continue
              }
              const scope = raw?.scope === 'workspace' ? 'workspace' : 'global'
              const workspace = scope === 'workspace' ? normalizeCwd(String(raw.workspace || '')) : ''
              if (scope === 'workspace' && !workspace) {
                skipped += 1
                continue
              }
              const now = Date.now()
              state.entries.push({
                id: raw?.id ? String(raw.id) : `${now}-${Math.random().toString(36).slice(2, 8)}`,
                scope,
                workspace,
                text,
                tags: Array.isArray(raw?.tags)
                  ? raw.tags.map(tag => cleanText(String(tag), 20)).filter(Boolean).slice(0, 6)
                  : [],
                createdAt: Number(raw?.createdAt) || now,
                updatedAt: Number(raw?.updatedAt) || now,
                lastUsedAt: Number(raw?.lastUsedAt) || now,
                weight: Number(raw?.weight) || 1,
                archived: Boolean(raw?.archived),
                hits: Number(raw?.hits) || 0,
                source: 'import',
                origins: Array.isArray(raw?.origins) ? raw.origins.slice(-5) : [],
              })
              if (raw?.id) known.add(String(raw.id))
              added += 1
            }
            prune(state.entries, MAX_ENTRIES)
            await persist()
            settingsResult = { ok: true, added, skipped }
          }
        } else if (body?.action === 'merge-memories') {
          const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
          const group = state.entries.filter(entry => ids.includes(entry.id))
          if (group.length < 2) {
            settingsResult = { ok: false, reason: '至少选择两条记忆' }
          } else if (new Set(group.map(entry => `${entry.scope}:${entry.workspace}`)).size > 1) {
            settingsResult = { ok: false, reason: '只能合并同范围、同工作区的记忆' }
          } else {
            const keep = group.reduce((a, b) => (b.text.length > a.text.length ? b : a))
            keep.tags = [...new Set(group.flatMap(entry => entry.tags || []))].slice(0, 6)
            keep.hits = group.reduce((sum, entry) => sum + (entry.hits || 0), 0)
            keep.updatedAt = Math.max(...group.map(entry => entry.updatedAt || 0))
            keep.lastUsedAt = Date.now()
            keep.origins = group.flatMap(entry => entry.origins || []).slice(-5)
            const remove = new Set(group.filter(entry => entry.id !== keep.id).map(entry => entry.id))
            state.entries = state.entries.filter(entry => !remove.has(entry.id))
            await persist()
            settingsResult = { ok: true, id: keep.id }
          }
        } else if (body?.action === 'archive-memories') {
          const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
          const archived = Boolean(body.archived)
          let count = 0
          for (const entry of state.entries) {
            if (!ids.includes(entry.id)) continue
            entry.archived = archived
            entry.lastUsedAt = Date.now()
            count += 1
          }
          if (count) await persist()
          settingsResult = { ok: true, count }
        } else if (body?.action === 'diary-update') {
          const date = String(body.date || '')
          const entry = diary.entries.find(item => item.date === date)
          if (!entry) {
            settingsResult = { ok: false, reason: '没有这篇日记' }
          } else {
            if (typeof body.diary === 'string') entry.diary = cleanText(body.diary, 2000)
            if (typeof body.fish === 'string') entry.fish = cleanText(body.fish, 200)
            entry.updatedAt = Date.now()
            await persistDiary()
            settingsResult = { ok: true }
          }
        } else if (body?.action === 'backfill-start') {
          if (!backfill.running) {
            void runBackfill(Number(body.maxSessions) || 40).catch(error =>
              warn('[long-memory] backfill crashed:', error),
            )
            settingsResult = { ok: true, started: true }
          } else {
            settingsResult = { ok: false, reason: '回填正在进行中' }
          }
        } else if (body?.action === 'backfill-cancel') {
          backfillCancel = true
          settingsResult = { ok: true }
        }
      }
      const payloadObject = await panelPayload()
      if (diaryResult) payloadObject.diaryResult = diaryResult
      if (weeklyResult) payloadObject.weeklyResult = weeklyResult
      if (personaResult) payloadObject.personaResult = personaResult
      if (settingsResult) payloadObject.settingsResult = settingsResult
      const payload = JSON.stringify(payloadObject)
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(payload)
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }))
    }
  }

  // `webServer` may appear after this plugin activates, so wait for the service
  // instead of probing once at apply time. The disposer is owned by this plugin's
  // effect so a reload removes the previous route instead of leaving it stale.
  let disposeRoute
  const registerRoute = webCtx => {
    try {
      disposeRoute = webCtx.webServer.register({
        kind: 'exact',
        path: '/dsh-long-memory/data',
        handler: apiHandler,
      })
    } catch (error) {
      warn('[long-memory] failed to register the panel route:', error)
    }
  }

  ctx.effect(() => () => {
    try {
      disposeRoute?.()
    } catch {
      /* already gone */
    }
    disposeRoute = undefined
  })

  const direct = ctx.get('webServer')
  if (direct && typeof direct.register === 'function') {
    registerRoute({ webServer: direct })
  } else {
    ctx.inject(['webServer'], registerRoute)
  }

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
  loadDiary().catch(error => warn('[long-memory] diary load crashed:', error))
  loadPersonas().catch(error => warn('[long-memory] persona load crashed:', error))
  loadSettings().catch(error => warn('[long-memory] settings load crashed:', error))
  loadTrash().catch(error => warn('[long-memory] trash load crashed:', error))
  loadReports().catch(error => warn('[long-memory] reports load crashed:', error))
  loadUsage().catch(error => warn('[long-memory] usage load crashed:', error))
}
