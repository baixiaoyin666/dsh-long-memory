import assert from 'node:assert/strict'
import {
  buildBrief,
  cleanText,
  mergeCandidate,
  normalizeCwd,
  parseCandidates,
  prune,
  similarity,
} from '../lib/memory.js'

// --- normalizeCwd -----------------------------------------------------------
assert.equal(normalizeCwd('E:\\Work\\Demo\\'), 'e:/work/demo')
assert.equal(normalizeCwd('/home/u/proj//'), '/home/u/proj')
assert.equal(normalizeCwd(''), '')

// --- cleanText --------------------------------------------------------------
assert.equal(cleanText('  - 用户 喜欢  深色模式 '), '用户 喜欢 深色模式')
assert.ok(cleanText('x'.repeat(100), 10).endsWith('…'))

// --- similarity -------------------------------------------------------------
assert.ok(similarity('用户喜欢深色模式', '用户偏好深色模式') > 0.5)
assert.ok(similarity('pnpm workspace project', 'pnpm workspace project') === 1)
assert.ok(similarity('完全不同的内容', 'unrelated english words') < 0.2)

// --- parseCandidates --------------------------------------------------------
const fenced = '```json\n[{"scope":"global","text":"用户偏好中文回答","tags":["语言"]}]\n```'
const parsed = parseCandidates(fenced)
assert.equal(parsed.length, 1)
assert.equal(parsed[0].scope, 'global')
assert.equal(parsed[0].text, '用户偏好中文回答')

assert.deepEqual(parseCandidates('没有值得记住的'), [])
assert.equal(parseCandidates('[{"text":"a"}]').length, 0, 'too short is dropped')
assert.equal(parseCandidates(JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ text: `记忆条目编号${i}内容` })))).length, 3)

// --- mergeCandidate ---------------------------------------------------------
const entries = []
const first = mergeCandidate(entries, { text: '这个项目使用 pnpm', scope: 'workspace', workspace: 'E:\\Demo' }, 1000)
assert.equal(first.action, 'added')
const second = mergeCandidate(entries, { text: '这个项目使用 pnpm。', scope: 'workspace', workspace: 'e:/demo' }, 2000)
assert.equal(second.action, 'merged')
assert.equal(entries.length, 1)
assert.equal(entries[0].updatedAt, 2000)
assert.equal(entries[0].hits, 1)

const otherScope = mergeCandidate(entries, { text: '这个项目使用 pnpm', scope: 'global' }, 3000)
assert.equal(otherScope.action, 'added', 'same text in another scope stays separate')

// --- prune ------------------------------------------------------------------
const many = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, text: `t${i}`, scope: 'global', updatedAt: i }))
const dropped = prune(many, 4)
assert.equal(dropped, 6)
assert.deepEqual(many.map(entry => entry.id), ['m6', 'm7', 'm8', 'm9'])

// --- buildBrief -------------------------------------------------------------
assert.equal(buildBrief([], 'E:\\Demo'), '')
const pool = [
  { scope: 'global', text: '用户偏好中文回答', updatedAt: 5 },
  { scope: 'workspace', workspace: 'e:/demo', text: '该项目使用 pnpm 与 vitest', updatedAt: 4 },
  { scope: 'workspace', workspace: 'e:/other', text: '别的项目事实', updatedAt: 3 },
]
const brief = buildBrief(pool, 'E:\\Demo')
assert.ok(brief.includes('用户偏好中文回答'))
assert.ok(brief.includes('该项目使用 pnpm 与 vitest'))
assert.ok(!brief.includes('别的项目事实'))
assert.ok(brief.startsWith('## 长期记忆'))

const longPool = Array.from({ length: 40 }, (_, i) => ({ scope: 'global', text: `记忆事实编号${i}`.padEnd(120, '内容'), updatedAt: 1000 - i }))
const capped = buildBrief(longPool, '', 500)
assert.ok(capped.length <= 500)
assert.ok(capped.includes('另有'))

console.log('memory.js tests passed')
