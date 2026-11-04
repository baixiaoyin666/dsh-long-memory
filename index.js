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
      personas: { activeId: personas.activeId, list: personaList() },
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

  // ---- personas: built-in popular archetypes plus user-defined ones -------

  const personaFile = path.join(dataDir, 'personas.json')
  const BUILTIN_PERSONAS = [
    {
      id: 'dafiyu',
      name: '大肥鱼',
      emoji: '🐟',
      summary: '懒懒的蓝色胖鱼，爱魔方、零食和打盹，说话软软地碎碎念。',
      prompt: '你是一条懒懒的蓝色胖鱼，爱玩魔方、爱吃零食、爱打盹，说话软软的，喜欢碎碎念，偶尔撒个娇。',
      builtin: true,
    },
    {
      id: 'tsundere-cat',
      name: '傲娇猫娘',
      emoji: '🐱',
      summary: '嘴硬心软，嘴上嫌弃，其实一直陪着。',
      prompt: '你是一只傲娇的猫娘，嘴上喜欢嫌弃和吐槽，其实很关心用户，被夸会害羞，说话带一点点尾音。',
      builtin: true,
    },
    {
      id: 'gentle-senpai',
      name: '温柔学姐',
      emoji: '🌷',
      summary: '耐心温柔，会肯定努力，也会提醒休息。',
      prompt: '你是一位温柔的学姐，说话耐心、轻声细语，会肯定用户的努力，并温柔地提醒他休息和吃饭。',
      builtin: true,
    },
    {
      id: 'sharp-butler',
      name: '毒舌管家',
      emoji: '🎩',
      summary: '礼貌得体，吐槽一针见血，刀子嘴豆腐心。',
      prompt: '你是一位举止得体的管家，用词客气但吐槽精准一针见血，刀子嘴豆腐心，最后总会默默帮忙。',
      builtin: true,
    },
    {
      id: 'cyber-hacker',
      name: '赛博黑客',
      emoji: '🛰️',
      summary: '极客冷幽默，三句话不离系统和数据。',
      prompt: '你是一个赛博朋克风格的黑客，说话简短、冷幽默，喜欢用系统、数据、日志之类的比喻，偶尔冒一句命令行梗。',
      builtin: true,
    },
    {
      id: 'zen-monk',
      name: '佛系禅师',
      emoji: '🍵',
      summary: '平静克制，话短，带一点禅意。',
      prompt: '你是一位佛系禅师，说话平静克制、句子短，带一点禅意，不催促，只陪用户把今天放下。',
      builtin: true,
    },
  ]

  const personas = { activeId: 'dafiyu', custom: [] }

  function personaList() {
    return [...BUILTIN_PERSONAS, ...personas.custom]
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
            summary: String(item.summary || '').slice(0, 120),
            prompt: String(item.prompt || '').slice(0, 600),
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
    const id = String(input?.id || '')
    if (id) {
      const existing = personas.custom.find(item => item.id === id)
      if (!existing) return { ok: false, reason: '内置人格不能修改，可复制后再改' }
      Object.assign(existing, { name, prompt, emoji, summary })
      personas.activeId = id
    } else {
      const created = {
        id: `p-${Date.now().toString(36)}`,
        name,
        emoji,
        summary,
        prompt,
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
      '根据下面今天记录到的事实，用这个角色的口吻替用户写一篇第一人称的简短日记（120–200 字），语气生活化。',
      '',
      '严格按下面三行格式输出，不要 JSON、不要代码块、不要解释：',
      `FISH: ${persona.name} 自己的一句情绪留言，20–40 字，符合角色设定`,
      'HABITS: 习惯1 | 习惯2（最多 2 条从今天观察到的用户日常习惯，稳定可复用，不是一次性任务；没有就留空）',
      'DIARY:',
      '（这里写日记正文，可以分 2–3 句）',
      '',
      `【日期】${dayKey()}`,
      '【今天的事实】',
      ...items.map((item, index) => `${index + 1}. [${item.scope === 'global' ? '全局' : '项目'}] ${item.text}`),
    ].join('\n')
  }

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

    // Preferred form: FISH: … / HABITS: … / DIARY: …
    const fishMatch = source.match(/^[ \t]*FISH[ \t]*[:：][ \t]*(.+)$/im)
    const habitsMatch = source.match(/^[ \t]*HABITS[ \t]*[:：][ \t]*(.*)$/im)
    const diaryAt = source.search(/^[ \t]*DIARY[ \t]*[:：]/im)

    let body
    if (diaryAt >= 0) {
      body = source.slice(diaryAt).replace(/^[ \t]*DIARY[ \t]*[:：][ \t]*/i, '')
    } else {
      body = source
        .split(/\r?\n/)
        .filter(line => !/^[ \t]*(FISH|HABITS)[ \t]*[:：]/i.test(line))
        .join('\n')
    }
    body = cleanText(body, 1200)

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
      const raw = await complete(buildDiaryPrompt(today.slice(-20), persona), route, { maxTokens: 2200, temperature: 0.7 })
      const parsed = parseDiary(raw)
      const entry = {
        date,
        diary: parsed.diary,
        fish: parsed.fish,
        habits: parsed.habits,
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

  const apiHandler = async (req, res) => {
    let diaryResult
    let personaResult
    try {
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        if (body?.action === 'forget') {
          const index = state.entries.findIndex(entry => entry.id === body.id)
          if (index >= 0) {
            state.entries.splice(index, 1)
            await persist()
          }
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
        }
      }
      const payloadObject = await panelPayload()
      if (diaryResult) payloadObject.diaryResult = diaryResult
      if (personaResult) payloadObject.personaResult = personaResult
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
}
