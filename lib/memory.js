/**
 * Pure memory-store logic for dsh-long-memory.
 * No DSH imports: everything here is plain JSON in, plain JSON out, so it can
 * be unit-tested without a Harness.
 */

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/** Normalize a working directory into a stable workspace key. */
export function normalizeCwd(cwd) {
  if (typeof cwd !== 'string') return ''
  const trimmed = cwd.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Collapse whitespace, strip list markers, cap length. */
export function cleanText(text, max = 300) {
  if (typeof text !== 'string') return ''
  let out = text.replace(/\s+/g, ' ').trim()
  out = out.replace(/^[-*•]\s+/, '').trim()
  if (out.length > max) out = `${out.slice(0, max - 1)}…`
  return out
}

/** Shorten for display without breaking surrogate pairs more than necessary. */
export function clip(text, max) {
  if (typeof text !== 'string') return ''
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

const REDACTED = '[已脱敏]'

/** Credential / personal-number patterns that must never be stored verbatim. */
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, () => REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, () => REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, () => REDACTED],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, () => REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, () => REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, () => REDACTED],
  [/\b\d{17}[\dXx]\b/g, () => REDACTED],
  [/\b1[3-9]\d{9}\b/g, () => REDACTED],
  [/(密码|口令|password|passwd|pwd)\s*[:：=]\s*\S+/gi, (match, key) => `${key}: ${REDACTED}`],
]

/**
 * Mask secrets in one string. Returns the scrubbed text and how many spans were
 * replaced, so the caller can log or surface it.
 */
export function scrub(text) {
  let out = String(text ?? '')
  let redactions = 0
  for (const [pattern, replace] of SECRET_PATTERNS) {
    out = out.replace(pattern, (...args) => {
      const replaced = replace(...args)
      if (replaced !== args[0]) redactions += 1
      return replaced
    })
  }
  return { text: out, redactions }
}


/**
 * Token set for similarity: latin words plus CJK character bigrams, so short
 * Chinese sentences still compare meaningfully.
 */
export function tokenSet(text) {
  const lower = String(text).toLowerCase()
  const words = lower
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && /[a-z0-9]/.test(word))
  const cjk = lower.replace(/[^\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g, '')
  const grams = []
  for (let i = 0; i < cjk.length - 1; i += 1) grams.push(cjk.slice(i, i + 2))
  return new Set([...words, ...grams])
}

/**
 * Overlap similarity of two texts, 0..1: the larger of Jaccard similarity and
 * containment (shared / smaller set). Containment lets a restated or extended
 * sentence merge into the original without letting unrelated facts collide.
 */
export function similarity(a, b) {
  const left = tokenSet(a)
  const right = tokenSet(b)
  if (left.size === 0 || right.size === 0) {
    return normalizeForCompare(a) === normalizeForCompare(b) ? 1 : 0
  }
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  const jaccard = shared / (left.size + right.size - shared)
  const containment = shared / Math.min(left.size, right.size)
  return Math.max(jaccard, containment)
}

function normalizeForCompare(text) {
  return String(text).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

/** True when `b` restates `a` closely enough to merge instead of append. */
export function isDuplicate(a, b) {
  if (normalizeForCompare(a) === normalizeForCompare(b)) return true
  return similarity(a, b) >= 0.82
}

/**
 * Parse the extractor's reply into validated candidates.
 * Tolerates code fences and leading prose; anything unparseable yields [].
 */
export function parseCandidates(raw, max = 3) {
  if (typeof raw !== 'string') return []
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const text = cleanText(item.text, 240)
    if (text.length < 4) continue
    const scope = item.scope === 'workspace' ? 'workspace' : 'global'
    const tags = Array.isArray(item.tags)
      ? item.tags
          .filter(tag => typeof tag === 'string')
          .map(tag => cleanText(tag, 24))
          .filter(Boolean)
          .slice(0, 5)
      : []
    out.push({ scope, text, tags })
    if (out.length >= max) break
  }
  return out
}

