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
    const MOOD_KEYS = ['happy', 'angry', 'sad', 'shy', 'confused', 'daily']

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

    /** Swallow one failing panel section instead of taking the whole panel down. */
    class Safe extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      render() {
        return this.state.failed ? null : this.props.children
      }
    }

    /** Compact metric tile used by the dashboard rows. */
    function Tile(props) {
      return h(
        'div',
        {
          className: 'lm-tilt lm-spot lm-glass lm-fade',
          style: glass({ borderRadius: 14, padding: '12px 14px', minWidth: 0 }),
          ...tiltProps(),
        },
        h('div', { style: { fontSize: 11, color: C.faint, marginBottom: 4 } }, props.label),
        h(
          'div',
          { style: { fontSize: 22, fontWeight: 600, lineHeight: 1.15, color: props.color || C.ink } },
          String(props.value),
        ),
        props.sub ? h('div', { style: { fontSize: 11, color: C.faint, marginTop: 4 } }, props.sub) : null,
      )
    }

    /** Horizontal mini bars: label, bar, count. */
    function BarList(props) {
      const rows = props.rows || []
      const max = rows.reduce((top, row) => Math.max(top, row[1]), 1)
      return h(
        'div',
        null,
        rows.map(([label, count], index) =>
          h(
            'div',
            {
              key: `${label}-${index}`,
              style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
            },
            h(
              'div',
              {
                title: label,
                style: {
                  width: 74,
                  flex: 'none',
                  fontSize: 11,
                  color: C.sub,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              label,
            ),
            h(
              'div',
              {
                style: {
                  flex: 1,
                  height: 6,
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--dsw-alias-border-l1) 45%, transparent)',
                  overflow: 'hidden',
                },
              },
              h('div', {
                style: {
                  width: `${Math.max(4, Math.round((count / max) * 100))}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: props.color || C.brand,
                },
              }),
            ),
            h('div', { style: { width: 28, textAlign: 'right', fontSize: 11, color: C.faint } }, String(count)),
          ),
        ),
      )
    }

    /** The statistics dashboard: tiles, 14-day chart, split donut, tags, heatmap. */
    function Dashboard(props) {
      const { analysis, entries } = props
      const stats = useMemo(() => {
        const dayKeyOf = ts => {
          const date = new Date(ts)
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const now = new Date()
        const days = []
        for (let offset = 13; offset >= 0; offset -= 1) {
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
          days.push({ key: dayKeyOf(date.getTime()), label: `${date.getMonth() + 1}/${date.getDate()}`, count: 0 })
        }
        const dayIndex = new Map(days.map(day => [day.key, day]))
        const sources = new Map()
        const tags = new Map()
        const workspaces = new Map()
        let hits = 0
        let archived = 0
        let globalCount = 0
        let workspaceCount = 0
        for (const entry of entries) {
          if (entry.archived) archived += 1
          if (entry.scope === 'global') globalCount += 1
          else {
            workspaceCount += 1
            const key = entry.workspace || '（未记录）'
            workspaces.set(key, (workspaces.get(key) || 0) + 1)
          }
          hits += entry.hits || 0
          const source = entry.source || 'auto'
          sources.set(source, (sources.get(source) || 0) + 1)
          for (const tag of entry.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1)
          const slot = dayIndex.get(dayKeyOf(entry.createdAt || 0))
          if (slot) slot.count += 1
        }
        const heat = []
        for (let offset = 34; offset >= 0; offset -= 1) {
          const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
          heat.push({ key: dayKeyOf(date.getTime()), day: date.getDate(), count: 0 })
        }
        const heatIndex = new Map(heat.map(day => [day.key, day]))
        for (const entry of entries) {
          const cell = heatIndex.get(dayKeyOf(entry.createdAt || 0))
          if (cell) cell.count += 1
        }
        return {
          days,
          heat,
          hits,
          archived,
          globalCount,
          workspaceCount,
          sources: [...sources].sort((a, b) => b[1] - a[1]),
          tags: [...tags].sort((a, b) => b[1] - a[1]).slice(0, 8),
          workspaces: [...workspaces].sort((a, b) => b[1] - a[1]).slice(0, 5),
        }
      }, [entries])

      const total = Math.max(1, entries.length)
      const radius = 26
      const circumference = 2 * Math.PI * radius
      const segments = [
        { label: '全局', value: stats.globalCount, color: C.brand },
        { label: '工作区', value: stats.workspaceCount, color: '#b08cff' },
        { label: '已归档', value: stats.archived, color: 'color-mix(in srgb, var(--dsw-alias-border-l1) 80%, transparent)' },
      ].filter(segment => segment.value > 0)
      let offset = 0
      const arcs = segments.map(segment => {
        const length = (segment.value / total) * circumference
        const arc = { ...segment, length, offset }
        offset += length
        return arc
      })

      const maxBar = stats.days.reduce((top, day) => Math.max(top, day.count), 1)
      const heatMax = stats.heat.reduce((top, day) => Math.max(top, day.count), 1)
      const healthColor = analysis.health >= 80 ? C.ok : analysis.health >= 50 ? C.warn : C.err

      return h(
        React.Fragment,
        null,
        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
              gap: 10,
              marginBottom: 12,
            },
          },
          h(Tile, { label: '记忆总数', value: analysis.total }),
          h(Tile, { label: '全局', value: analysis.global }),
          h(Tile, { label: '工作区', value: analysis.workspace }),
          h(Tile, { label: '已归档', value: stats.archived, color: C.faint }),
          h(Tile, { label: '累计命中', value: stats.hits, color: C.brand }),
        ),

        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 10,
              marginBottom: 12,
            },
          },
          h(
            'div',
            {
              className: 'lm-glass lm-fade',
              style: glass({ borderRadius: 14, padding: '12px 14px' }),
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 } },
              h('div', { style: { fontSize: 12, color: C.sub } }, '近 14 天新增'),
              h('div', { style: { fontSize: 11, color: C.faint, marginLeft: 'auto' } }, `累计 ${entries.length} 条`),
            ),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 } },
              stats.days.map(day =>
                h(
                  'div',
                  {
                    key: day.key,
                    title: `${day.label} · ${day.count} 条`,
                    style: {
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      height: '100%',
                    },
                  },
                  h('div', {
                    style: {
                      height: `${Math.max(2, Math.round((day.count / maxBar) * 100))}%`,
                      borderRadius: 4,
                      background: day.count ? C.brand : 'color-mix(in srgb, var(--dsw-alias-border-l1) 45%, transparent)',
                      opacity: day.count ? 0.85 : 1,
                    },
                  }),
                ),
              ),
            ),
            h(
              'div',
              { style: { display: 'flex', gap: 4, marginTop: 6 } },
              stats.days.map(day =>
                h(
                  'div',
                  {
                    key: `${day.key}-label`,
                    style: { flex: 1, textAlign: 'center', fontSize: 9, color: C.faint },
                  },
                  day.label,
                ),
              ),
            ),
          ),

          h(
            'div',
            {
              className: 'lm-glass lm-fade',
              style: glass({ borderRadius: 14, padding: '12px 14px' }),
            },
            h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 8 } }, '分布'),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 14 } },
              h(
                'svg',
                { width: 72, height: 72, viewBox: '0 0 64 64', style: { flex: 'none' } },
                h('circle', {
                  cx: 32,
                  cy: 32,
                  r: radius,
                  fill: 'none',
                  stroke: 'color-mix(in srgb, var(--dsw-alias-border-l1) 55%, transparent)',
                  strokeWidth: 8,
                }),
                arcs.map(arc =>
                  h('circle', {
                    key: arc.label,
                    cx: 32,
                    cy: 32,
                    r: radius,
                    fill: 'none',
                    stroke: arc.color,
                    strokeWidth: 8,
                    strokeDasharray: `${arc.length} ${circumference - arc.length}`,
                    strokeDashoffset: -arc.offset,
                    transform: 'rotate(-90 32 32)',
                  }),
                ),
              ),
              h(
                'div',
                { style: { flex: 1, minWidth: 0 } },
                segments.map(segment =>
                  h(
                    'div',
                    {
                      key: segment.label,
                      style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.sub, lineHeight: '20px' },
                    },
                    h('span', {
                      style: { width: 8, height: 8, borderRadius: 3, background: segment.color, flex: 'none' },
                    }),
                    h('span', null, segment.label),
                    h('span', { style: { marginLeft: 'auto', color: C.faint } }, String(segment.value)),
                  ),
                ),
                h(
                  'div',
                  { style: { fontSize: 11, color: C.faint, marginTop: 4 } },
                  `来源：${stats.sources.map(([name, count]) => `${name} ${count}`).join(' · ') || '暂无'}`,
                ),
              ),
            ),
          ),
        ),

        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 10,
              marginBottom: 12,
            },
          },
          h(
            'div',
            {
              className: 'lm-glass lm-fade',
              style: glass({ borderRadius: 14, padding: '12px 14px' }),
            },
            h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 8 } }, '标签 Top'),
            stats.tags.length
              ? h(BarList, { rows: stats.tags, color: C.brand })
              : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有标签'),
          ),

          h(
            'div',
            {
              className: 'lm-glass lm-fade',
              style: glass({ borderRadius: 14, padding: '12px 14px' }),
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 } },
              h('div', { style: { fontSize: 12, color: C.sub } }, '活跃度'),
              h('div', { style: { fontSize: 11, color: C.faint, marginLeft: 'auto' } }, '最近 5 周'),
            ),
            h(
              'div',
              {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 3,
                },
              },
              stats.heat.map(day =>
                h('div', {
                  key: day.key,
                  title: `${day.key} · ${day.count} 条`,
                  style: {
                    aspectRatio: '1',
                    borderRadius: 3,
                    background: day.count
                      ? `color-mix(in srgb, ${C.brand} ${Math.min(90, 18 + (day.count / heatMax) * 72)}%, transparent)`
                      : 'color-mix(in srgb, var(--dsw-alias-border-l1) 35%, transparent)',
                  },
                }),
              ),
            ),
          ),
        ),

        h(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 10,
              marginBottom: 12,
            },
          },
          h(
            'div',
            {
              className: 'lm-tilt lm-spot lm-glass lm-fade',
              style: glass({ borderRadius: 14, padding: '14px' }),
              ...tiltProps(),
            },
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 14 } },
              h(
                'svg',
                { width: 60, height: 60, viewBox: '0 0 64 64', className: 'lm-ring', style: { flex: 'none' } },
                h('circle', {
                  cx: 32,
                  cy: 32,
                  r: radius,
                  fill: 'none',
                  stroke: 'color-mix(in srgb, var(--dsw-alias-border-l1) 65%, transparent)',
                  strokeWidth: 6,
                }),
                h('circle', {
                  cx: 32,
                  cy: 32,
                  r: radius,
                  fill: 'none',
                  stroke: healthColor,
                  strokeWidth: 6,
                  strokeLinecap: 'round',
                  strokeDasharray: `${circumference}`,
                  strokeDashoffset: `${circumference * (1 - analysis.health / 100)}`,
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
            analysis.issues.slice(0, 3).map((issue, index) =>
              h(
                'div',
                {
                  key: `issue-${index}`,
                  style: { display: 'flex', gap: 8, fontSize: 12, color: C.sub, lineHeight: '19px', marginTop: 6 },
                },
                h('span', {
                  style: {
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: LEVEL_COLOR[issue.level] || C.sub,
                    marginTop: 6,
                    flex: 'none',
                  },
                }),
                h('span', null, issue.text),
              ),
            ),
          ),

          h(
            'div',
            {
              className: 'lm-glass lm-fade',
              style: glass({ borderRadius: 14, padding: '12px 14px' }),
            },
            h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 8 } }, '工作区分布'),
            stats.workspaces.length
              ? h(BarList, { rows: stats.workspaces, color: '#b08cff' })
              : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有工作区记忆'),
          ),
        ),
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
      const [selected, setSelected] = useState([])
      const [editId, setEditId] = useState('')
      const [editForm, setEditForm] = useState(null)

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

      const toggleSelect = useCallback(id => {
        setSelected(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]))
      }, [])

      const batchAction = useCallback(
        async (action, extra = {}) => {
          if (!selected.length) return
          if (action === 'forget-many') {
            await Promise.all(
              selected.map(id =>
                fetch(API, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'forget', id }),
                }),
              ),
            )
          } else {
            await fetch(API, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action, ids: selected, ...extra }),
            })
          }
          setSelected([])
          await load()
        },
        [selected, load],
      )

      const mergePair = useCallback(
        async pair => {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'merge-memories', ids: [pair.a, pair.b] }),
          })
          await load()
        },
        [load],
      )

      const saveSettings = useCallback(
        async patch => {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'settings-save', settings: patch }),
          })
          await load()
        },
        [load],
      )

      const trashAction = useCallback(
        async (action, id) => {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, id }),
          })
          await load()
        },
        [load],
      )

      const startEdit = useCallback(entry => {
        setEditId(entry.id)
        setEditForm({
          text: entry.text,
          tags: (entry.tags || []).join(', '),
          scope: entry.scope,
          workspace: entry.workspace || '',
        })
      }, [])

      const saveEdit = useCallback(async () => {
        if (!editForm) return
        await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            id: editId,
            text: editForm.text,
            tags: editForm.tags
              .split(',')
              .map(tag => tag.trim())
              .filter(Boolean),
            scope: editForm.scope,
            workspace: editForm.workspace,
          }),
        })
        setEditId('')
        setEditForm(null)
        await load()
      }, [editId, editForm, load])

      const importFile = useCallback(async event => {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (!file) return
        try {
          const payload = JSON.parse(await file.text())
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'import', payload }),
          })
        } catch {
          /* malformed JSON is ignored; the payload stays unchanged */
        }
        await load()
      }, [load])

      const data = state.data
      const analysis = data && data.analysis
      const entries = data && data.entries ? data.entries : []
      const backfill = (data && data.backfill) || { running: false, total: 0, done: 0 }
      const settings = (data && data.settings) || {}

      useEffect(() => {
        if (!backfill.running) return undefined
        const timer = setInterval(() => {
          load()
        }, 3000)
        return () => clearInterval(timer)
      }, [backfill.running, load])

      const filtered = useMemo(() => {
        const spec = { tag: '', scope: '', archived: false, before: 0 }
        const words = []
        for (const token of query.trim().split(/\s+/)) {
          if (!token) continue
          if (token.startsWith('tag:')) spec.tag = token.slice(4).toLowerCase()
          else if (token.startsWith('scope:')) spec.scope = token.slice(6)
          else if (token === 'archived:true') spec.archived = true
          else if (token.startsWith('before:')) spec.before = Date.parse(token.slice(7)) || 0
          else words.push(token)
        }
        const needle = words.join(' ').toLowerCase()
        return entries.filter(entry => {
          if (!spec.archived && entry.archived) return false
          if (scope !== 'all' && entry.scope !== scope) return false
          if (spec.scope && entry.scope !== spec.scope) return false
          if (spec.tag && !(entry.tags || []).some(tag => String(tag).toLowerCase().includes(spec.tag))) return false
          if (spec.before && (entry.createdAt || 0) >= spec.before) return false
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
          data
            ? h(
                'label',
                {
                  style: { fontSize: 12, color: C.sub, cursor: 'pointer' },
                  title: '导入之前导出的 JSON 备份',
                },
                '导入',
                h('input', {
                  type: 'file',
                  accept: '.json,application/json',
                  onChange: importFile,
                  style: { display: 'none' },
                }),
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

              h(Safe, null, h(Dashboard, { analysis, entries })),

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

              h(
                'div',
                {
                  className: 'lm-glass lm-fade',
                  style: glass({ borderRadius: 14, padding: '12px 14px', marginBottom: 12 }),
                },
                h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 8 } }, '提炼设置'),
                h(
                  'div',
                  { style: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' } },
                  h(
                    'label',
                    { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.ink } },
                    h('input', {
                      type: 'checkbox',
                      checked: settings.auto !== false,
                      onChange: event => saveSettings({ auto: event.target.checked }),
                    }),
                    '自动提炼',
                  ),
                  h(
                    'label',
                    { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.ink } },
                    '每',
                    h('input', {
                      type: 'number',
                      min: 1,
                      max: 20,
                      value: settings.everyTurns || 1,
                      disabled: settings.auto === false,
                      onChange: event => saveSettings({ everyTurns: Number(event.target.value) || 1 }),
                      style: {
                        width: 56,
                        fontSize: 12,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: `1px solid ${C.line}`,
                        background: 'transparent',
                        color: C.ink,
                      },
                    }),
                    '轮提炼一次',
                  ),
                  h(
                    'label',
                    { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.ink } },
                    h('input', {
                      type: 'checkbox',
                      checked: settings.onlyUser === true,
                      onChange: event => saveSettings({ onlyUser: event.target.checked }),
                    }),
                    '只发送用户消息',
                  ),
                ),
              ),

              data.trash && data.trash.count
                ? h(
                    'div',
                    {
                      className: 'lm-glass lm-fade',
                      style: glass({ borderRadius: 14, padding: '10px 14px', marginBottom: 12 }),
                    },
                    h(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
                      h('div', { style: { fontSize: 12, color: C.sub } }, `回收站（${data.trash.count}）`),
                      h('div', { style: { fontSize: 11, color: C.faint } }, '删除的记忆保留 30 天'),
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: () => trashAction('trash-empty'),
                          style: {
                            marginLeft: 'auto',
                            fontSize: 11,
                            padding: '2px 9px',
                            borderRadius: 999,
                            border: `1px solid ${C.err}`,
                            color: C.err,
                            background: 'transparent',
                            cursor: 'pointer',
                          },
                        },
                        '清空',
                      ),
                    ),
                    data.trash.items.slice(0, 5).map(item =>
                      h(
                        'div',
                        {
                          key: item.id,
                          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' },
                        },
                        h(
                          'div',
                          {
                            style: {
                              flex: 1,
                              minWidth: 0,
                              fontSize: 11,
                              color: C.sub,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            },
                          },
                          item.text,
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => trashAction('trash-restore', item.id),
                            style: {
                              flex: 'none',
                              fontSize: 11,
                              padding: '2px 9px',
                              borderRadius: 999,
                              border: `1px solid ${C.ok}`,
                              color: C.ok,
                              background: 'transparent',
                              cursor: 'pointer',
                            },
                          },
                          '恢复',
                        ),
                      ),
                    ),
                  )
                : null,

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

              analysis.pairs && analysis.pairs.length
                ? h(
                    'div',
                    {
                      className: 'lm-glass lm-fade',
                      style: glass({ borderRadius: 14, padding: '10px 14px', marginBottom: 12 }),
                    },
                    h(
                      'div',
                      { style: { fontSize: 12, color: C.sub, marginBottom: 4 } },
                      `疑似重复 / 冲突（${analysis.pairs.length}）`,
                    ),
                    analysis.pairs.slice(0, 6).map((pair, index) =>
                      h(
                        'div',
                        {
                          key: `${pair.a}-${pair.b}`,
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '5px 0',
                            borderTop: index === 0 ? 'none' : `1px solid ${C.line}`,
                          },
                        },
                        h(
                          'div',
                          { style: { flex: 1, minWidth: 0, fontSize: 11, color: C.sub, lineHeight: '16px' } },
                          h('div', { style: { color: C.ink } }, pair.aText),
                          h('div', null, pair.bText),
                        ),
                        h('span', { style: { fontSize: 10, color: C.faint, flex: 'none' } }, pair.score),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'lm-btn',
                            onClick: () => mergePair(pair),
                            style: {
                              flex: 'none',
                              fontSize: 11,
                              padding: '2px 9px',
                              borderRadius: 999,
                              border: `1px solid ${C.brand}`,
                              color: C.brand,
                              background: 'transparent',
                              cursor: 'pointer',
                            },
                          },
                          '合并',
                        ),
                      ),
                    ),
                  )
                : null,

              selected.length
                ? h(
                    'div',
                    {
                      className: 'lm-glass lm-fade',
                      style: glass({
                        borderRadius: 12,
                        padding: '7px 12px',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }),
                    },
                    h('span', { style: { fontSize: 12, color: C.ink } }, `已选 ${selected.length} 条`),
                    ...[
                      ['归档', () => batchAction('archive-memories', { archived: true })],
                      ['恢复', () => batchAction('archive-memories', { archived: false })],
                      ['合并', () => batchAction('merge-memories')],
                      ['删除', () => batchAction('forget-many')],
                    ].map(([label, handler]) =>
                      h(
                        'button',
                        {
                          key: label,
                          type: 'button',
                          className: 'lm-btn',
                          onClick: handler,
                          style: {
                            fontSize: 11,
                            padding: '2px 10px',
                            borderRadius: 999,
                            border: `1px solid ${C.line}`,
                            color: label === '删除' ? C.err : C.ink,
                            background: 'transparent',
                            cursor: 'pointer',
                          },
                        },
                        label,
                      ),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => setSelected([]),
                        style: {
                          fontSize: 11,
                          marginLeft: 'auto',
                          padding: '2px 10px',
                          borderRadius: 999,
                          border: 'none',
                          background: 'transparent',
                          color: C.faint,
                          cursor: 'pointer',
                        },
                      },
                      '取消选择',
                    ),
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
                          h('input', {
                            type: 'checkbox',
                            checked: selected.includes(entry.id),
                            onChange: () => toggleSelect(entry.id),
                            title: '选择这条记忆',
                            style: { marginTop: 3, flex: 'none', cursor: 'pointer', accentColor: C.brand },
                          }),
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
                            editId === entry.id && editForm
                              ? h(
                                  'div',
                                  { style: { marginTop: 4 } },
                                  h('textarea', {
                                    value: editForm.text,
                                    rows: 3,
                                    onChange: event => setEditForm({ ...editForm, text: event.target.value }),
                                    style: {
                                      width: '100%',
                                      boxSizing: 'border-box',
                                      fontSize: 13,
                                      lineHeight: '20px',
                                      padding: '8px 10px',
                                      borderRadius: 8,
                                      border: `1px solid ${C.line}`,
                                      background: 'transparent',
                                      color: C.ink,
                                      resize: 'vertical',
                                      outline: 'none',
                                    },
                                  }),
                                  h(
                                    'div',
                                    { style: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' } },
                                    h('input', {
                                      value: editForm.tags,
                                      onChange: event => setEditForm({ ...editForm, tags: event.target.value }),
                                      placeholder: '标签，逗号分隔',
                                      style: {
                                        flex: '1 1 150px',
                                        fontSize: 12,
                                        padding: '5px 8px',
                                        borderRadius: 8,
                                        border: `1px solid ${C.line}`,
                                        background: 'transparent',
                                        color: C.ink,
                                        outline: 'none',
                                      },
                                    }),
                                    h(
                                      'select',
                                      {
                                        value: editForm.scope,
                                        onChange: event => setEditForm({ ...editForm, scope: event.target.value }),
                                        style: {
                                          fontSize: 12,
                                          padding: '5px 8px',
                                          borderRadius: 8,
                                          border: `1px solid ${C.line}`,
                                          background: 'transparent',
                                          color: C.ink,
                                        },
                                      },
                                      h('option', { value: 'global' }, '全局'),
                                      h('option', { value: 'workspace' }, '工作区'),
                                    ),
                                    editForm.scope === 'workspace'
                                      ? h('input', {
                                          value: editForm.workspace,
                                          onChange: event => setEditForm({ ...editForm, workspace: event.target.value }),
                                          placeholder: '工作区目录',
                                          style: {
                                            flex: '1 1 200px',
                                            fontSize: 12,
                                            padding: '5px 8px',
                                            borderRadius: 8,
                                            border: `1px solid ${C.line}`,
                                            background: 'transparent',
                                            color: C.ink,
                                            outline: 'none',
                                          },
                                        })
                                      : null,
                                  ),
                                  h(
                                    'div',
                                    { style: { display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' } },
                                    h(
                                      'button',
                                      {
                                        type: 'button',
                                        onClick: () => {
                                          setEditId('')
                                          setEditForm(null)
                                        },
                                        style: {
                                          fontSize: 11,
                                          padding: '3px 10px',
                                          borderRadius: 999,
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
                                        onClick: saveEdit,
                                        style: {
                                          fontSize: 11,
                                          padding: '3px 12px',
                                          borderRadius: 999,
                                          border: 'none',
                                          background: C.brand,
                                          color: '#fff',
                                          cursor: 'pointer',
                                        },
                                      },
                                      '保存',
                                    ),
                                  ),
                                )
                              : h('div', { style: { fontSize: 13, lineHeight: '20px', wordBreak: 'break-word' } }, entry.text),
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
                            h(
                              'button',
                              {
                                type: 'button',
                                onClick: () => startEdit(entry),
                                style: {
                                  marginTop: 6,
                                  marginLeft: 10,
                                  padding: 0,
                                  fontSize: 11,
                                  color: C.sub,
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                },
                              },
                              '编辑',
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
      const [editingDate, setEditingDate] = useState('')
      const [draft, setDraft] = useState('')
      const [weeklyBusy, setWeeklyBusy] = useState(false)

      const generateWeekly = useCallback(async force => {
        setWeeklyBusy(true)
        try {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'weekly', force: Boolean(force) }),
          })
          const data = await fetchPanel()
          setState({ status: 'ready', data, error: null })
        } finally {
          setWeeklyBusy(false)
        }
      }, [])

      const saveDiary = useCallback(async date => {
        await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'diary-update', date, diary: draft }),
        })
        setEditingDate('')
        const data = await fetchPanel()
        setState({ status: 'ready', data, error: null })
      }, [draft])

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
      const weekly = (state.data && state.data.weekly) || []
      const currentWeekKey = (state.data && state.data.currentWeek) || ''
      const currentWeekly = weekly.find(item => item.week === currentWeekKey)
      const pastWeekly = weekly.filter(item => item.week !== currentWeekKey)

      const personaFor = entry =>
        ((state.data && state.data.personas && state.data.personas.list) || []).find(item => item.id === entry.personaId) ||
        null
      const moodFace = entry => {
        const persona = personaFor(entry)
        return (persona && persona.moods && persona.moods[entry.mood]) || MOOD_EMOJI[entry.mood] || '😐'
      }
      const moodAccent = entry => {
        const persona = personaFor(entry)
        return (persona && persona.accent) || MOOD_COLORS[entry.mood] || MOOD_COLORS.daily
      }
      const moodCaption = entry => {
        const persona = personaFor(entry)
        const template = (persona && persona.cardCaption) || '{name} 的情绪卡 · {mood}'
        return template
          .replace('{name}', (persona && persona.name) || entry.personaName || '大肥鱼')
          .replace('{mood}', MOOD_LABEL[entry.mood] || '日常')
      }

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

        state.data
          ? h(
              'div',
              {
                className: 'lm-glass lm-fade',
                style: glass({ borderRadius: 14, padding: '12px 14px', marginBottom: 12 }),
              },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
                h('div', { style: { fontSize: 12, color: C.sub } }, '本周周报'),
                currentWeekly
                  ? h(
                      'div',
                      { style: { fontSize: 11, color: C.faint } },
                      `${currentWeekly.start} ~ ${currentWeekly.end} · ${currentWeekly.diaryCount || 0} 篇日记`,
                    )
                  : null,
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'lm-btn',
                    ...magnetProps(),
                    disabled: weeklyBusy,
                    onClick: () => generateWeekly(Boolean(currentWeekly)),
                    style: {
                      marginLeft: 'auto',
                      fontSize: 11,
                      color: C.sub,
                      background: 'transparent',
                      border: `1px solid ${C.line}`,
                      borderRadius: 8,
                      padding: '3px 10px',
                      cursor: weeklyBusy ? 'default' : 'pointer',
                      opacity: weeklyBusy ? 0.6 : 1,
                    },
                  },
                  weeklyBusy ? '写着…' : currentWeekly ? '重新生成' : '生成本周周报',
                ),
              ),
              currentWeekly
                ? h(
                    'div',
                    null,
                    currentWeekly.headline
                      ? h(
                          'div',
                          { style: { fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 } },
                          currentWeekly.headline,
                        )
                      : null,
                    h(
                      'div',
                      {
                        style: {
                          fontSize: 13,
                          lineHeight: '22px',
                          color: C.ink,
                          whiteSpace: 'pre-wrap',
                          marginBottom: 8,
                        },
                      },
                      currentWeekly.summary,
                    ),
                    currentWeekly.moods
                      ? h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 6 } }, `心情：${currentWeekly.moods}`)
                      : null,
                    (currentWeekly.highlights || []).length
                      ? h(
                          'div',
                          { style: { marginBottom: 8 } },
                          currentWeekly.highlights.map((item, index) =>
                            h(
                              'div',
                              {
                                key: index,
                                style: { fontSize: 12, color: C.sub, lineHeight: '20px' },
                              },
                              `· ${item}`,
                            ),
                          ),
                        )
                      : null,
                    currentWeekly.fish
                      ? h(
                          'div',
                          {
                            style: {
                              fontSize: 12,
                              color: C.ink,
                              padding: '8px 10px',
                              borderRadius: 10,
                              background: `${C.brand}14`,
                            },
                          },
                          `${currentWeekly.personaEmoji || '🐟'} ${currentWeekly.fish}`,
                        )
                      : null,
                  )
                : h(
                    'div',
                    { style: { fontSize: 12, color: C.faint, lineHeight: '18px' } },
                    '这周还没生成周报。攒够 2 篇日记后点上面的按钮，会把日记与本周新增记忆归纳成一篇周记。',
                  ),
              pastWeekly.length
                ? h(
                    'div',
                    { style: { marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${C.line}` } },
                    h('div', { style: { fontSize: 11, color: C.faint, marginBottom: 4 } }, '往期周报'),
                    pastWeekly.slice(0, 4).map(item =>
                      h(
                        'div',
                        { key: item.week, style: { fontSize: 11, color: C.sub, lineHeight: '18px' } },
                        `${item.start} ~ ${item.end}：${item.headline || item.summary.slice(0, 30)}`,
                      ),
                    ),
                  )
                : null,
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
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lm-btn',
                      onClick: () => {
                        setEditingDate(entry.date)
                        setDraft(entry.diary || '')
                      },
                      style: {
                        marginLeft: entry.emoji ? 0 : 'auto',
                        fontSize: 11,
                        padding: '2px 9px',
                        borderRadius: 999,
                        border: `1px solid ${C.line}`,
                        background: 'transparent',
                        color: C.sub,
                        cursor: 'pointer',
                      },
                    },
                    '编辑',
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
                          background: `linear-gradient(135deg, ${moodAccent(entry)}22, transparent 70%)`,
                          border: `1px solid ${moodAccent(entry)}55`,
                        },
                      },
                      h('div', { style: { fontSize: 38, lineHeight: 1 } }, moodFace(entry)),
                      h(
                        'div',
                        { style: { fontSize: 12, color: C.sub, lineHeight: '18px' } },
                        h('div', { style: { fontWeight: 600, color: C.ink } }, moodCaption(entry)),
                        h('div', null, '装了 dsh-meme 后这里会换成真实表情包'),
                      ),
                    ),
                editingDate === entry.date
                  ? h(
                      'div',
                      { style: { marginBottom: 10 } },
                      h('textarea', {
                        value: draft,
                        onChange: event => setDraft(event.target.value),
                        rows: 8,
                        style: {
                          width: '100%',
                          boxSizing: 'border-box',
                          fontSize: 14,
                          lineHeight: '22px',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: `1px solid ${C.line}`,
                          background: 'transparent',
                          color: C.ink,
                          resize: 'vertical',
                          outline: 'none',
                        },
                      }),
                      h(
                        'div',
                        { style: { display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' } },
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => setEditingDate(''),
                            style: {
                              fontSize: 11,
                              padding: '3px 10px',
                              borderRadius: 999,
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
                            onClick: () => saveDiary(entry.date),
                            style: {
                              fontSize: 11,
                              padding: '3px 12px',
                              borderRadius: 999,
                              border: 'none',
                              background: C.brand,
                              color: '#fff',
                              cursor: 'pointer',
                            },
                          },
                          '保存',
                        ),
                      ),
                    )
                  : h(
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
                setEditing({
                  id: '',
                  name: '',
                  emoji: '🙂',
                  accent: '#8b7cf6',
                  summary: '',
                  prompt: '',
                  moods: {},
                  cardCaption: '',
                }),
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
                                moods: persona.moods || {},
                                cardCaption: persona.cardCaption || '',
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
                {
                  style: {
                    marginBottom: 10,
                    paddingTop: 8,
                    borderTop: `1px dashed ${C.line}`,
                  },
                },
                h(
                  'div',
                  { style: { fontSize: 12, color: C.sub, marginBottom: 6 } },
                  '情绪卡（没有表情包时的兜底配图，可只填部分心情）',
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 } },
                  MOOD_KEYS.map(key =>
                    h(
                      'label',
                      {
                        key,
                        style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.sub },
                      },
                      h('span', null, MOOD_LABEL[key]),
                      h('input', {
                        value: (editing.moods && editing.moods[key]) || '',
                        placeholder: MOOD_EMOJI[key],
                        onChange: event =>
                          setEditing({
                            ...editing,
                            moods: { ...(editing.moods || {}), [key]: event.target.value },
                          }),
                        style: {
                          ...inputStyle,
                          width: 44,
                          padding: '3px 4px',
                          fontSize: 14,
                          textAlign: 'center',
                        },
                      }),
                    ),
                  ),
                ),
                h('input', {
                  value: editing.cardCaption || '',
                  placeholder: '文案模板，可用 {name} 和 {mood}',
                  onChange: event => setEditing({ ...editing, cardCaption: event.target.value }),
                  style: { ...inputStyle },
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
                ['🐟', '😼', '🍵', '🤖', '🧘', '🦊', '🐧', '🎩'].map(face =>
                  h(
                    'button',
                    {
                      key: face,
                      type: 'button',
                      onClick: () => setEditing({ ...editing, emoji: face }),
                      style: {
                        fontSize: 16,
                        padding: '2px 8px',
                        borderRadius: 8,
                        border: `1px solid ${C.line}`,
                        background: 'transparent',
                        cursor: 'pointer',
                      },
                    },
                    face,
                  ),
                ),
              ),
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
