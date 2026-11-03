/**
 * Client half of dsh-long-memory.
 *
 * Registers two surfaces: a settings page (Settings → Long-term memory) and a
 * collapsible bar above the composer, so the store can be inspected without
 * leaving the conversation. Both read `/dsh-long-memory/api`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-long-memory',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const API = '/dsh-long-memory/data'

    const C = {
      ink: 'var(--dsw-alias-label-primary)',
      sub: 'var(--dsw-alias-label-secondary)',
      faint: 'var(--dsw-alias-label-tertiary)',
      line: 'var(--dsw-alias-border-l1)',
      card: 'var(--dsw-alias-bg-layer-1)',
      soft: 'var(--dsw-alias-bg-layer-2)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      err: 'var(--dsw-alias-state-error-primary)',
    }

    const LEVEL_COLOR = { ok: C.ok, warn: C.warn, error: C.err, info: C.sub }

    function relTime(ts) {
      if (!ts) return '—'
      const diff = Date.now() - ts
      if (diff < 60000) return '刚刚'
      const minutes = Math.floor(diff / 60000)
      if (minutes < 60) return `${minutes} 分钟前`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours} 小时前`
      const days = Math.floor(hours / 24)
      if (days < 30) return `${days} 天前`
      return `${Math.floor(days / 30)} 个月前`
    }

    function shortSession(id) {
      const bare = String(id || '').replace(/^session-/, '')
      return bare ? `${bare.slice(0, 8)}…${bare.slice(-4)}` : '—'
    }

    async function readJson(response) {
      const text = await response.text()
      if (!text) throw new Error(`HTTP ${response.status}：响应为空（面板路由未注册）`)
      try {
        return JSON.parse(text)
      } catch {
        throw new Error(`HTTP ${response.status}：返回的不是 JSON ${text.slice(0, 80)}`)
      }
    }

    async function fetchPanel() {
      let lastError
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(`${API}?t=${Date.now()}`, {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
          const data = await readJson(response)
          if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`)
          return data
        } catch (error) {
          lastError = error
          await new Promise(resolve => setTimeout(resolve, 400))
        }
      }
      throw lastError
    }

    function usePanel() {
      const [state, setState] = useState({ status: 'loading', data: null, error: null })

      const load = useCallback(async () => {
        setState(previous => ({ ...previous, status: previous.data ? 'refreshing' : 'loading' }))
        try {
          const data = await fetchPanel()
          setState({ status: 'ready', data, error: null })
        } catch (error) {
          setState(previous => ({
            ...previous,
            status: 'error',
            error: String(error && error.message ? error.message : error),
          }))
        }
      }, [])

      return { state, load }
    }

    function Card(props) {
      return h(
        'div',
        {
          style: {
            background: C.card,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: '12px 14px',
            minWidth: 0,
          },
        },
        h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 6 } }, props.label),
        h('div', { style: { fontSize: 24, fontWeight: 600, lineHeight: 1.1, color: C.ink } }, props.value),
      )
    }

    function Chip(props) {
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            lineHeight: '18px',
            padding: '0 8px',
            borderRadius: 999,
            border: `1px solid ${props.color || C.line}`,
            color: props.color || C.sub,
            whiteSpace: 'nowrap',
          },
        },
        props.children,
      )
    }

    function ErrorBox(props) {
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${C.err}`,
            color: C.err,
            fontSize: 13,
            marginBottom: 12,
          },
        },
        h('span', { style: { flex: 1, wordBreak: 'break-word' } }, `读取失败：${props.error}`),
        h(
          'button',
          {
            type: 'button',
            onClick: props.onRetry,
            style: {
              fontSize: 12,
              color: C.err,
              background: 'transparent',
              border: `1px solid ${C.err}`,
              borderRadius: 8,
              padding: '4px 10px',
              cursor: 'pointer',
              flex: 'none',
            },
          },
          '重试',
        ),
      )
    }

    /** The full dashboard: statistics, health analysis and the memory list. */
    function Panel(props) {
      const { state, load } = usePanel()
      const [query, setQuery] = useState('')
      const [scope, setScope] = useState('all')
      const [busyId, setBusyId] = useState(null)
      const [openId, setOpenId] = useState(null)

      useEffect(() => {
        load()
      }, [load])

      const forget = useCallback(
        async id => {
          setBusyId(id)
          try {
            await fetch(API, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'forget', id }),
            })
            await load()
          } finally {
            setBusyId(null)
          }
        },
        [load],
      )

      const data = state.data
      const analysis = data && data.analysis
      const entries = data && data.entries ? data.entries : []

      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return entries.filter(entry => {
          if (scope !== 'all' && entry.scope !== scope) return false
          if (!needle) return true
          const haystack = `${entry.text} ${(entry.tags || []).join(' ')} ${entry.workspace || ''}`.toLowerCase()
          return haystack.includes(needle)
        })
      }, [entries, query, scope])

      const healthColor = analysis
        ? analysis.health >= 80
          ? C.ok
          : analysis.health >= 50
            ? C.warn
            : C.err
        : C.line

      const busy = state.status === 'loading' || state.status === 'refreshing'

      return h(
        'div',
        { style: { color: C.ink } },

        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 } },
          props.compact ? null : h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, '长期记忆'),
          h(
            'span',
            { style: { fontSize: 12, color: C.faint } },
            data ? `${analysis.total} 条 · 健康度 ${analysis.health}` : 'Long-term memory',
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: load,
              disabled: busy,
              style: {
                marginLeft: 'auto',
                fontSize: 12,
                color: C.sub,
                background: 'transparent',
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: '3px 10px',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              },
            },
            state.status === 'refreshing' ? '刷新中…' : '刷新',
          ),
        ),

        !props.compact
          ? h(
              'p',
              { style: { margin: '0 0 14px', fontSize: 13, color: C.sub, lineHeight: 1.6 } },
              '每轮对话结束后自动提炼的长期事实。全局记忆在所有项目生效，工作区记忆只对对应目录生效；下方可以搜索、过滤和删除。',
            )
          : null,

        state.status === 'error' && !data ? h(ErrorBox, { error: state.error, onRetry: load }) : null,

        state.status === 'loading' && !data
          ? h('div', { style: { fontSize: 13, color: C.sub, padding: '18px 0' } }, '加载中…')
          : null,

        data
          ? h(
              React.Fragment,
              null,

              state.status === 'error' ? h(ErrorBox, { error: state.error, onRetry: load }) : null,

              h(
                'div',
                {
                  style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                    marginBottom: 12,
                  },
                },
                h(Card, { label: '总条数', value: analysis.total }),
                h(Card, { label: '全局', value: analysis.global }),
                h(Card, { label: '工作区', value: analysis.workspace }),
                h(Card, { label: '近 7 天新增', value: analysis.recent7d }),
              ),

              h(
                'div',
                {
                  style: {
                    background: C.card,
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    padding: '14px',
                    marginBottom: 12,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                  h('div', { style: { fontSize: 13, fontWeight: 600 } }, '记忆健康度'),
                  h('div', { style: { fontSize: 18, fontWeight: 600, color: healthColor } }, `${analysis.health}`),
                  h('div', { style: { fontSize: 12, color: C.faint } }, '/ 100'),
                  h(
                    'div',
                    { style: { marginLeft: 'auto', fontSize: 12, color: C.faint } },
                    `平均 ${analysis.avgLength} 字 · ${analysis.stale30d} 条超过 30 天`,
                  ),
                ),
                h(
                  'div',
                  {
                    style: {
                      height: 6,
                      borderRadius: 999,
                      background: C.soft,
                      overflow: 'hidden',
                      marginBottom: 10,
                    },
                  },
                  h('div', {
                    style: { width: `${analysis.health}%`, height: '100%', background: healthColor },
                  }),
                ),
                ...analysis.issues.map((issue, index) =>
                  h(
                    'div',
                    {
                      key: `issue-${index}`,
                      style: { display: 'flex', gap: 8, fontSize: 13, color: C.sub, lineHeight: '21px' },
                    },
                    h('span', {
                      style: {
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: LEVEL_COLOR[issue.level] || C.sub,
                        marginTop: 7,
                        flex: 'none',
                      },
                    }),
                    h('span', null, issue.text),
                  ),
                ),
                analysis.topTags.length
                  ? h(
                      'div',
                      { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 } },
                      analysis.topTags.map(tag => h(Chip, { key: tag.tag }, `${tag.tag} · ${tag.count}`)),
                    )
                  : null,
              ),

              data.lastRun
                ? h(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        fontSize: 12,
                        color: C.sub,
                        marginBottom: 12,
                        flexWrap: 'wrap',
                      },
                    },
                    h(
                      'span',
                      { style: { color: data.lastRun.ok ? C.ok : C.err } },
                      data.lastRun.ok ? '● 上次提炼成功' : '● 上次提炼失败',
                    ),
                    h('span', null, relTime(Date.parse(data.lastRun.at || '') || 0)),
                    data.lastRun.ok
                      ? h(
                          'span',
                          null,
                          `+${data.lastRun.added ?? 0} 新增 / ${data.lastRun.merged ?? 0} 合并 · ${data.lastRun.ms ?? 0} ms`,
                        )
                      : h('span', null, String(data.lastRun.error || '').slice(0, 120)),
                  )
                : null,

              h(
                'div',
                { style: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' } },
                h('input', {
                  value: query,
                  onChange: event => setQuery(event.target.value),
                  placeholder: '搜索记忆内容或标签…',
                  style: {
                    flex: '1 1 220px',
                    fontSize: 13,
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.card,
                    color: C.ink,
                    outline: 'none',
                  },
                }),
                h(
                  'select',
                  {
                    value: scope,
                    onChange: event => setScope(event.target.value),
                    style: {
                      fontSize: 13,
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: C.card,
                      color: C.ink,
                    },
                  },
                  h('option', { value: 'all' }, '全部范围'),
                  h('option', { value: 'global' }, '仅全局'),
                  h('option', { value: 'workspace' }, '仅工作区'),
                ),
              ),

              h(
                'div',
                {
                  style: {
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: C.card,
                  },
                },
                filtered.length === 0
                  ? h(
                      'div',
                      { style: { padding: '24px 14px', textAlign: 'center', fontSize: 13, color: C.sub } },
                      entries.length === 0 ? '还没有任何记忆。' : '没有匹配的记忆。',
                    )
                  : filtered.map((entry, index) => {
                      const open = openId === entry.id
                      const origins = Array.isArray(entry.origins) ? entry.origins : []
                      return h(
                        'div',
                        {
                          key: entry.id,
                          style: {
                            padding: '10px 12px',
                            borderTop: index === 0 ? 'none' : `1px solid ${C.line}`,
                          },
                        },
                        h(
                          'div',
                          { style: { display: 'flex', gap: 10 } },
                          h(
                            'div',
                            { style: { flex: 1, minWidth: 0 } },
                            h(
                              'div',
                              { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 } },
                              h(Chip, { color: entry.scope === 'global' ? C.brand : C.sub }, entry.scope === 'global' ? '全局' : '工作区'),
                              entry.scope === 'workspace' && entry.workspace
                                ? h(
                                    'span',
                                    {
                                      title: entry.workspace,
                                      style: {
                                        fontSize: 11,
                                        color: C.faint,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 260,
                                      },
                                    },
                                    entry.workspace,
                                  )
                                : null,
                              h(
                                'span',
                                { style: { fontSize: 11, color: C.faint, marginLeft: 'auto' } },
                                `${relTime(entry.updatedAt)}${entry.hits ? ` · 命中 ${entry.hits}` : ''}`,
                              ),
                            ),
                            h('div', { style: { fontSize: 13, lineHeight: '20px', wordBreak: 'break-word' } }, entry.text),
                            (entry.tags || []).length
                              ? h(
                                  'div',
                                  { style: { display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' } },
                                  entry.tags.map(tag => h(Chip, { key: tag }, tag)),
                                )
                              : null,
                            h(
                              'button',
                              {
                                type: 'button',
                                onClick: () => setOpenId(open ? null : entry.id),
                                style: {
                                  marginTop: 6,
                                  padding: 0,
                                  fontSize: 11,
                                  color: C.brand,
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                },
                              },
                              open ? '收起对话 ▲' : `查看对话${origins.length ? ` (${origins.length})` : ''} ▼`,
                            ),
                            open
                              ? h(
                                  'div',
                                  {
                                    style: {
                                      marginTop: 8,
                                      paddingTop: 8,
                                      borderTop: `1px dashed ${C.line}`,
                                    },
                                  },
                                  h(
                                    'div',
                                    { style: { fontSize: 11, color: C.faint, marginBottom: 6, lineHeight: '18px' } },
                                    `创建 ${relTime(entry.createdAt)} · 更新 ${relTime(entry.updatedAt)} · 命中 ${entry.hits || 0} 次 · 来源 ${entry.source || 'auto'}`,
                                  ),
                                  entry.workspace
                                    ? h(
                                        'div',
                                        {
                                          style: {
                                            fontSize: 11,
                                            color: C.faint,
                                            marginBottom: 6,
                                            wordBreak: 'break-all',
                                          },
                                        },
                                        `工作区 ${entry.workspace}`,
                                      )
                                    : null,
                                  origins.length === 0
                                    ? h(
                                        'div',
                                        { style: { fontSize: 12, color: C.sub } },
                                        '这条记忆没有保存来源对话（早期记录或手动添加）。',
                                      )
                                    : origins.map((origin, originIndex) =>
                                        h(
                                          'div',
                                          {
                                            key: originIndex,
                                            style: {
                                              background: C.soft,
                                              borderRadius: 8,
                                              padding: '8px 10px',
                                              marginBottom: 6,
                                            },
                                          },
                                          h(
                                            'div',
                                            { style: { fontSize: 11, color: C.faint, marginBottom: 4 } },
                                            `会话 ${shortSession(origin.sessionId)} · 第 ${origin.turn} 轮 · ${relTime(origin.at)}`,
                                          ),
                                          origin.user
                                            ? h(
                                                'div',
                                                {
                                                  style: {
                                                    fontSize: 12,
                                                    lineHeight: '19px',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    marginBottom: 6,
                                                  },
                                                },
                                                h('span', { style: { color: C.brand, fontWeight: 600, marginRight: 6 } }, '用户'),
                                                origin.user,
                                              )
                                            : null,
                                          origin.assistant
                                            ? h(
                                                'div',
                                                {
                                                  style: {
                                                    fontSize: 12,
                                                    lineHeight: '19px',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                  },
                                                },
                                                h('span', { style: { color: C.ok, fontWeight: 600, marginRight: 6 } }, '助手'),
                                                origin.assistant,
                                              )
                                            : null,
                                        ),
                                      ),
                                )
                              : null,
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              disabled: busyId === entry.id,
                              onClick: () => forget(entry.id),
                              title: '删除这条记忆',
                              style: {
                                alignSelf: 'flex-start',
                                fontSize: 12,
                                color: C.err,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                opacity: busyId === entry.id ? 0.4 : 1,
                              },
                            },
                            busyId === entry.id ? '删除中…' : '删除',
                          ),
                        ),
                      )
                    }),
              ),
            )
          : null,
      )
    }

    /** Diary: one quiet entry per day, with habits and the fish's comment. */
    function DiaryView() {
      const [state, setState] = useState({ status: 'loading', data: null, error: null })
      const [busy, setBusy] = useState(false)

      const load = useCallback(async force => {
        setBusy(true)
        try {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'diary', force: Boolean(force) }),
          })
          const data = await fetchPanel()
          setState({ status: 'ready', data, error: null })
        } catch (error) {
          setState({ status: 'error', data: null, error: String(error && error.message ? error.message : error) })
        } finally {
          setBusy(false)
        }
      }, [])

      useEffect(() => {
        load(false)
      }, [load])

      const entries = (state.data && state.data.diary) || []

      return h(
        'div',
        null,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
          h('div', { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, '日常日记'),
          h('div', { style: { fontSize: 12, color: C.faint } }, '自动记录习惯，大肥鱼会在每篇底下留言'),
          h(
            'button',
            {
              type: 'button',
              disabled: busy,
              onClick: () => load(true),
              style: {
                marginLeft: 'auto',
                fontSize: 12,
                color: C.sub,
                background: 'transparent',
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: '3px 10px',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
              },
            },
            busy ? '写着…' : '重写今天',
          ),
        ),

        state.status === 'error' ? h(ErrorBox, { error: state.error, onRetry: () => load(false) }) : null,

        state.data && state.data.diaryResult && state.data.diaryResult.ok === false
          ? h(
              'div',
              { style: { fontSize: 12, color: C.sub, marginBottom: 10 } },
              `这次没有生成新日记：${state.data.diaryResult.reason || '未知原因'}`,
            )
          : null,

        entries.length === 0
          ? h(
              'div',
              {
                style: {
                  padding: '24px 16px',
                  borderRadius: 12,
                  border: `1px dashed ${C.line}`,
                  textAlign: 'center',
                  fontSize: 13,
                  color: C.sub,
                },
              },
              '还没有日记。今天先聊几句，日记会自动写出来；也可以点右上角「重写今天」。',
            )
          : entries.map(entry =>
              h(
                'div',
                {
                  key: entry.date,
                  style: {
                    border: `1px solid ${C.line}`,
                    borderRadius: 12,
                    background: C.card,
                    padding: '14px 16px',
                    marginBottom: 12,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 } },
                  h('div', { style: { fontSize: 15, fontWeight: 600, color: C.ink } }, entry.date),
                  h('div', { style: { fontSize: 11, color: C.faint } }, `更新于 ${relTime(entry.updatedAt)}`),
                ),
                h(
                  'div',
                  {
                    style: {
                      fontSize: 13,
                      lineHeight: '22px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: C.ink,
                      marginBottom: 10,
                    },
                  },
                  entry.diary,
                ),
                entry.fish
                  ? h(
                      'div',
                      {
                        style: {
                          display: 'flex',
                          gap: 8,
                          alignItems: 'flex-start',
                          background: C.soft,
                          borderRadius: 10,
                          padding: '8px 12px',
                          marginBottom: 8,
                        },
                      },
                      h('span', { style: { fontSize: 18, lineHeight: '20px' } }, '🐟'),
                      h(
                        'div',
                        null,
                        h('div', { style: { fontSize: 11, color: C.faint, marginBottom: 2 } }, '大肥鱼的留言'),
                        h('div', { style: { fontSize: 13, lineHeight: '20px', color: C.ink } }, entry.fish),
                      ),
                    )
                  : null,
                (entry.habits || []).length
                  ? h(
                      'div',
                      { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                      entry.habits.map((habit, index) => h(Chip, { key: `${entry.date}-${index}` }, habit.text)),
                    )
                  : null,
              ),
            ),
      )
    }

    /** Page shell: memory dashboard and diary behind two tabs. */
    function MemoryPage() {
      const [tab, setTab] = useState('memory')
      const tabStyle = active => ({
        fontSize: 12,
        padding: '4px 12px',
        borderRadius: 8,
        border: `1px solid ${active ? C.brand : C.line}`,
        color: active ? C.brand : C.sub,
        background: 'transparent',
        cursor: 'pointer',
      })
      return h(
        'div',
        null,
        h(
          'div',
          { style: { display: 'flex', gap: 6, marginBottom: 12 } },
          h('button', { type: 'button', onClick: () => setTab('memory'), style: tabStyle(tab === 'memory') }, '记忆'),
          h('button', { type: 'button', onClick: () => setTab('diary'), style: tabStyle(tab === 'diary') }, '日记'),
        ),
        tab === 'memory' ? h(Panel, { compact: false }) : h(DiaryView, null),
      )
    }

    function SettingsSection() {
      return h('div', { style: { maxWidth: 880, padding: '4px 2px 32px' } }, h(MemoryPage, null))
    }

    /** Sidebar rail icon: a stack-of-disks "memory bank" glyph. */
    function SidebarIcon(props) {
      const size = props.size || 20
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: props.active ? C.brand : C.sub,
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('ellipse', { cx: 12, cy: 6.5, rx: 6.5, ry: 2.8 }),
        h('path', { d: 'M5.5 6.5v5.5c0 1.55 2.91 2.8 6.5 2.8s6.5-1.25 6.5-2.8V6.5' }),
        h('path', { d: 'M5.5 12v5.5c0 1.55 2.91 2.8 6.5 2.8s6.5-1.25 6.5-2.8V12' }),
      )
    }

    /** Full-page central panel opened from the sidebar entry. */
    function MainPage() {
      return h(
        'div',
        {
          style: {
            height: '100%',
            overflowY: 'auto',
            boxSizing: 'border-box',
            background: 'var(--dsw-alias-bg-base)',
            padding: '28px 32px 40px',
          },
        },
        h('div', { style: { maxWidth: 920, margin: '0 auto' } }, h(MemoryPage, null)),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const isZh = () => String(navigator.language || '').startsWith('zh')

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'long-memory',
              order: 60,
              label: () => (isZh() ? '长期记忆' : 'Long-term memory'),
            },
            SettingsSection,
          ),
        )

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'long-memory',
              order: 25,
              label: () => (isZh() ? '长期记忆' : 'Memory'),
            },
            SidebarIcon,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'long-memory' }, MainPage),
        )
      },
    }
  },
})