export function newId(now = Date.now()) {
  return `m-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Insert or merge one candidate. Returns the entry and whether it was merged
 * into an existing row.
 */
export function mergeCandidate(entries, candidate, now, source = 'auto') {
  const text = scrub(cleanText(candidate.text, 300)).text
  const scope = candidate.scope === 'workspace' ? 'workspace' : 'global'
  const workspace = scope === 'workspace' ? normalizeCwd(candidate.workspace) : ''
  const tags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean) : []
  const origin = normalizeOrigin(candidate.origin, now)

  const hit = entries.find(
    entry =>
      entry.scope === scope &&
      (scope === 'global' || entry.workspace === workspace) &&
      isDuplicate(entry.text, text),
  )

  if (hit) {
    hit.updatedAt = now
    hit.lastUsedAt = now
    hit.hits = (hit.hits || 0) + 1
    hit.weight = Math.min(5, Number(hit.weight || 1) + 0.3)
    hit.archived = false
    if (text.length > hit.text.length) hit.text = text
    const merged = new Set([...(hit.tags || []), ...tags])
    hit.tags = [...merged].slice(0, 6)
    if (origin) {
      const origins = Array.isArray(hit.origins) ? hit.origins : []
      const key = `${origin.sessionId}:${origin.turn}`
      if (!origins.some(item => `${item.sessionId}:${item.turn}` === key)) {
        origins.push(origin)
        if (origins.length > 5) origins.splice(0, origins.length - 5)
      }
      hit.origins = origins
    }
    return { action: 'merged', entry: hit }
  }

  const entry = {
    id: newId(now),
    scope,
    workspace,
    text,
    tags,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    weight: 1,
    archived: false,
    hits: 0,
    source,
    origins: origin ? [origin] : [],
  }
  entries.push(entry)
  return { action: 'added', entry }
}

/** Keep one captured conversation excerpt small enough to persist per row. */
function normalizeOrigin(origin, now) {
  if (!origin || typeof origin !== 'object') return undefined
  const user = scrub(clip(String(origin.user || ''), 2000)).text
  const assistant = scrub(clip(String(origin.assistant || ''), 2000)).text
  if (!user && !assistant) return undefined
  return {
    sessionId: String(origin.sessionId || ''),
    turn: Number(origin.turn) || 0,
    at: Number(origin.at) || now,
    user,
    assistant,
  }
}

/** Keep the store bounded: drop the least recently touched rows first. */
export function prune(entries, max = 500) {
  if (entries.length <= max) return 0
  const ordered = [...entries].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
  const drop = new Set(ordered.slice(0, entries.length - max).map(entry => entry.id))
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (drop.has(entries[i].id)) entries.splice(i, 1)
  }
  return drop.size
}

const SCOPE_TAG = { global: '全局', workspace: '项目' }

/**
 * Build the prompt-context digest: global facts plus this workspace's facts,
 * newest first, under a character budget. Empty string when nothing applies.
 */
export function buildBrief(entries, cwd, maxChars = 1400) {
  if (!Array.isArray(entries) || entries.length === 0) return ''
  const workspace = normalizeCwd(cwd)
  const global = entries.filter(entry => entry.scope === 'global' && !entry.archived)
  const local = workspace
    ? entries.filter(entry => entry.scope === 'workspace' && entry.workspace === workspace && !entry.archived)
    : []
  if (global.length === 0 && local.length === 0) return ''

  const newest = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  const picked = [...global.sort(newest).slice(0, 8), ...local.sort(newest).slice(0, 10)]
  const total = global.length + local.length

  const header = [
    '## 长期记忆（跨会话）',
    '以下是从过往会话中提炼并保存的事实，与本轮相关时参考；不要向用户复述这段清单。',
  ].join('\n')
  const footerFull = '\n（可用 memory_search 检索、memory_save 补充、memory_forget 删除。）'

  const lines = []
  let used = header.length
  const budget = maxChars - 220
  for (const entry of picked) {
    const line = `- [${SCOPE_TAG[entry.scope] || '全局'}] ${clip(entry.text, 160)}`
    if (used + line.length + 1 > budget) break
    lines.push(line)
    used += line.length + 1
  }
  if (lines.length === 0) return ''

  const hidden = total - lines.length
  let footer = footerFull
  if (hidden > 0) footer = `\n（另有 ${hidden} 条未展示；可用 memory_search 检索，memory_save 补充，memory_forget 删除。）`
  if (used + footer.length > maxChars) footer = ''

  return `${header}\n${lines.join('\n')}${footer}`
}
