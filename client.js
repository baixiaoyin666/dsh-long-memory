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
    const MOOD_COLORS = {
      happy: '#4aa8ff',
      angry: '#ff7a59',
      sad: '#7a8cff',
      shy: '#ff8ac2',
      confused: '#b08cff',
      daily: '#7ed6a5',
    }
    const MOOD_EMOJI = { happy: '😊', angry: '😠', sad: '😢', shy: '😳', confused: '😕', daily: '😐' }
    const MOOD_LABEL = { happy: '开心', angry: '生气', sad: '难过', shy: '害羞', confused: '困惑', daily: '日常' }
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const MOOD_DAYS = 14

    /** "今天 · 11月4日 周二" plus the update time, from a date key. */
    function entryDateText(dateStr, updatedAt) {
      const [year, month, day] = String(dateStr || '').split('-').map(Number)
      const date = new Date(year || 1970, (month || 1) - 1, day || 1)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const diff = Math.round((today - date) / 86400000)
      const prefix = diff === 0 ? '今天' : diff === 1 ? '昨天' : ''
      const weekday = WEEKDAYS[date.getDay()]
      const time = updatedAt
        ? new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : ''
      return {
        title: `${prefix ? `${prefix} · ` : ''}${month}月${day}日 ${weekday}`,
        updated: time ? `更新于 ${time}` : '',
      }
    }

    /** Last MOOD_DAYS calendar days, each with its diary entry when present. */
    function recentDays(entries) {
      const byDate = new Map((entries || []).map(entry => [entry.date, entry]))
      const days = []
      const now = new Date()
      for (let offset = MOOD_DAYS - 1; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        const entry = byDate.get(key)
        const mood = entry ? entry.mood || 'daily' : ''
        days.push({
          key,
          entry,
          mood,
          color: MOOD_COLORS[mood] || C.line,
          dayLabel: String(date.getDate()),
          full: `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`,
        })
      }
      return days
    }

    /** High-blur glass surface: translucent fill, backdrop blur, hairline edge. */
    function glass(extra) {
      return {
        background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 52%, transparent)',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 65%, transparent)',
        backdropFilter: 'blur(28px) saturate(165%)',
        WebkitBackdropFilter: 'blur(28px) saturate(165%)',
        boxShadow: '0 14px 44px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.10)',
        ...(extra || {}),
      }
    }

    const PAGE_BACKGROUND =
      'radial-gradient(1100px 560px at 8% -12%, rgba(74,168,255,0.16), transparent 60%),' +
      'radial-gradient(900px 520px at 108% 6%, rgba(176,140,255,0.14), transparent 55%),' +
      'var(--dsw-alias-bg-base)'

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

    const MOTION_CSS = `
      @keyframes lm-fade-up { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes lm-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0) } 50% { box-shadow: 0 0 12px 2px var(--lm-accent, rgba(255,255,255,0.35)) } }
      @keyframes lm-shimmer { 0% { transform: translateX(-120%) } 100% { transform: translateX(120%) } }
      .lm-fade { animation: lm-fade-up .3s cubic-bezier(.2,.7,.3,1) both }
      .lm-glass { transition: transform .24s cubic-bezier(.2,.7,.3,1), box-shadow .24s ease, border-color .24s ease, background .24s ease }
      .lm-glass:hover { transform: translateY(-2px) }
      .lm-row { transition: background .18s ease, box-shadow .18s ease }
      .lm-row:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent) }
      .lm-btn { transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease }
      .lm-btn:hover:not(:disabled) { transform: translateY(-1px) }
      .lm-btn:active:not(:disabled) { transform: translateY(0) scale(.97) }
      .lm-tab { transition: transform .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease }
      .lm-tab:hover { transform: translateY(-1px) }
      .lm-tab-active { box-shadow: 0 8px 22px rgba(0,0,0,.20) }
      .lm-focus:focus { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent) }
      .lm-dot { animation: lm-pulse 3.6s ease-in-out infinite }

      /* pointer-tracked tilt + spotlight */
      .lm-tilt { transition: transform .18s cubic-bezier(.2,.7,.3,1); will-change: transform; transform-style: preserve-3d }
      .lm-spot { position: relative; overflow: hidden }
      .lm-spot::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,.16), transparent 62%);
        opacity: 0;
        transition: opacity .28s ease;
        pointer-events: none;
      }
      .lm-spot:hover::before { opacity: 1 }

      /* sliding highlight under the active tab */
      .lm-tabs { position: relative }
      .lm-tab-indicator {
        position: absolute;
        bottom: -4px;
        height: 2px;
        border-radius: 2px;
        background: var(--dsw-alias-brand-primary);
        box-shadow: 0 0 12px color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, transparent);
        transition: left .26s cubic-bezier(.2,.7,.3,1), width .26s cubic-bezier(.2,.7,.3,1);
      }

      /* health ring */
      .lm-ring circle { transition: stroke-dashoffset .7s cubic-bezier(.2,.7,.3,1), stroke .3s ease }

      /* skeleton shimmer while loading */
      .lm-skeleton { position: relative; overflow: hidden; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 40%, transparent); border-radius: 12px }
      .lm-skeleton::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent);
        animation: lm-shimmer 1.4s ease-in-out infinite;
      }
    `

    function Motion() {
      return h('style', { dangerouslySetInnerHTML: { __html: MOTION_CSS } })
    }

    /** Animate a number from 0 to its value on mount / change. */
    function useCountUp(value) {
      const target = Number(value) || 0
      const [display, setDisplay] = useState(0)
      useEffect(() => {
        let frame
        const start = performance.now()
        const step = now => {
          const t = Math.min(1, (now - start) / 550)
          const eased = 1 - Math.pow(1 - t, 3)
          setDisplay(Math.round(target * eased))
          if (t < 1) frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
      }, [target])
      return display
    }

    /** Pointer-tracked 3D tilt plus the cursor spotlight variables. */
    function tiltProps() {
      return {
        onMouseMove: event => {
          const el = event.currentTarget
          const rect = el.getBoundingClientRect()
          const px = (event.clientX - rect.left) / rect.width
          const py = (event.clientY - rect.top) / rect.height
          el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
          el.style.setProperty('--my', `${event.clientY - rect.top}px`)
          el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * 5).toFixed(2)}deg) rotateY(${((px - 0.5) * 6).toFixed(2)}deg) translateY(-2px)`
        },
        onMouseLeave: event => {
          event.currentTarget.style.transform = ''
        },
      }
    }

    /** Buttons drift a few pixels toward the cursor. */
    function magnetProps() {
      return {
        onMouseMove: event => {
          const el = event.currentTarget
          const rect = el.getBoundingClientRect()
          const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width
          const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height
          el.style.transform = `translate(${(dx * 5).toFixed(2)}px, ${(-1 + dy * 3).toFixed(2)}px)`
        },
        onMouseLeave: event => {
          event.currentTarget.style.transform = ''
        },
      }
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
      const shown = useCountUp(props.value)
      return h(
        'div',
        {
          className: 'lm-tilt lm-spot lm-glass lm-fade',
          style: glass({ borderRadius: 14, padding: '12px 14px', minWidth: 0 }),
          ...tiltProps(),
        },
        h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 6 } }, props.label),
        h('div', { style: { fontSize: 24, fontWeight: 600, lineHeight: 1.1, color: C.ink } }, String(shown)),
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

      const toggleWorkspace = useCallback(
        async (path, disabled) => {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'workspace-toggle', path, disabled }),
          })
          await load()
        },
        [load],
      )

      const runBackfill = useCallback(
        async action => {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, maxSessions: 40 }),
          })
          await load()
        },
        [load],
      )

      const data = state.data
      const analysis = data && data.analysis
      const entries = data && data.entries ? data.entries : []
      const backfill = (data && data.backfill) || { running: false, total: 0, done: 0 }

      useEffect(() => {
        if (!backfill.running) return undefined
        const timer = setInterval(() => {
          load()
        }, 3000)
        return () => clearInterval(timer)
      }, [backfill.running, load])

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
          data
            ? h(
                'a',
                {
                  href: `${API}?export=markdown`,
                  download: `dsh-long-memory-${new Date().toISOString().slice(0, 10)}.md`,
                  style: { fontSize: 12, color: C.sub, textDecoration: 'none', marginLeft: 'auto' },
                },
                '导出 MD',
              )
            : null,
          data
            ? h(
                'a',
                {
                  href: `${API}?export=json`,
                  download: `dsh-long-memory-${new Date().toISOString().slice(0, 10)}.json`,
                  style: { fontSize: 12, color: C.sub, textDecoration: 'none' },
                },
                'JSON',
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'lm-btn',
              ...magnetProps(),
              onClick: load,
              disabled: busy,
              style: {
                marginLeft: data ? 0 : 'auto',
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
                  className: 'lm-tilt lm-spot lm-glass lm-fade',
                  style: glass({
                    borderRadius: 14,
                    padding: '14px',
                    marginBottom: 12,
                  }),
                  ...tiltProps(),
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 } },
                  h(
                    'svg',
                    { width: 66, height: 66, viewBox: '0 0 64 64', className: 'lm-ring', style: { flex: 'none' } },
                    h('circle', {
                      cx: 32,
                      cy: 32,
                      r: 26,
                      fill: 'none',
                      stroke: 'color-mix(in srgb, var(--dsw-alias-border-l1) 65%, transparent)',
                      strokeWidth: 6,
                    }),
                    h('circle', {
                      cx: 32,
                      cy: 32,
                      r: 26,
                      fill: 'none',
                      stroke: healthColor,
                      strokeWidth: 6,
                      strokeLinecap: 'round',
                      strokeDasharray: `${2 * Math.PI * 26}`,
                      strokeDashoffset: `${2 * Math.PI * 26 * (1 - analysis.health / 100)}`,
                      transform: 'rotate(-90 32 32)',
                    }),
                  ),
                  h(
                    'div',
                    { style: { flex: 1, minWidth: 0 } },
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                      h('div', { style: { fontSize: 13, fontWeight: 600 } }, '记忆健康度'),
                      h('div', { style: { fontSize: 20, fontWeight: 700, color: healthColor } }, `${analysis.health}`),
                      h('div', { style: { fontSize: 12, color: C.faint } }, '/ 100'),
                    ),
                    h(
                      'div',
                      { style: { fontSize: 12, color: C.faint, marginTop: 4 } },
                      `平均 ${analysis.avgLength} 字 · ${analysis.stale30d} 条超过 30 天`,
                    ),
                  ),
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
                {
                  className: 'lm-glass lm-fade',
                  style: glass({ borderRadius: 14, padding: '12px 14px', marginBottom: 12 }),
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
                  h('div', { style: { fontSize: 12, color: C.sub } }, '历史会话回填'),
                  h(
                    'div',
                    { style: { fontSize: 11, color: C.faint } },
                    '扫描所有工作区的旧会话，提炼成记忆（只处理装插件之前的历史）',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lm-btn',
                      ...magnetProps(),
                      onClick: () => runBackfill(backfill.running ? 'backfill-cancel' : 'backfill-start'),
                      style: {
                        marginLeft: 'auto',
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 8,
                        border: `1px solid ${backfill.running ? C.err : C.brand}`,
                        color: backfill.running ? C.err : C.brand,
                        background: 'transparent',
                        cursor: 'pointer',
                        flex: 'none',
                      },
                    },
                    backfill.running ? '取消' : '开始回填',
                  ),
                ),
                backfill.running || backfill.total
                  ? h(
                      'div',
                      null,
                      h(
                        'div',
                        {
                          style: {
                            height: 6,
                            borderRadius: 999,
                            background: C.soft,
                            overflow: 'hidden',
                            marginBottom: 6,
                          },
                        },
                        h('div', {
                          style: {
                            width: `${backfill.total ? Math.round((backfill.done / backfill.total) * 100) : 0}%`,
                            height: '100%',
                            background: C.brand,
                          },
                        }),
                      ),
                      h(
                        'div',
                        { style: { fontSize: 11, color: C.faint } },
                        `会话 ${backfill.done || 0}/${backfill.total || 0} · 新增 ${backfill.added || 0} · 合并 ${backfill.merged || 0} · 跳过 ${backfill.skipped || 0}${backfill.errors ? ` · 失败 ${backfill.errors}` : ''}${backfill.current ? ` · ${backfill.current}` : ''}${backfill.lastError ? ` · ${backfill.lastError}` : ''}`,
                      ),
                    )
                  : null,
              ),

              analysis.workspaces.length
                ? h(
                    'div',
                    {
                      className: 'lm-glass lm-fade',
                      style: glass({ borderRadius: 14, padding: '10px 14px', marginBottom: 12 }),
                    },
                    h(
                      'div',
                      { style: { fontSize: 12, color: C.sub, marginBottom: 6 } },
                      '工作区记录开关（关闭后该项目不再自动提炼）',
                    ),
                    analysis.workspaces.map(workspace => {
                      const disabled = ((data.settings && data.settings.disabledWorkspaces) || []).includes(workspace.path)
                      return h(
                        'div',
                        {
                          key: workspace.path,
                          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' },
                        },
                        h(
                          'span',
                          {
                            title: workspace.path,
                            style: {
                              flex: 1,
                              minWidth: 0,
                              fontSize: 12,
                              color: C.ink,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            },
                          },
                          workspace.path,
                        ),
                        h('span', { style: { fontSize: 11, color: C.faint, flex: 'none' } }, `${workspace.count} 条`),
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => toggleWorkspace(workspace.path, !disabled),
                            style: {
                              flex: 'none',
                              fontSize: 11,
                              padding: '2px 9px',
                              borderRadius: 999,
                              border: `1px solid ${disabled ? C.err : C.ok}`,
                              color: disabled ? C.err : C.ok,
                              background: 'transparent',
                              cursor: 'pointer',
                            },
                          },
                          disabled ? '已暂停' : '记录中',
                        ),
                      )
                    }),
                  )
                : null,

              h(
                'div',
                { style: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' } },
                h('input', {
                  className: 'lm-focus',
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
                  className: 'lm-glass lm-fade',
                  style: glass({ borderRadius: 14, overflow: 'hidden' }),
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
                          className: 'lm-row lm-fade',
                          style: {
                            padding: '10px 12px',
                            animationDelay: `${Math.min(index, 10) * 22}ms`,
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
              className: 'lm-btn',
              ...magnetProps(),
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

        entries.length
          ? h(
              'div',
              {
                className: 'lm-glass lm-fade',
                style: glass({ borderRadius: 14, padding: '10px 12px', marginBottom: 12 }),
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                h('div', { style: { fontSize: 12, color: C.sub } }, '最近情绪'),
                h(
                  'div',
                  { style: { fontSize: 11, color: C.faint, marginLeft: 'auto' } },
                  `最近 ${MOOD_DAYS} 天 · 共 ${entries.length} 篇日记`,
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                recentDays(entries).map(day =>
                  h(
                    'div',
                    {
                      key: day.key,
                      title: `${day.full} · ${day.entry ? MOOD_LABEL[day.mood] || day.mood : '没有记录'}`,
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        width: 32,
                      },
                    },
                    h(
                      'div',
                      {
                        style: {
                          width: 30,
                          height: 30,
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 16,
                          lineHeight: 1,
                          background: day.entry ? `${day.color}22` : 'transparent',
                          border: `1px solid ${day.entry ? day.color : C.line}`,
                          opacity: day.entry ? 1 : 0.45,
                        },
                      },
                      day.entry ? MOOD_EMOJI[day.mood] || '😐' : '·',
                    ),
                    h('div', { style: { fontSize: 9, color: C.faint } }, day.dayLabel),
                  ),
                ),
              ),
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
                  className: 'lm-glass lm-fade',
                  style: glass({
                    borderRadius: 14,
                    padding: '14px 16px',
                    marginBottom: 12,
                  }),
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' } },
                  h(
                    'div',
                    { style: { fontSize: 15, fontWeight: 600, color: C.ink } },
                    entryDateText(entry.date, entry.updatedAt).title,
                  ),
                  entry.mood
                    ? h(
                        Chip,
                        { color: MOOD_COLORS[entry.mood] || C.brand },
                        `${MOOD_EMOJI[entry.mood] || ''} ${MOOD_LABEL[entry.mood] || entry.mood}`,
                      )
                    : null,
                  h(
                    'div',
                    { style: { fontSize: 11, color: C.faint } },
                    entryDateText(entry.date, entry.updatedAt).updated || relTime(entry.updatedAt),
                  ),
                  entry.emoji
                    ? h('div', { style: { fontSize: 16, letterSpacing: 4, marginLeft: 'auto' } }, entry.emoji)
                    : null,
                ),
                entry.memePath
                  ? h('img', {
                      src: `${API}?meme=${encodeURIComponent(entry.date)}`,
                      alt: entry.memeCaption || '配图',
                      title: entry.memeCaption || '',
                      loading: 'lazy',
                      onError: event => {
                        event.currentTarget.style.display = 'none'
                      },
                      style: {
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 220,
                        borderRadius: 12,
                        margin: '0 0 10px',
                        boxShadow: '0 10px 28px rgba(0,0,0,0.25)',
                      },
                    })
                  : h(
                      'div',
                      {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderRadius: 12,
                          margin: '0 0 10px',
                          padding: '12px 16px',
                          background: `linear-gradient(135deg, ${MOOD_COLORS[entry.mood] || MOOD_COLORS.daily}22, transparent 70%)`,
                          border: `1px solid ${MOOD_COLORS[entry.mood] || MOOD_COLORS.daily}55`,
                        },
                      },
                      h('div', { style: { fontSize: 38, lineHeight: 1 } }, MOOD_EMOJI[entry.mood] || '😐'),
                      h(
                        'div',
                        { style: { fontSize: 12, color: C.sub, lineHeight: '18px' } },
                        h(
                          'div',
                          { style: { fontWeight: 600, color: C.ink } },
                          `${entry.personaName || '大肥鱼'} 的情绪卡 · ${MOOD_LABEL[entry.mood] || '日常'}`,
                        ),
                        h('div', null, '装了 dsh-meme 后这里会换成真实表情包'),
                      ),
                    ),
                h(
                  'div',
                  {
                    style: {
                      fontSize: 14,
                      lineHeight: '24px',
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
                      h('span', { style: { fontSize: 18, lineHeight: '20px' } }, entry.personaEmoji || '🐟'),
                      h(
                        'div',
                        null,
                        h(
                          'div',
                          { style: { fontSize: 11, color: C.faint, marginBottom: 2 } },
                          `${entry.personaName || '大肥鱼'} 的留言`,
                        ),
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

    /** Personas: a data table of built-in archetypes and user-defined ones. */
    function PersonaView() {
      const [state, setState] = useState({ status: 'loading', data: null, error: null })
      const [editing, setEditing] = useState(null)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState('')

      const load = useCallback(async () => {
        try {
          const data = await fetchPanel()
          setState({ status: 'ready', data, error: null })
        } catch (error) {
          setState({ status: 'error', data: null, error: String(error && error.message ? error.message : error) })
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const send = useCallback(
        async payload => {
          setBusy(true)
          try {
            const response = await fetch(API, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
            const data = await readJson(response)
            if (data.personaResult && data.personaResult.ok === false) setNotice(data.personaResult.reason || '操作失败')
            else setNotice('')
            setState({ status: 'ready', data, error: null })
          } catch (error) {
            setNotice(String(error && error.message ? error.message : error))
          } finally {
            setBusy(false)
          }
        },
        [],
      )

      const personas = (state.data && state.data.personas) || { activeId: '', list: [] }
      const list = personas.list || []

      const inputStyle = {
        fontSize: 13,
        padding: '6px 9px',
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: C.card,
        color: C.ink,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
      }
      const cell = { padding: '8px 10px', fontSize: 13, color: C.ink, verticalAlign: 'top' }
      const head = { padding: '8px 10px', fontSize: 11, color: C.faint, fontWeight: 600, textAlign: 'left' }
      const linkButton = color => ({
        fontSize: 12,
        color: color || C.brand,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '0 4px',
      })

      return h(
        'div',
        null,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
          h('div', { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, '人格'),
          h('div', { style: { fontSize: 12, color: C.faint } }, '日记里的留言由当前人格来写'),
          h(
            'button',
            {
              type: 'button',
              className: 'lm-btn',
              ...magnetProps(),
              onClick: () =>
                setEditing({ id: '', name: '', emoji: '🙂', accent: '#8b7cf6', summary: '', prompt: '' }),
              style: {
                marginLeft: 'auto',
                fontSize: 12,
                color: C.brand,
                background: 'transparent',
                border: `1px solid ${C.brand}`,
                borderRadius: 8,
                padding: '3px 10px',
                cursor: 'pointer',
              },
            },
            '新建人格',
          ),
        ),

        notice ? h('div', { style: { fontSize: 12, color: C.err, marginBottom: 8 } }, notice) : null,
        state.status === 'error' ? h(ErrorBox, { error: state.error, onRetry: load }) : null,

        // data table (hidden while the dedicated editor screen is open)
        editing ? null : h(
          'div',
          { className: 'lm-glass lm-fade', style: glass({ borderRadius: 14, overflow: 'hidden' }) },
          h(
            'table',
            { style: { width: '100%', borderCollapse: 'collapse' } },
            h(
              'thead',
              null,
              h(
                'tr',
                { style: { background: C.soft } },
                h('th', { style: head }, '人格'),
                h('th', { style: head }, '类型'),
                h('th', { style: head }, '风格摘要'),
                h('th', { style: head }, '日记'),
                h('th', { style: head }, '最近使用'),
                h('th', { style: head }, '状态'),
                h('th', { style: { ...head, textAlign: 'right' } }, '操作'),
              ),
            ),
            h(
              'tbody',
              null,
              list.map(persona =>
                h(
                  'tr',
                  { key: persona.id, className: 'lm-row lm-fade', style: { borderTop: `1px solid ${C.line}`, animationDelay: `${Math.min(list.indexOf(persona), 10) * 22}ms` } },
                  h(
                    'td',
                    { style: cell },
                    h('span', {
                      style: {
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: persona.accent || '#8b7cf6',
                        marginRight: 8,
                        boxShadow: `0 0 10px ${persona.accent || '#8b7cf6'}66`,
                      },
                    }),
                    h('span', { style: { marginRight: 6 } }, persona.emoji || '🙂'),
                    h('span', { style: { fontWeight: persona.id === personas.activeId ? 600 : 400 } }, persona.name),
                  ),
                  h('td', { style: { ...cell, color: C.sub } }, persona.builtin ? '内置' : '自定义'),
                  h('td', { style: { ...cell, color: C.sub, maxWidth: 320, lineHeight: '19px' } }, persona.summary || '—'),
                  h('td', { style: { ...cell, color: C.sub } }, `${persona.diaryCount || 0} 篇`),
                  h(
                    'td',
                    { style: { ...cell, color: C.faint } },
                    persona.lastUsedAt ? relTime(persona.lastUsedAt) : '—',
                  ),
                  h(
                    'td',
                    { style: cell },
                    persona.id === personas.activeId
                      ? h(Chip, { color: C.ok }, '启用中')
                      : h('span', { style: { fontSize: 11, color: C.faint } }, '—'),
                  ),
                  h(
                    'td',
                    { style: { ...cell, textAlign: 'right', whiteSpace: 'nowrap' } },
                    persona.id === personas.activeId
                      ? null
                      : h(
                          'button',
                          {
                            type: 'button',
                            disabled: busy,
                            onClick: () => send({ action: 'persona-activate', id: persona.id }),
                            style: linkButton(C.brand),
                          },
                          '启用',
                        ),
                    !persona.builtin
                      ? h(
                          'button',
                          {
                            type: 'button',
                            disabled: busy,
                            onClick: () => setEditing(persona),
                            style: linkButton(C.sub),
                          },
                          '编辑',
                        )
                      : null,
                    persona.builtin
                      ? h(
                          'button',
                          {
                            type: 'button',
                            onClick: () =>
                              setEditing({
                                id: '',
                                name: `${persona.name} 副本`,
                                emoji: persona.emoji,
                                accent: persona.accent,
                                summary: persona.summary,
                                prompt: persona.prompt,
                              }),
                            style: linkButton(C.sub),
                          },
                          '复制',
                        )
                      : h(
                          'button',
                          {
                            type: 'button',
                            disabled: busy,
                            onClick: () => send({ action: 'persona-delete', id: persona.id }),
                            style: linkButton(C.err),
                          },
                          '删除',
                        ),
                  ),
                ),
              ),
            ),
          ),
        ),

        // editor
        editing
          ? h(
              'div',
              {
                className: 'lm-glass lm-fade',
                style: glass({
                  marginTop: 12,
                  borderRadius: 14,
                  padding: '14px',
                }),
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lm-btn',
                    onClick: () => setEditing(null),
                    style: {
                      fontSize: 12,
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: 'transparent',
                      color: C.sub,
                      cursor: 'pointer',
                    },
                  },
                  '← 返回人格列表',
                ),
                h('div', { style: { fontSize: 13, fontWeight: 600 } }, editing.id ? '编辑人格' : '新建人格'),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' } },
                h('input', {
                  value: editing.name,
                  placeholder: '名称，如「毒舌管家」',
                  onChange: event => setEditing({ ...editing, name: event.target.value }),
                  style: { ...inputStyle, flex: '1 1 auto' },
                }),
                h('input', {
                  value: editing.emoji,
                  placeholder: '🙂',
                  onChange: event => setEditing({ ...editing, emoji: event.target.value }),
                  style: { ...inputStyle, width: 64, flex: 'none' },
                }),
                h('input', {
                  type: 'color',
                  value: editing.accent || '#8b7cf6',
                  title: '人格强调色',
                  onChange: event => setEditing({ ...editing, accent: event.target.value }),
                  style: {
                    width: 40,
                    height: 34,
                    padding: 0,
                    border: `1px solid color-mix(in srgb, ${C.line} 65%, transparent)`,
                    borderRadius: 8,
                    background: 'transparent',
                    cursor: 'pointer',
                    flex: 'none',
                  },
                }),
              ),
              h('input', {
                value: editing.summary,
                placeholder: '一句话风格摘要（显示在表格里）',
                onChange: event => setEditing({ ...editing, summary: event.target.value }),
                style: { ...inputStyle, marginBottom: 8 },
              }),
              h('textarea', {
                value: editing.prompt,
                placeholder: '角色设定：口吻、性格、习惯、口头禅……日记会按这个设定来写',
                onChange: event => setEditing({ ...editing, prompt: event.target.value }),
                rows: 4,
                style: { ...inputStyle, resize: 'vertical', marginBottom: 10, fontFamily: 'inherit', lineHeight: '20px' },
              }),
              h(
                'div',
                { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setEditing(null),
                    style: {
                      fontSize: 12,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: 'transparent',
                      color: C.sub,
                      cursor: 'pointer',
                    },
                  },
                  '取消',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lm-btn',
                    ...magnetProps(),
                    disabled: busy,
                    onClick: async () => {
                      await send({ action: 'persona-save', persona: editing })
                      setEditing(null)
                    },
                    style: {
                      fontSize: 12,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: C.brand,
                      color: '#fff',
                      cursor: 'pointer',
                    },
                  },
                  '保存并启用',
                ),
              ),
            )
          : null,
      )
    }

    /** Page shell: memory dashboard, diary and personas behind three tabs. */
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
        h(Motion, null),
        h(
          'div',
          { className: 'lm-tabs', style: { display: 'flex', gap: 6, marginBottom: 12 } },
          h('button', { type: 'button', className: `lm-tab${tab === 'memory' ? ' lm-tab-active' : ''}`, onClick: () => setTab('memory'), style: tabStyle(tab === 'memory') }, '记忆'),
          h('button', { type: 'button', className: `lm-tab${tab === 'diary' ? ' lm-tab-active' : ''}`, onClick: () => setTab('diary'), style: tabStyle(tab === 'diary') }, '日记'),
          h('button', { type: 'button', className: `lm-tab${tab === 'persona' ? ' lm-tab-active' : ''}`, onClick: () => setTab('persona'), style: tabStyle(tab === 'persona') }, '人格'),
        ),
        tab === 'memory' ? h(Panel, { compact: false }) : null,
        tab === 'diary' ? h(DiaryView, null) : null,
        tab === 'persona' ? h(PersonaView, null) : null,
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
            background: PAGE_BACKGROUND,
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
