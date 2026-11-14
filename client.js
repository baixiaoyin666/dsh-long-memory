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
    const { useCallback, useEffect, useMemo, useState } = React

    const isZh = () => String(navigator.language || '').startsWith('zh')

    /** UI dictionary: Chinese source → English. Only interface labels live here. */
    const EN = {
      '全局': 'Global',
      '工作区': 'Workspace',
      '已归档': 'Archived',
      '记忆': 'Memory',
      '日记': 'Diary',
      '人格': 'Persona',
      '编辑': 'Edit',
      '恢复': 'Restore',
      '归档': 'Archive',
      '删除': 'Delete',
      '保存': 'Save',
      '保存并启用': 'Save & activate',
      '全部': 'All',
      '分布': 'Breakdown',
      '导入': 'Import',
      '刷新': 'Refresh',
      '刷新中…': 'Refreshing…',
      '取消': 'Cancel',
      '取消编辑': 'Cancel editing',
      '取消选择': 'Clear selection',
      '清空': 'Empty',
      '合并': 'Merge',
      '清除': 'Clear',
      '清除筛选': 'Clear filters',
      '全选': 'Select all',
      '模板': 'Templates',
      '权重': 'Weight',
      '用户': 'User',
      '助手': 'Assistant',
      '配图': 'Image',
      '自动': 'Auto',
      '类型': 'Type',
      '状态': 'Status',
      '操作': 'Actions',
      '内置': 'Built-in',
      '自定义': 'Custom',
      '启用': 'Activate',
      '启用中': 'Active',
      '复制': 'Duplicate',
      '健康度': 'Health',
      '活跃度': 'Activity',
      '已暂停': 'Paused',
      '记录中': 'Recording',
      '仅全局': 'Global only',
      '仅工作区': 'Workspace only',
      '全部范围': 'All scopes',
      '大肥鱼': 'Big Fish',
      '写着…': 'Writing…',
      '加载中…': 'Loading…',
      '删除中…': 'Deleting…',
      '记忆详情': 'Memory detail',
      '记忆总数': 'Total memories',
      '累计命中': 'Total hits',
      '来源明细': 'By source',
      '最近新增': 'Recently added',
      '提炼设置': 'Extraction',
      '自动提炼': 'Auto-extract',
      '开始回填': 'Start backfill',
      '历史会话回填': 'History backfill',
      '日记总数': 'Total diaries',
      '连续写作': 'Writing streak',
      '平均字数': 'Avg length',
      '心情分布': 'Mood mix',
      '写作热力': 'Writing heatmap',
      '当天习惯': 'Habits that day',
      '自动生成': 'Auto',
      '日常日记': 'Daily diary',
      '重写今天': "Rewrite today",
      '本周周报': 'Weekly report',
      '重新生成': 'Regenerate',
      '往期周报': 'Past weeks',
      '最近情绪': 'Recent moods',
      '操作失败': 'Action failed',
      '新建人格': 'New persona',
      '编辑人格': 'Edit persona',
      '人格总数': 'Total personas',
      '当前人格': 'Active persona',
      '风格摘要': 'Style summary',
      '最近使用': 'Last used',
      '工作区目录': 'Workspace directory',
      '（未记录）': '(unrecorded)',
      '按写入方式': 'By write path',
      '还没有数据': 'No data yet',
      '还没有记忆': 'No memories yet',
      '还没有标签': 'No tags yet',
      '工作区分布': 'Workspace split',
      '健康与待办': 'Health & to-dos',
      '导出 MD': 'Export MD',
      '轮提炼一次': 'turns',
      '插入模板': 'Templates:',
      '人格强调色': 'Persona accent colour',
      '最新 5 条': 'Latest 5',
      '标签 Top': 'Top tags',
      '输入 ¥/M': 'In ¥/M',
      '输出 ¥/M': 'Out ¥/M',
      '选择这条记忆': 'Select this memory',
      '删除这条记忆': 'Delete this memory',
      '收起对话': 'Hide conversation',
      '近 30 天': 'Last 30 days',
      '习惯 Top': 'Top habits',
      '值得记住的事': 'Worth remembering',
      '生成本周周报': 'Generate this week',
      '代码约定': 'Conventions',
      '项目结构': 'Project structure',
      '点一条可筛出来': 'Click a row to filter',
      '标签逗号分隔': 'Tags, comma separated',
      '点击按标签筛选': 'Click a tag to filter',
      '只发送用户消息': 'User messages only',
      '打开独立页 ›': 'Open page ›',
      '打开这一期周报': 'Open this week',
      '只看自定义人格': 'Custom personas only',
      '点击按工作区筛选': 'Click a workspace to filter',
      '还没有工作区记忆': 'No workspace memories yet',
      '● 上次提炼成功': '● Last extraction succeeded',
      '● 上次提炼失败': '● Last extraction failed',
      '还没有任何记忆。': 'No memories yet.',
      '没有匹配的记忆。': 'No matching memories.',
      '还没有记录到习惯': 'No habits recorded yet',
      '← 返回记忆列表': '← Back to memories',
      '← 返回日记列表': '← Back to diary',
      '← 返回人格列表': '← Back to personas',
      '再点一次显示全部': 'Click again to show all',
      '最近 24 小时学到': 'Learned in the last 24h',
      '点击在列表里筛出这条': 'Click to filter this in the list',
      '搜索记忆内容或标签…': 'Search memories or tags…',
      '这个筛选下没有日记': 'No diaries match this filter.',
      '名称如毒舌管家': 'Name, e.g. Snarky Butler',
      '近 30 天还没有日记': 'No diaries in the last 30 days',
      'Token / 费用趋势': 'Token / cost trend',
      '单价可在提炼设置里改': 'Prices are editable under Extraction',
      '删除的记忆保留 30 天': 'Deleted memories are kept for 30 days',
      '选择当前筛选出的全部记忆': 'Select every filtered memory',
      '日记里的留言由当前人格来写': 'The persona writes the comment under each diary',
      '用模板快速添加一条结构化记忆': 'Insert a structured memory from a template',
      '最近 5 周 · 点击筛选当天': 'Last 5 weeks · click to filter',
      '导入之前导出的 JSON 备份': 'Import a previously exported JSON backup',
      '一句话风格摘要显示在表格里': 'One-line style summary (shown in the table)',
      '自动记录习惯，大肥鱼会在每篇底下留言': 'Records habits; the persona leaves a comment under each entry',
      '工作区记录开关（关闭后该项目不再自动提炼）': 'Workspace recording switch (paused workspaces stop auto-extraction)',
      '技术栈：前端 __、后端 __、数据库 __': 'Stack: frontend __, backend __, database __',
      '常用命令：pnpm dev / pnpm build / pnpm test': 'Commands: pnpm dev / pnpm build / pnpm test',
      '代码约定：__': 'Conventions: __',
      '禁忌：不要 __': 'Never: __',
      '项目结构：__': 'Structure: __',
      '装了dshmeme后这里会换成真实表情包': 'Install dsh-meme to swap in real memes',
      '文案模板，可用 {name} 和 {mood}': 'Caption template, supports {name} and {mood}',
      '这条记忆没有保存来源对话': 'This memory has no captured conversation.',
      '这条记忆还没有记录来源对话': 'No source conversation recorded (manual or imported).',
      '情绪卡（没有表情包时的兜底配图，可只填部分心情）': 'Mood card (fallback art; fill only the moods you want)',
      '角色设定：口吻、性格、习惯、口头禅……日记会按这个设定来写': 'Persona: voice, personality, habits, catchphrases — diaries follow this.',
      '扫描所有工作区的旧会话，提炼成记忆（只处理装插件之前的历史）': 'Scan old sessions across every workspace (only history from before the plugin).',
      '用于估算费用：输入 token 单价（元 / 百万 token）': 'Cost estimate: input price (CNY per million tokens)',
      '用于估算费用：输出 token 单价（元 / 百万 token）': 'Cost estimate: output price (CNY per million tokens)',
      '还没有日记。今天先聊几句，日记会自动写出来；也可以点右上角「重写今天」。': 'No diary yet. Chat today and one is written automatically, or use "Rewrite today".',
      '这周还没生成周报。攒够 2 篇日记后点上面的按钮，会把日记与本周新增记忆归纳成一篇周记。': 'No report this week yet. With two diaries, the button distils the week into one entry.',
      '每轮对话结束后自动提炼的长期事实。全局记忆在所有项目生效，工作区记忆只对对应目录生效；下方可以搜索、过滤和删除。': 'Facts distilled after each turn. Global memories apply everywhere, workspace memories only in their directory; search, filter and delete below.',
    }

    /** Dynamic labels: [pattern, replacement]. */
    const EN_PATTERNS = [
      [/^(\d+) 条$/, '$1 items'],
      [/^已选 (\d+) 条$/, '$1 selected'],
      [/^(.+) · (\d+) 条$/, '$1 · $2 items'],
      [/^搜索记忆内容或标签…$/, 'Search memories or tags…'],
      [/^近 (\d+) 天新增$/, 'Added in last $1 days'],
      [/^近 (\d+) 天$/, 'Last $1 days'],
      [/^(\d+) 天$/, '$1 days'],
      [/^(\d+) 篇日记 · 共 (\d+) 篇$/, '$1 of $2 entries'],
      [/^命中 (\d+) · 权重 ([\d.]+) · (.+)$/, 'hits $1 · weight $2 · $3'],
      [/^最近 (\d+) 天 · 共 (\d+) 篇日记$/, 'Last $1 days · $2 entries'],
      [/^共 (\d+) 条$/, '$1 total'],
      [/^(\d+) 条超过 30 天未更新$/, '$1 rows untouched for 30+ days'],
      [/^(\d+) 组完全重复 · (\d+) 组疑似重复$/, '$1 exact duplicates · $2 near duplicates'],
      [/^平均长度 (\d+) 字$/, 'Average length $1 chars'],
      [/^平均 (\d+) 字$/, 'avg $1 chars'],
      [/^(.+) 的情绪卡 · (.+)$/, '$1 mood card · $2'],
      [/^更新于 (.+)$/, 'Updated $1'],
      [/^今天 · (.*)$/, 'Today · $1'],
      [/^昨天 · (.*)$/, 'Yesterday · $1'],
      [/^已选 (\d+) 条$/, '$1 selected'],
      [/^会话 (\d+)\/(\d+) · 新增 (\d+) · 合并 (\d+) · 跳过 (\d+)(.*)$/, 'sessions $1/$2 · added $3 · merged $4 · skipped $5$6'],
      [/^记忆 (\d+) 条$/, '$1 memories'],
      [/^(\d+) 条$/, '$1 items'],
      [/^(\d+) 个会话$/, '$1 sessions'],
      [/^(\d+) 条 · (\d+) 个会话$/, '$1 items · $2 sessions'],
      [/^(\d+) 条超过 30 天$/, '$1 older than 30 days'],
      [/^来源 (.+)$/, 'source $1'],
      [/^共 (\d+) 条日记$/, '$1 diary entries'],
      [/^最近 30 分钟 \+(\d+)$/, '+$1 in 30 min'],
      [/^相关记忆（(\d+)）$/, 'Related memories ($1)'],
      [/^来源对话（(\d+)）$/, 'Source conversation ($1)'],
    ]

    function tr(text) {
      if (typeof text !== 'string' || !text || isZh()) return text
      const exact = EN[text]
      if (exact !== undefined) return exact
      for (const [pattern, replacement] of EN_PATTERNS) {
        if (pattern.test(text)) return text.replace(pattern, replacement)
      }
      return text
    }

    const PROPS_TO_TRANSLATE = ['placeholder', 'title', 'alt', 'aria-label']

    function translateProps(props) {
      if (!props || typeof props !== 'object' || isZh()) return props
      let changed = false
      const next = { ...props }
      for (const key of PROPS_TO_TRANSLATE) {
        if (typeof next[key] === 'string') {
          const value = tr(next[key])
          if (value !== next[key]) {
            next[key] = value
            changed = true
          }
        }
      }
      return changed ? next : props
    }

    /** createElement that localises string children and text-bearing props. */
    const h = (type, props, ...children) => {
      const nextChildren = children.map(child => {
        if (typeof child === 'string') return tr(child)
        if (Array.isArray(child)) return child.map(item => (typeof item === 'string' ? tr(item) : item))
        return child
      })
      return React.createElement(type, translateProps(props), ...nextChildren)
    }

    const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff]/

    /** Latin words plus CJK bigrams, lowercased. */
    function tokenize(text) {
      const out = new Set()
      const source = String(text || '').toLowerCase()
      for (const word of source.split(/[^a-z0-9\u3400-\u4dbf\u4e00-\u9fff]+/)) {
        if (!word) continue
        if (CJK_CHAR.test(word)) {
          if (word.length === 1) out.add(word)
          for (let index = 0; index < word.length - 1; index += 1) out.add(word.slice(index, index + 2))
        } else if (word.length >= 2) {
          out.add(word)
        }
      }
      return out
    }

    function entryTokens(entry) {
      return tokenize(`${entry.text} ${(entry.tags || []).join(' ')} ${entry.workspace || ''}`)
    }

    /** IDF-weighted relevance ranking over a candidate pool. */
    function rankEntries(pool, query) {
      const wanted = tokenize(query)
      if (wanted.size === 0) return pool
      const sets = pool.map(entryTokens)
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
      return scored.map(item => item.entry)
    }

    /** Other memories close to this one: shared tokens plus shared tags. */
    function relatedTo(entry, pool, limit = 5) {
      const base = entryTokens(entry)
      if (base.size === 0) return []
      const baseTags = new Set(entry.tags || [])
      return pool
        .filter(item => item.id !== entry.id && !item.archived)
        .map(item => {
          const set = entryTokens(item)
          let shared = 0
          for (const token of base) if (set.has(token)) shared += 1
          const overlap = shared / Math.max(1, Math.min(base.size, set.size))
          const tagBonus = (item.tags || []).some(tag => baseTags.has(tag)) ? 0.15 : 0
          return { entry: item, score: overlap + tagBonus }
        })
        .filter(item => item.score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    }

    /** Collapse whitespace, strip list markers, cap length. */

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
    const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const MOOD_DAYS = 14
    const MOOD_KEYS = ['happy', 'angry', 'sad', 'shy', 'confused', 'daily']

    /** "今天 · 11月4日 周二" / "Today · Nov 4 · Tue", plus the update time. */
    function entryDateText(dateStr, updatedAt) {
      const [year, month, day] = String(dateStr || '').split('-').map(Number)
      const date = new Date(year || 1970, (month || 1) - 1, day || 1)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const diff = Math.round((today - date) / 86400000)
      const zh = isZh()
      const prefix = diff === 0 ? (zh ? '今天' : 'Today') : diff === 1 ? (zh ? '昨天' : 'Yesterday') : ''
      const weekday = zh ? WEEKDAYS[date.getDay()] : WEEKDAYS_EN[date.getDay()]
      const dateLabel = zh ? `${month}月${day}日 ${weekday}` : `${MONTHS_EN[date.getMonth()]} ${day} · ${weekday}`
      const time = updatedAt
        ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : ''
      return {
        title: `${prefix ? `${prefix} · ` : ''}${dateLabel}`,
        updated: time ? (zh ? `更新于 ${time}` : `Updated ${time}`) : '',
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
          full: isZh()
            ? `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
            : `${MONTHS_EN[date.getMonth()]} ${date.getDate()} · ${WEEKDAYS_EN[date.getDay()]}`,
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

      /* dashboard bento */
      .lm-dash { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 10px }
      .lm-dash > .lm-span-2 { grid-column: span 2 }
      .lm-dash > .lm-span-3 { grid-column: span 3 }
      .lm-dash > .lm-span-4 { grid-column: span 4 }
      .lm-dash > .lm-span-6 { grid-column: span 6 }
      .lm-dash > .lm-span-8 { grid-column: span 8 }
      .lm-dash > .lm-span-12 { grid-column: span 12 }
      .lm-panel { display: flex; flex-direction: column; gap: 6px; min-width: 0 }
      .lm-panel-head { display: flex; align-items: center; gap: 6px; min-width: 0 }
      .lm-bar { transition: height .55s cubic-bezier(.2,.7,.3,1), background .2s ease, opacity .2s ease }
      .lm-bar:hover { background: var(--dsw-alias-brand-primary) !important }
      .lm-cell { transition: transform .16s ease, box-shadow .16s ease, outline-color .2s ease }
      .lm-cell:hover { transform: scale(1.16); box-shadow: 0 0 0 2px var(--dsw-alias-brand-primary) }
      .lm-seg { display: inline-flex; align-items: center; padding: 2px; gap: 2px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-border-l1) 35%, transparent) }
      .lm-seg button { border: none; background: transparent; color: inherit; font-size: 11px; line-height: 16px; padding: 2px 8px; border-radius: 999px; cursor: pointer; transition: background .18s ease, color .18s ease }
      .lm-seg button:hover { background: color-mix(in srgb, var(--dsw-alias-border-l1) 45%, transparent) }
      .lm-seg button.active { background: var(--dsw-alias-brand-primary); color: #fff }
      .lm-legend { transition: background .16s ease }
      .lm-legend:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent) }
      .lm-live-dot { width: 6px; height: 6px; border-radius: 999px; background: #3fb950; margin-left: auto; flex: none }
      @media (max-width: 760px) {
        .lm-dash { grid-template-columns: repeat(2, minmax(0, 1fr)) }
        .lm-dash > * { grid-column: span 2 !important }
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

    const MEMORY_TEMPLATES = [
      '技术栈：前端 __、后端 __、数据库 __',
      '常用命令：pnpm dev / pnpm build / pnpm test',
      '代码约定：__',
      '禁忌：不要 __',
      '项目结构：__',
    ]

    /** What the plugin picked up in the last day, grouped by session. */
    function RecentLearn(props) {
      const { entries, onPick } = props
      const rows = useMemo(() => {
        const cutoff = Date.now() - 24 * 3600 * 1000
        const items = []
        for (const entry of entries) {
          for (const origin of entry.origins || []) {
            if ((origin.at || 0) >= cutoff) items.push({ entry, origin })
          }
        }
        items.sort((a, b) => (b.origin.at || 0) - (a.origin.at || 0))
        return items.slice(0, 8)
      }, [entries])
      if (rows.length === 0) return null
      const sessions = new Set(rows.map(row => row.origin.sessionId || '')).size
      return h(
        'div',
        {
          className: 'lm-glass lm-fade',
          style: glass({ borderRadius: 14, padding: '10px 14px', marginBottom: 12 }),
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 } },
          h('div', { style: { fontSize: 12, color: C.sub } }, '最近 24 小时学到'),
          h('div', { style: { fontSize: 11, color: C.faint } }, `${rows.length} 条 · ${sessions} 个会话`),
          h('div', { style: { fontSize: 11, color: C.faint, marginLeft: 'auto' } }, '点一条可筛出来'),
        ),
        rows.map((row, index) =>
          h(
            'div',
            {
              key: `${row.entry.id}-${index}`,
              onClick: () => onPick(row.entry.text),
              title: '点击在列表里筛出这条',
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '3px 0',
                cursor: 'pointer',
                lineHeight: '17px',
              },
            },
            h(
              Chip,
              { color: row.entry.scope === 'global' ? C.brand : C.sub },
              row.entry.scope === 'global' ? '全局' : '工作区',
            ),
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
              row.entry.text,
            ),
            h('div', { style: { flex: 'none', fontSize: 10, color: C.faint } }, relTime(row.origin.at || 0)),
          ),
        ),
      )
    }

    /** A memory opened as its own page: full text, origins and actions. */
    function MemoryDetail(props) {
      const { entry, onBack, onChanged, onForget, onArchive, related, onOpen } = props
      const [editing, setEditing] = useState(false)
      const [form, setForm] = useState({
        text: entry.text,
        tags: (entry.tags || []).join(', '),
        scope: entry.scope,
        workspace: entry.workspace || '',
      })
      const [busy, setBusy] = useState(false)

      const save = useCallback(async () => {
        setBusy(true)
        try {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              id: entry.id,
              text: form.text,
              tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
              scope: form.scope,
              workspace: form.workspace,
            }),
          })
          setEditing(false)
          await onChanged()
        } finally {
          setBusy(false)
        }
      }, [entry.id, form, onChanged])

      const origins = Array.isArray(entry.origins) ? entry.origins : []

      return h(
        'div',
        { className: 'lm-fade' },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
          h(
            'button',
            {
              type: 'button',
              onClick: onBack,
              style: {
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 999,
                border: `1px solid ${C.line}`,
                background: 'transparent',
                color: C.sub,
                cursor: 'pointer',
              },
            },
            '← 返回记忆列表',
          ),
          h('div', { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, '记忆详情'),
          h(
            'div',
            { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
            h(
              'button',
              {
                type: 'button',
                onClick: () => setEditing(previous => !previous),
                style: {
                  fontSize: 12,
                  padding: '3px 12px',
                  borderRadius: 999,
                  border: `1px solid ${C.brand}`,
                  background: 'transparent',
                  color: C.brand,
                  cursor: 'pointer',
                },
              },
              editing ? '取消编辑' : '编辑',
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => onArchive(entry, !entry.archived),
                style: {
                  fontSize: 12,
                  padding: '3px 12px',
                  borderRadius: 999,
                  border: `1px solid ${C.line}`,
                  background: 'transparent',
                  color: C.sub,
                  cursor: 'pointer',
                },
              },
              entry.archived ? '恢复' : '归档',
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => onForget(entry),
                style: {
                  fontSize: 12,
                  padding: '3px 12px',
                  borderRadius: 999,
                  border: `1px solid ${C.err}`,
                  background: 'transparent',
                  color: C.err,
                  cursor: 'pointer',
                },
              },
              '删除',
            ),
          ),
        ),

        h(
          'div',
          {
            className: 'lm-glass',
            style: glass({ borderRadius: 14, padding: '16px 18px', marginBottom: 12 }),
          },
          h(
            'div',
            { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' } },
            h(Chip, { color: entry.scope === 'global' ? C.brand : C.sub }, entry.scope === 'global' ? '全局' : '工作区'),
            entry.archived ? h(Chip, { color: C.faint }, '已归档') : null,
            entry.workspace ? h('span', { style: { fontSize: 11, color: C.faint } }, entry.workspace) : null,
            h(
              'span',
              { style: { marginLeft: 'auto', fontSize: 11, color: C.faint } },
              `来源 ${entry.source || 'auto'} · 命中 ${entry.hits || 0} · 权重 ${(entry.weight || 1).toFixed(1)}`,
            ),
          ),

          editing
            ? h(
                'div',
                null,
                h('textarea', {
                  value: form.text,
                  rows: 4,
                  onChange: event => setForm({ ...form, text: event.target.value }),
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
                  { style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } },
                  h('input', {
                    value: form.tags,
                    onChange: event => setForm({ ...form, tags: event.target.value }),
                    placeholder: '标签，逗号分隔',
                    style: {
                      flex: '1 1 160px',
                      fontSize: 12,
                      padding: '6px 9px',
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
                      value: form.scope,
                      onChange: event => setForm({ ...form, scope: event.target.value }),
                      style: {
                        fontSize: 12,
                        padding: '6px 9px',
                        borderRadius: 8,
                        border: `1px solid ${C.line}`,
                        background: 'transparent',
                        color: C.ink,
                      },
                    },
                    h('option', { value: 'global' }, '全局'),
                    h('option', { value: 'workspace' }, '工作区'),
                  ),
                  form.scope === 'workspace'
                    ? h('input', {
                        value: form.workspace,
                        onChange: event => setForm({ ...form, workspace: event.target.value }),
                        placeholder: '工作区目录',
                        style: {
                          flex: '1 1 220px',
                          fontSize: 12,
                          padding: '6px 9px',
                          borderRadius: 8,
                          border: `1px solid ${C.line}`,
                          background: 'transparent',
                          color: C.ink,
                          outline: 'none',
                        },
                      })
                    : null,
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy,
                      onClick: save,
                      style: {
                        fontSize: 12,
                        padding: '6px 14px',
                        borderRadius: 999,
                        border: 'none',
                        background: C.brand,
                        color: '#fff',
                        cursor: busy ? 'default' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      },
                    },
                    '保存',
                  ),
                ),
              )
            : h('div', { style: { fontSize: 15, lineHeight: '26px', color: C.ink, wordBreak: 'break-word' } }, entry.text),

          (entry.tags || []).length
            ? h(
                'div',
                { style: { display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' } },
                entry.tags.map(tag => h(Chip, { key: tag }, tag)),
              )
            : null,

          h(
            'div',
            { style: { display: 'flex', gap: 14, marginTop: 12, fontSize: 11, color: C.faint, flexWrap: 'wrap' } },
            h('span', null, `创建 ${relTime(entry.createdAt || 0)}`),
            h('span', null, `更新 ${relTime(entry.updatedAt)}`),
            h('span', null, `最近使用 ${relTime(entry.lastUsedAt || entry.updatedAt)}`),
          ),
        ),

        h(
          'div',
          {
            className: 'lm-glass',
            style: glass({ borderRadius: 14, padding: '14px 18px' }),
          },
          h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 8 } }, `来源对话（${origins.length}）`),
          origins.length
            ? origins
                .slice()
                .reverse()
                .map((origin, index) =>
                  h(
                    'div',
                    {
                      key: `${origin.sessionId}-${origin.turn}-${index}`,
                      style: {
                        padding: '8px 0',
                        borderTop: index === 0 ? 'none' : `1px dashed ${C.line}`,
                      },
                    },
                    h(
                      'div',
                      { style: { fontSize: 10, color: C.faint, marginBottom: 4 } },
                      `${origin.sessionId || '未知会话'} · 第 ${origin.turn || '?'} 轮 · ${relTime(origin.at || 0)}`,
                    ),
                    origin.user
                      ? h('div', { style: { fontSize: 12, lineHeight: '19px', color: C.ink } }, `用户：${origin.user}`)
                      : null,
                    origin.assistant
                      ? h(
                          'div',
                          { style: { fontSize: 12, lineHeight: '19px', color: C.sub, marginTop: 2 } },
                          `助手：${origin.assistant}`,
                        )
                      : null,
                  ),
                )
            : h('div', { style: { fontSize: 12, color: C.faint } }, '这条记忆还没有记录来源对话（可能是手动或导入的）。'),
        ),

        related && related.length
          ? h(
              'div',
              {
                className: 'lm-glass',
                style: glass({ borderRadius: 14, padding: '14px 18px', marginTop: 12 }),
              },
              h(
                'div',
                { style: { fontSize: 12, color: C.sub, marginBottom: 6 } },
                `相关记忆（${related.length}）`,
              ),
              related.map(item =>
                h(
                  'div',
                  {
                    key: item.entry.id,
                    onClick: () => onOpen(item.entry.id),
                    title: '打开这条相关记忆',
                    className: 'lm-row',
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 4px',
                      borderRadius: 6,
                      cursor: 'pointer',
                    },
                  },
                  h(Chip, { color: item.entry.scope === 'global' ? C.brand : C.sub }, item.entry.scope === 'global' ? '全局' : '工作区'),
                  h(
                    'div',
                    {
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
                    item.entry.text,
                  ),
                  h('div', { style: { flex: 'none', fontSize: 10, color: C.faint } }, item.score.toFixed(2)),
                ),
              ),
            )
          : null,
      )
    }

    /** Compact metric tile used by the dashboard rows. */
    function Tile(props) {
      return h(
        'div',
        {
          className: `${props.span || ''} lm-tilt lm-spot lm-glass lm-fade`,
          onClick: props.onPick,
          title: props.onPick ? props.hint || '点击筛选' : undefined,
          style: glass({
            borderRadius: 14,
            padding: '12px 14px',
            minWidth: 0,
            cursor: props.onPick ? 'pointer' : 'default',
          }),
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
              className: props.onPick ? 'lm-row' : '',
              onClick: props.onPick ? () => props.onPick(label) : undefined,
              title: props.onPick ? `筛选：${label}` : label,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                cursor: props.onPick ? 'pointer' : 'default',
                borderRadius: 6,
                padding: '0 4px',
              },
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

    /** The statistics dashboard: bento panels with live, clickable charts. */
    function Dashboard(props) {
      const { analysis, entries, range, onRange, dayFilter, onDay, onScope, onTag, onWorkspace } = props
      const daysSpan = range > 0 ? range : 90
      const stats = useMemo(() => {
        const dayKeyOf = ts => {
          const date = new Date(ts)
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const now = new Date()
        const days = []
        for (let offset = daysSpan - 1; offset >= 0; offset -= 1) {
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
        let inRange = 0
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
          if (slot) {
            slot.count += 1
            inRange += 1
          }
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
          heatOffset: heat.length ? new Date(`${heat[0].key}T00:00:00`).getDay() : 0,
          hits,
          archived,
          globalCount,
          workspaceCount,
          inRange,
          sources: [...sources].sort((a, b) => b[1] - a[1]),
          tags: [...tags].sort((a, b) => b[1] - a[1]).slice(0, 7),
          workspaces: [...workspaces].sort((a, b) => b[1] - a[1]).slice(0, 5),
          recent: [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5),
        }
      }, [entries, daysSpan])

      const total = Math.max(1, entries.length)
      const radius = 26
      const circumference = 2 * Math.PI * radius
      const segments = [
        { label: '全局', value: stats.globalCount, color: C.brand, pick: () => onScope && onScope('global') },
        {
          label: '工作区',
          value: stats.workspaceCount,
          color: '#b08cff',
          pick: () => onScope && onScope('workspace'),
        },
        {
          label: '已归档',
          value: stats.archived,
          color: 'color-mix(in srgb, var(--dsw-alias-border-l1) 80%, transparent)',
          pick: () => onTag && onTag('archived:true'),
        },
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
      const rangeLabel = range === 0 ? '全部' : `${range} 天`

      const usage = props.usage || { days: [], total: { input: 0, output: 0, cost: 0, calls: 0 } }
      const uDays = Array.isArray(usage.days) ? usage.days : []
      const maxTok = uDays.reduce((top, day) => Math.max(top, day.input, day.output), 1)
      const maxCost = uDays.reduce((top, day) => Math.max(top, day.cost), 0.0001)
      const chartWidth = 300
      const chartHeight = 88
      const px = index => (uDays.length <= 1 ? chartWidth / 2 : (index / (uDays.length - 1)) * chartWidth)
      const pyTok = value => chartHeight - (value / maxTok) * (chartHeight - 6)
      const pyCost = value => chartHeight - (value / maxCost) * (chartHeight - 6)
      const line = fn => uDays.map((day, index) => `${px(index).toFixed(1)},${fn(day).toFixed(1)}`).join(' ')
      const fmtTok = value =>
        value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}k` : String(value)

      const panel = (span, headParts, body) =>
        h(
          'div',
          {
            className: `${span} lm-glass lm-panel lm-spot lm-fade`,
            style: glass({ borderRadius: 14, padding: '12px 14px' }),
          },
          h('div', { className: 'lm-panel-head' }, ...headParts),
          body,
        )

      const headText = text => h('span', { style: { color: C.sub, fontSize: 12 } }, text)
      const headMeta = text => h('span', { style: { color: C.faint, fontSize: 11 } }, text)

      return h(
        'div',
        { className: 'lm-dash', style: { marginBottom: 12 } },
        h(Tile, { span: 'lm-span-2', label: '记忆总数', value: analysis.total }),
        h(Tile, { span: 'lm-span-2', label: '全局', value: analysis.global }),
        h(Tile, { span: 'lm-span-2', label: '工作区', value: analysis.workspace }),
        h(Tile, { span: 'lm-span-2', label: '已归档', value: stats.archived, color: C.faint }),
        h(Tile, { span: 'lm-span-2', label: '累计命中', value: stats.hits, color: C.brand }),
        h(Tile, {
          span: 'lm-span-2',
          label: '健康度',
          value: analysis.health,
          color: healthColor,
          sub: `平均 ${analysis.avgLength} 字`,
        }),

        panel(
          'lm-span-8',
          [
            headText(`近 ${rangeLabel}新增`),
            headMeta(`${stats.inRange} 条`),
            h(
              'div',
              { className: 'lm-seg', style: { marginLeft: 'auto' } },
              [
                [7, '7 天'],
                [14, '14 天'],
                [30, '30 天'],
                [0, '全部'],
              ].map(([value, label]) =>
                h(
                  'button',
                  {
                    key: label,
                    type: 'button',
                    className: range === value ? 'active' : '',
                    onClick: () => onRange && onRange(value),
                  },
                  label,
                ),
              ),
            ),
          ],
          h(
            'div',
            { style: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 92, marginTop: 4 } },
            stats.days.map(day =>
              h(
                'div',
                {
                  key: day.key,
                  title: `${day.label} · ${day.count} 条（点击筛选）`,
                  onClick: () => onDay && onDay(day.key),
                  style: {
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    cursor: 'pointer',
                  },
                },
                h('div', {
                  className: 'lm-bar',
                  style: {
                    height: `${Math.max(3, Math.round((day.count / maxBar) * 100))}%`,
                    borderRadius: 4,
                    background:
                      dayFilter === day.key
                        ? C.brand
                        : day.count
                          ? `color-mix(in srgb, ${C.brand} 78%, transparent)`
                          : 'color-mix(in srgb, var(--dsw-alias-border-l1) 45%, transparent)',
                  },
                }),
              ),
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 3, marginTop: 6 } },
            stats.days.map(day =>
              h(
                'div',
                {
                  key: `${day.key}-l`,
                  style: { flex: 1, textAlign: 'center', fontSize: 9, color: C.faint, whiteSpace: 'nowrap' },
                },
                stats.days.length <= 14 ? day.label : '',
              ),
            ),
          ),
        ),

        panel(
          'lm-span-4',
          [headText('分布'), headMeta('点击筛选')],
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 } },
            h(
              'svg',
              { width: 84, height: 84, viewBox: '0 0 64 64', className: 'lm-ring', style: { flex: 'none' } },
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
                    className: 'lm-legend',
                    onClick: segment.pick,
                    title: `筛选：${segment.label}`,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      color: C.sub,
                      lineHeight: '20px',
                      cursor: 'pointer',
                      borderRadius: 6,
                      padding: '0 4px',
                    },
                  },
                  h('span', {
                    style: { width: 8, height: 8, borderRadius: 3, background: segment.color, flex: 'none' },
                  }),
                  h('span', null, segment.label),
                  h(
                    'span',
                    { style: { marginLeft: 'auto', color: C.faint } },
                    `${segment.value} · ${Math.round((segment.value / total) * 100)}%`,
                  ),
                ),
              ),
            ),
          ),
          h(
            'div',
            { style: { fontSize: 10, color: C.faint, marginTop: 6, lineHeight: '15px' } },
            `来源：${stats.sources.map(([name, count]) => `${name} ${count}`).join(' · ') || '暂无'}`,
          ),
        ),

        panel(
          'lm-span-6',
          [headText('来源明细'), headMeta('按写入方式')],
          stats.sources.length
            ? h(BarList, {
                rows: stats.sources.map(([name, count]) => [name, count]),
                color: '#49e0d0',
              })
            : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有数据'),
        ),

        panel(
          'lm-span-6',
          [headText('最近新增'), headMeta('最新 5 条')],
          stats.recent.length
            ? stats.recent.map(entry =>
                h(
                  'div',
                  {
                    key: entry.id,
                    style: { display: 'flex', alignItems: 'flex-start', gap: 6, padding: '2px 0', lineHeight: '17px' },
                  },
                  h(Chip, { color: entry.scope === 'global' ? C.brand : C.sub }, entry.scope === 'global' ? '全局' : '工作区'),
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
                    entry.text,
                  ),
                  h(
                    'div',
                    { style: { flex: 'none', fontSize: 10, color: C.faint } },
                    relTime(entry.createdAt || 0),
                  ),
                ),
              )
            : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有记忆'),
        ),

        panel(
          'lm-span-12',
          [
            headText('Token / 费用趋势'),
            headMeta(
              `近 14 天 · 调用 ${usage.total.calls} 次 · 输入 ${fmtTok(usage.total.input)} · 输出 ${fmtTok(
                usage.total.output,
              )} · 估算 ¥${usage.total.cost.toFixed(3)}`,
            ),
          ],
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 } },
            h(
              'div',
              { style: { flex: 1, minWidth: 0 } },
              h(
                'svg',
                {
                  viewBox: '0 0 300 92',
                  preserveAspectRatio: 'none',
                  style: { width: '100%', height: 92, display: 'block' },
                },
                h('line', {
                  x1: 0,
                  y1: 88,
                  x2: 300,
                  y2: 88,
                  stroke: 'color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent)',
                  strokeWidth: 1,
                }),
                h('polyline', {
                  points: line(day => pyTok(day.input)),
                  fill: 'none',
                  stroke: C.brand,
                  strokeWidth: 2,
                  strokeLinejoin: 'round',
                }),
                h('polyline', {
                  points: line(day => pyTok(day.output)),
                  fill: 'none',
                  stroke: '#b08cff',
                  strokeWidth: 2,
                  strokeLinejoin: 'round',
                }),
                h('polyline', {
                  points: line(day => pyCost(day.cost)),
                  fill: 'none',
                  stroke: '#ff8ac2',
                  strokeWidth: 1.5,
                  strokeDasharray: '3 3',
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.faint } },
                uDays.map(day => h('span', { key: day.date }, day.label)),
              ),
            ),
            h(
              'div',
              { style: { flex: 'none', fontSize: 11, color: C.sub, lineHeight: '18px', minWidth: 96 } },
              h('div', null, h('span', { style: { color: C.brand } }, '●'), ` 输入 ${fmtTok(usage.total.input)}`),
              h('div', null, h('span', { style: { color: '#b08cff' } }, '●'), ` 输出 ${fmtTok(usage.total.output)}`),
              h('div', null, h('span', { style: { color: '#ff8ac2' } }, '—'), ` 费用 ¥${usage.total.cost.toFixed(3)}`),
              h('div', { style: { color: C.faint, marginTop: 2 } }, '单价可在「提炼设置」里改'),
            ),
          ),
        ),

        panel(
          'lm-span-6',
          [headText('标签 Top'), headMeta('点击按标签筛选')],
          stats.tags.length
            ? h(BarList, {
                rows: stats.tags,
                color: C.brand,
                onPick: label => onTag && onTag(`tag:${label}`),
              })
            : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有标签'),
        ),

        panel(
          'lm-span-6',
          [headText('活跃度'), headMeta('最近 5 周 · 点击筛选当天')],
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 4 } },
            Array.from({ length: stats.heatOffset }, (_, index) => h('div', { key: `blank-${index}` })),
            stats.heat.map(day =>
              h('div', {
                key: day.key,
                className: 'lm-cell',
                title: `${day.key} · ${day.count} 条（点击筛选）`,
                onClick: () => onDay && onDay(day.key),
                style: {
                  aspectRatio: '1',
                  borderRadius: 3,
                  cursor: 'pointer',
                  outline: dayFilter === day.key ? `1px solid ${C.brand}` : 'none',
                  background: day.count
                    ? `color-mix(in srgb, ${C.brand} ${Math.min(92, 20 + (day.count / heatMax) * 72)}%, transparent)`
                    : 'color-mix(in srgb, var(--dsw-alias-border-l1) 32%, transparent)',
                },
              }),
            ),
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginTop: 4 } },
            ['日', '一', '二', '三', '四', '五', '六'].map(label =>
              h('div', { key: label, style: { textAlign: 'center', fontSize: 9, color: C.faint } }, label),
            ),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 9, color: C.faint } },
            h('span', null, '少'),
            [0.15, 0.35, 0.6, 0.85].map(opacity =>
              h('span', {
                key: opacity,
                style: {
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: `color-mix(in srgb, ${C.brand} ${opacity * 100}%, transparent)`,
                },
              }),
            ),
            h('span', null, '多'),
          ),
        ),

        panel(
          'lm-span-6',
          [headText('工作区分布'), headMeta('点击按工作区筛选')],
          stats.workspaces.length
            ? h(BarList, {
                rows: stats.workspaces,
                color: '#b08cff',
                onPick: label => onWorkspace && onWorkspace(label === '（未记录）' ? '' : label),
              })
            : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有工作区记忆'),
        ),

        panel(
          'lm-span-6',
          [headText('健康与待办'), h('span', { style: { color: healthColor, fontSize: 11, marginLeft: 'auto' } }, `${analysis.health}/100`)],
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 } },
            h(
              'svg',
              { width: 52, height: 52, viewBox: '0 0 64 64', className: 'lm-ring', style: { flex: 'none' } },
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
              { style: { flex: 1, minWidth: 0, fontSize: 11, color: C.sub, lineHeight: '17px' } },
              h('div', null, `${analysis.stale30d} 条超过 30 天未更新`),
              h('div', null, `${analysis.duplicates.length} 组完全重复 · ${analysis.pairs.length} 组疑似重复`),
              h('div', null, `平均长度 ${analysis.avgLength} 字`),
            ),
          ),
          analysis.issues.slice(0, 2).map((issue, index) =>
            h(
              'div',
              {
                key: `issue-${index}`,
                style: { display: 'flex', gap: 6, fontSize: 11, color: C.sub, lineHeight: '17px', marginTop: 4 },
              },
              h('span', {
                style: {
                  width: 5,
                  height: 5,
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
      const [range, setRange] = useState(14)
      const [dayFilter, setDayFilter] = useState('')
      const [workspaceFilter, setWorkspaceFilter] = useState('')
      const [everyTurnsDraft, setEveryTurnsDraft] = useState('')
      const [templateOpen, setTemplateOpen] = useState(false)
      const [detailId, setDetailId] = useState('')

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

      const applyTemplate = useCallback(
        async text => {
          setTemplateOpen(false)
          const response = await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'save', text, scope: 'workspace' }),
          })
          const data = await readJson(response)
          await load()
          const created = ((data && data.entries) || []).find(entry => entry.text === text)
          if (created) startEdit(created)
        },
        [load, startEdit],
      )

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

      useEffect(() => {
        const timer = setInterval(() => {
          load()
        }, 20000)
        return () => clearInterval(timer)
      }, [load])

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
        const dayKeyOf = ts => {
          const date = new Date(ts)
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const needle = words.join(' ').toLowerCase()
        const matched = entries.filter(entry => {
          if (workspaceFilter && (entry.workspace || '') !== workspaceFilter) return false
          if (dayFilter && dayKeyOf(entry.createdAt || 0) !== dayFilter) return false
          if (!spec.archived && entry.archived) return false
          if (scope !== 'all' && entry.scope !== scope) return false
          if (spec.scope && entry.scope !== spec.scope) return false
          if (spec.tag && !(entry.tags || []).some(tag => String(tag).toLowerCase().includes(spec.tag))) return false
          if (spec.before && (entry.createdAt || 0) >= spec.before) return false
          return true
        })
        if (!needle) return matched
        return rankEntries(matched, needle)
      }, [entries, query, scope, dayFilter, workspaceFilter])

      const healthColor = analysis
        ? analysis.health >= 80
          ? C.ok
          : analysis.health >= 50
            ? C.warn
            : C.err
        : C.line

      const busy = state.status === 'loading' || state.status === 'refreshing'

      const recentCutoff = Date.now() - 30 * 60 * 1000
      const recentCount = entries.filter(entry =>
        (entry.origins || []).some(origin => (origin.at || 0) >= recentCutoff),
      ).length

      const detailEntry = entries.find(entry => entry.id === detailId)
      if (detailEntry) {
        return h(MemoryDetail, {
          entry: detailEntry,
          onBack: () => setDetailId(''),
          onChanged: load,
          onForget: async target => {
            await forget(target.id)
            setDetailId('')
          },
          onArchive: async (target, archived) => {
            await fetch(API, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'archive-memories', ids: [target.id], archived }),
            })
            await load()
          },
          related: relatedTo(detailEntry, entries),
          onOpen: id => setDetailId(id),
        })
      }

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
          data && recentCount > 0
            ? h(
                'span',
                {
                  title: '最近 30 分钟由会话记录的记忆',
                  style: {
                    fontSize: 11,
                    color: C.brand,
                    padding: '1px 8px',
                    borderRadius: 999,
                    border: `1px solid ${C.brand}`,
                  },
                },
                `最近 30 分钟 +${recentCount}`,
              )
            : null,
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

              h(
                Safe,
                null,
                h(Dashboard, {
                  analysis,
                  entries,
                  range,
                  usage: data.usage,
                  dayFilter,
                  onRange: value => setRange(value),
                  onDay: key => setDayFilter(previous => (previous === key ? '' : key)),
                  onScope: value => setScope(value),
                  onTag: token => {
                    setQuery(token)
                    setDayFilter('')
                  },
                  onWorkspace: value => {
                    setWorkspaceFilter(previous => (previous === value ? '' : value))
                    setDayFilter('')
                  },
                }),
              ),

              h(
                Safe,
                null,
                h(RecentLearn, {
                  entries,
                  onPick: text => {
                    setQuery(text)
                    setDayFilter('')
                    setWorkspaceFilter('')
                  },
                }),
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
                      value: everyTurnsDraft !== '' ? everyTurnsDraft : settings.everyTurns || 1,
                      disabled: settings.auto === false,
                      onChange: event => setEveryTurnsDraft(event.target.value),
                      onBlur: () => {
                        const next = Math.min(20, Math.max(1, Number(everyTurnsDraft) || Number(settings.everyTurns) || 1))
                        setEveryTurnsDraft('')
                        if (next !== Number(settings.everyTurns)) void saveSettings({ everyTurns: next })
                      },
                      onKeyDown: event => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      },
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
                  h(
                    'label',
                    {
                      style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.ink },
                      title: '用于估算费用：输入 token 单价（元 / 百万 token）',
                    },
                    '输入 ¥/M',
                    h('input', {
                      type: 'number',
                      min: 0,
                      step: 0.1,
                      defaultValue: settings.priceInput ?? 2,
                      onBlur: event => {
                        const next = Math.max(0, Number(event.target.value) || 0)
                        if (next !== Number(settings.priceInput)) void saveSettings({ priceInput: next })
                      },
                      style: {
                        width: 64,
                        fontSize: 12,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: `1px solid ${C.line}`,
                        background: 'transparent',
                        color: C.ink,
                      },
                    }),
                  ),
                  h(
                    'label',
                    {
                      style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.ink },
                      title: '用于估算费用：输出 token 单价（元 / 百万 token）',
                    },
                    '输出 ¥/M',
                    h('input', {
                      type: 'number',
                      min: 0,
                      step: 0.1,
                      defaultValue: settings.priceOutput ?? 8,
                      onBlur: event => {
                        const next = Math.max(0, Number(event.target.value) || 0)
                        if (next !== Number(settings.priceOutput)) void saveSettings({ priceOutput: next })
                      },
                      style: {
                        width: 64,
                        fontSize: 12,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: `1px solid ${C.line}`,
                        background: 'transparent',
                        color: C.ink,
                      },
                    }),
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

              dayFilter || workspaceFilter
                ? h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' } },
                    dayFilter ? h(Chip, { color: C.brand }, `日期 ${dayFilter}`) : null,
                    workspaceFilter
                      ? h(Chip, { color: '#b08cff' }, `工作区 ${workspaceFilter.split('/').slice(-1)[0] || workspaceFilter}`)
                      : null,
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => {
                          setDayFilter('')
                          setWorkspaceFilter('')
                        },
                        style: {
                          fontSize: 11,
                          padding: '1px 8px',
                          borderRadius: 999,
                          border: `1px solid ${C.line}`,
                          background: 'transparent',
                          color: C.sub,
                          cursor: 'pointer',
                        },
                      },
                      '清除',
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
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setSelected(filtered.map(entry => entry.id)),
                    title: '选择当前筛选出的全部记忆',
                    style: {
                      fontSize: 12,
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      background: 'transparent',
                      color: C.sub,
                      cursor: 'pointer',
                    },
                  },
                  '全选',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setTemplateOpen(previous => !previous),
                    title: '用模板快速添加一条结构化记忆',
                    style: {
                      fontSize: 12,
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1px solid ${templateOpen ? C.brand : C.line}`,
                      background: 'transparent',
                      color: templateOpen ? C.brand : C.sub,
                      cursor: 'pointer',
                    },
                  },
                  '模板',
                ),
                h(
                  'span',
                  { style: { fontSize: 11, color: C.faint, alignSelf: 'center' } },
                  `${filtered.length} 条`,
                ),
              ),

              templateOpen
                ? h(
                    'div',
                    {
                      className: 'lm-glass lm-fade',
                      style: glass({
                        borderRadius: 12,
                        padding: '8px 12px',
                        marginBottom: 8,
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }),
                    },
                    h('span', { style: { fontSize: 11, color: C.faint } }, '插入模板：'),
                    MEMORY_TEMPLATES.map(text =>
                      h(
                        'button',
                        {
                          key: text,
                          type: 'button',
                          title: text,
                          onClick: () => applyTemplate(text),
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
                        text.split('：')[0] || text,
                      ),
                    ),
                  )
                : null,

              h(
                'div',
                {
                  className: 'lm-fade',
                  style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 10,
                    marginBottom: 12,
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
                          className: 'lm-row lm-glass lm-fade',
                          style: glass({
                            padding: '10px 12px',
                            borderRadius: 12,
                            animationDelay: `${Math.min(index, 10) * 22}ms`,
                            display: 'flex',
                            flexDirection: 'column',
                          }),
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
                                {
                                  title: `创建 ${relTime(entry.createdAt || 0)} · 更新 ${relTime(entry.updatedAt)} · 权重 ${(entry.weight || 1).toFixed(1)}`,
                                  style: { fontSize: 11, color: C.faint, marginLeft: 'auto', whiteSpace: 'nowrap' },
                                },
                                `命中 ${entry.hits || 0} · 权重 ${(entry.weight || 1).toFixed(1)} · ${relTime(entry.updatedAt)}`,
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
                                  entry.tags.map(tag =>
                                    h(
                                      'span',
                                      {
                                        key: tag,
                                        title: `按标签筛选：${tag}`,
                                        onClick: () => setQuery(`tag:${tag}`),
                                        style: { cursor: 'pointer' },
                                      },
                                      h(Chip, null, tag),
                                    ),
                                  ),
                                )
                              : null,
                            h(
                              'div',
                              {
                                style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 },
                                title: `权重 ${(entry.weight || 1).toFixed(1)} / 5（每次合并 +0.3）`,
                              },
                              h('span', { style: { fontSize: 10, color: C.faint } }, '权重'),
                              h(
                                'div',
                                {
                                  style: {
                                    width: 72,
                                    height: 4,
                                    borderRadius: 999,
                                    background: 'color-mix(in srgb, var(--dsw-alias-border-l1) 45%, transparent)',
                                    overflow: 'hidden',
                                  },
                                },
                                h('div', {
                                  style: {
                                    width: `${Math.min(100, Math.round(((entry.weight || 1) / 5) * 100))}%`,
                                    height: '100%',
                                    borderRadius: 999,
                                    background: C.brand,
                                  },
                                }),
                              ),
                              h(
                                'span',
                                { style: { fontSize: 10, color: C.faint } },
                                `${(entry.weight || 1).toFixed(1)} / 5`,
                              ),
                            ),
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
                            h(
                              'button',
                              {
                                type: 'button',
                                onClick: () => setDetailId(entry.id),
                                style: {
                                  marginTop: 6,
                                  marginLeft: 10,
                                  padding: 0,
                                  fontSize: 11,
                                  color: C.brand,
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                },
                              },
                              '打开独立页 ›',
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

    /** Diary dashboard: streak, mood mix, habits and a writing heatmap. */
    function DiaryDash(props) {
      const { entries, moodFilter, dayFilter, onMood, onDay, onHabit } = props
      const stats = useMemo(() => {
        const dayKeyOf = ts => {
          const date = new Date(ts)
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const dates = new Set(entries.map(entry => entry.date))
        const cursor = new Date()
        if (!dates.has(dayKeyOf(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
        let streak = 0
        while (dates.has(dayKeyOf(cursor.getTime()))) {
          streak += 1
          cursor.setDate(cursor.getDate() - 1)
        }
        const since = Date.now() - 30 * 86400000
        const moods = new Map()
        const habits = new Map()
        let words = 0
        let count30 = 0
        for (const entry of entries) {
          const ts = Date.parse(`${entry.date}T00:00:00`)
          if (!Number.isFinite(ts) || ts < since) continue
          count30 += 1
          const mood = entry.mood || 'daily'
          moods.set(mood, (moods.get(mood) || 0) + 1)
          for (const habit of entry.habits || []) {
            const text = typeof habit === 'string' ? habit : habit && habit.text
            if (text) habits.set(text, (habits.get(text) || 0) + 1)
          }
          words += (entry.diary || '').length
        }
        const heat = []
        for (let offset = 34; offset >= 0; offset -= 1) {
          const date = new Date()
          date.setDate(date.getDate() - offset)
          heat.push({ key: dayKeyOf(date.getTime()), has: dates.has(dayKeyOf(date.getTime())) })
        }
        return {
          streak,
          moods: [...moods].sort((a, b) => b[1] - a[1]),
          moodTotal: [...moods].reduce((sum, [, count]) => sum + count, 0),
          habits: [...habits].sort((a, b) => b[1] - a[1]).slice(0, 5),
          avg: count30 ? Math.round(words / count30) : 0,
          count30,
          heat,
        }
      }, [entries])

      const radius = 26
      const circumference = 2 * Math.PI * radius
      const total = Math.max(1, stats.moodTotal)
      let offset = 0
      const arcs = stats.moods.map(([mood, count]) => {
        const length = (count / total) * circumference
        const arc = { mood, count, length, offset, color: MOOD_COLORS[mood] || MOOD_COLORS.daily }
        offset += length
        return arc
      })

      return h(
        'div',
        { className: 'lm-dash', style: { marginBottom: 12 } },
        h(Tile, { span: 'lm-span-3', label: '日记总数', value: entries.length }),
        h(Tile, { span: 'lm-span-3', label: '连续写作', value: `${stats.streak} 天`, color: C.brand }),
        h(Tile, { span: 'lm-span-3', label: '近 30 天', value: stats.count30 }),
        h(Tile, { span: 'lm-span-3', label: '平均字数', value: stats.avg }),

        h(
          'div',
          {
            className: 'lm-span-6 lm-glass lm-panel lm-spot lm-fade',
            style: glass({ borderRadius: 14, padding: '12px 14px' }),
          },
          h(
            'div',
            { className: 'lm-panel-head' },
            h('span', { style: { color: C.sub, fontSize: 12 } }, '心情分布'),
            h('span', { style: { color: C.faint, fontSize: 11 } }, '近 30 天 · 点击筛选'),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 } },
            h(
              'svg',
              { width: 80, height: 80, viewBox: '0 0 64 64', className: 'lm-ring', style: { flex: 'none' } },
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
                  key: arc.mood,
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
              arcs.length
                ? arcs.map(arc =>
                    h(
                      'div',
                      {
                        key: arc.mood,
                        className: 'lm-legend',
                        title: `筛选：${MOOD_LABEL[arc.mood] || arc.mood}`,
                        onClick: () => onMood && onMood(moodFilter === arc.mood ? '' : arc.mood),
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: C.sub,
                          lineHeight: '20px',
                          cursor: 'pointer',
                          borderRadius: 6,
                          padding: '0 4px',
                        },
                      },
                      h('span', {
                        style: { width: 8, height: 8, borderRadius: 3, background: arc.color, flex: 'none' },
                      }),
                      h('span', null, `${MOOD_EMOJI[arc.mood] || ''} ${MOOD_LABEL[arc.mood] || arc.mood}`),
                      h('span', { style: { marginLeft: 'auto', color: C.faint } }, String(arc.count)),
                    ),
                  )
                : h('div', { style: { fontSize: 11, color: C.faint } }, '近 30 天还没有日记'),
            ),
          ),
        ),

        h(
          'div',
          {
            className: 'lm-span-6 lm-glass lm-panel lm-spot lm-fade',
            style: glass({ borderRadius: 14, padding: '12px 14px' }),
          },
          h(
            'div',
            { className: 'lm-panel-head' },
            h('span', { style: { color: C.sub, fontSize: 12 } }, '习惯 Top'),
            h('span', { style: { color: C.faint, fontSize: 11 } }, '近 30 天'),
          ),
          stats.habits.length
            ? h(BarList, {
                rows: stats.habits,
                color: '#7ed6a5',
                onPick: label => onHabit && onHabit(label),
              })
            : h('div', { style: { fontSize: 11, color: C.faint } }, '还没有记录到习惯'),
        ),

        h(
          'div',
          {
            className: 'lm-span-12 lm-glass lm-panel lm-spot lm-fade',
            style: glass({ borderRadius: 14, padding: '12px 14px' }),
          },
          h(
            'div',
            { className: 'lm-panel-head' },
            h('span', { style: { color: C.sub, fontSize: 12 } }, '写作热力'),
            h('span', { style: { color: C.faint, fontSize: 11 } }, '最近 5 周 · 点击筛选当天'),
            dayFilter
              ? h('span', { style: { marginLeft: 'auto', fontSize: 11, color: C.brand } }, dayFilter)
              : null,
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(35, 1fr)', gap: 3, marginTop: 4 } },
            stats.heat.map(day =>
              h('div', {
                key: day.key,
                className: 'lm-cell',
                title: `${day.key} · ${day.has ? '有日记' : '没有日记'}`,
                onClick: () => onDay && onDay(dayFilter === day.key ? '' : day.key),
                style: {
                  aspectRatio: '1',
                  borderRadius: 3,
                  cursor: 'pointer',
                  outline: dayFilter === day.key ? `1px solid ${C.brand}` : 'none',
                  background: day.has
                    ? `color-mix(in srgb, ${C.brand} 70%, transparent)`
                    : 'color-mix(in srgb, var(--dsw-alias-border-l1) 32%, transparent)',
                },
              }),
            ),
          ),
        ),
      )
    }


    /** A diary entry opened as its own page. */
    function DiaryDetail(props) {
      const { entry, onBack, onChanged } = props
      const [editing, setEditing] = useState(false)
      const [draft, setDraft] = useState(entry.diary || '')
      const [busy, setBusy] = useState(false)

      const save = useCallback(async () => {
        setBusy(true)
        try {
          await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'diary-update', date: entry.date, diary: draft }),
          })
          setEditing(false)
          await onChanged()
        } finally {
          setBusy(false)
        }
      }, [entry.date, draft, onChanged])

      const dateText = entryDateText(entry.date, entry.updatedAt)
      const accent = MOOD_COLORS[entry.mood] || MOOD_COLORS.daily

      return h(
        'div',
        { className: 'lm-fade' },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
          h(
            'button',
            {
              type: 'button',
              onClick: onBack,
              style: {
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 999,
                border: `1px solid ${C.line}`,
                background: 'transparent',
                color: C.sub,
                cursor: 'pointer',
              },
            },
            '← 返回日记列表',
          ),
          h('div', { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, dateText.title),
          h(
            'button',
            {
              type: 'button',
              onClick: () => setEditing(previous => !previous),
              style: {
                marginLeft: 'auto',
                fontSize: 12,
                padding: '3px 12px',
                borderRadius: 999,
                border: `1px solid ${C.brand}`,
                background: 'transparent',
                color: C.brand,
                cursor: 'pointer',
              },
            },
            editing ? '取消编辑' : '编辑',
          ),
        ),

        h(
          'div',
          { className: 'lm-glass', style: glass({ borderRadius: 14, padding: '16px 18px', marginBottom: 12 }) },
          h(
            'div',
            { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' } },
            entry.mood
              ? h(Chip, { color: accent }, `${MOOD_EMOJI[entry.mood] || ''} ${MOOD_LABEL[entry.mood] || entry.mood}`)
              : null,
            entry.personaName ? h(Chip, { color: C.sub }, `${entry.personaEmoji || '🐟'} ${entry.personaName}`) : null,
            h('span', { style: { marginLeft: 'auto', fontSize: 11, color: C.faint } }, dateText.updated || relTime(entry.updatedAt)),
            entry.emoji ? h('span', { style: { fontSize: 16, letterSpacing: 3 } }, entry.emoji) : null,
          ),
          editing
            ? h(
                'div',
                null,
                h('textarea', {
                  value: draft,
                  rows: 10,
                  onChange: event => setDraft(event.target.value),
                  style: {
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 14,
                    lineHeight: '24px',
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
                  { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 8 } },
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy,
                      onClick: save,
                      style: {
                        fontSize: 12,
                        padding: '5px 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: C.brand,
                        color: '#fff',
                        cursor: busy ? 'default' : 'pointer',
                        opacity: busy ? 0.6 : 1,
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
                    lineHeight: '26px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: C.ink,
                  },
                },
                entry.diary,
              ),
          entry.fish
            ? h(
                'div',
                {
                  style: {
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: `${C.brand}14`,
                    fontSize: 12,
                    color: C.ink,
                    lineHeight: '19px',
                  },
                },
                `${entry.personaEmoji || '🐟'} ${entry.fish}`,
              )
            : null,
        ),

        (entry.habits || []).length
          ? h(
              'div',
              { className: 'lm-glass', style: glass({ borderRadius: 14, padding: '14px 18px', marginBottom: 12 }) },
              h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 6 } }, '当天习惯'),
              entry.habits.map((habit, index) =>
                h('div', { key: index, style: { fontSize: 12, color: C.ink, lineHeight: '20px' } }, `· ${habit.text || habit}`),
              ),
            )
          : null,

        entry.memePath
          ? h('img', {
              src: `${API}?meme=${encodeURIComponent(entry.date)}`,
              alt: entry.memeCaption || '配图',
              style: { display: 'block', maxWidth: '100%', maxHeight: 280, borderRadius: 12 },
            })
          : null,
      )
    }

    /** One weekly report opened as its own page. */
    function WeeklyDetail(props) {
      const { item, onBack } = props
      return h(
        'div',
        { className: 'lm-fade' },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
          h(
            'button',
            {
              type: 'button',
              onClick: onBack,
              style: {
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 999,
                border: `1px solid ${C.line}`,
                background: 'transparent',
                color: C.sub,
                cursor: 'pointer',
              },
            },
            '← 返回日记列表',
          ),
          h('div', { style: { fontSize: 14, fontWeight: 600, color: C.ink } }, `周报 ${item.start} ~ ${item.end}`),
          item.auto ? h(Chip, { color: C.faint }, '自动生成') : null,
        ),
        h(
          'div',
          { className: 'lm-glass', style: glass({ borderRadius: 14, padding: '16px 18px' }) },
          item.headline
            ? h('div', { style: { fontSize: 16, fontWeight: 600, color: C.ink, marginBottom: 8 } }, item.headline)
            : null,
          h(
            'div',
            { style: { fontSize: 14, lineHeight: '26px', color: C.ink, whiteSpace: 'pre-wrap', marginBottom: 10 } },
            item.summary,
          ),
          item.moods
            ? h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 8 } }, `心情：${item.moods}`)
            : null,
          (item.highlights || []).length
            ? h(
                'div',
                { style: { marginBottom: 10 } },
                h('div', { style: { fontSize: 12, color: C.sub, marginBottom: 4 } }, '值得记住的事'),
                item.highlights.map((text, index) =>
                  h('div', { key: index, style: { fontSize: 12, lineHeight: '20px', color: C.ink } }, `· ${text}`),
                ),
              )
            : null,
          item.fish
            ? h(
                'div',
                {
                  style: {
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: `${C.brand}14`,
                    fontSize: 12,
                    color: C.ink,
                  },
                },
                `${item.personaEmoji || '🐟'} ${item.fish}`,
              )
            : null,
          h(
            'div',
            { style: { marginTop: 12, fontSize: 11, color: C.faint } },
            `${item.diaryCount || 0} 篇日记 · ${item.memoryCount || 0} 条新记忆 · 生成于 ${relTime(item.createdAt || 0)}`,
          ),
        ),
      )
    }

    /** Diary: one quiet entry per day, with habits and the fish's comment. */
    function DiaryView() {
      const [state, setState] = useState({ status: 'loading', data: null, error: null })
      const [busy, setBusy] = useState(false)
      const [editingDate, setEditingDate] = useState('')
      const [draft, setDraft] = useState('')
      const [weeklyBusy, setWeeklyBusy] = useState(false)
      const [moodFilter, setMoodFilter] = useState('')
      const [dayFilter, setDayFilter] = useState('')
      const [habitFilter, setHabitFilter] = useState('')
      const [diaryDate, setDiaryDate] = useState('')
      const [weeklyDetail, setWeeklyDetail] = useState(null)

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
      const filteredDiary = entries.filter(entry => {
        if (moodFilter && (entry.mood || 'daily') !== moodFilter) return false
        if (dayFilter && entry.date !== dayFilter) return false
        if (habitFilter) {
          const habits = (entry.habits || []).map(habit => (typeof habit === 'string' ? habit : habit && habit.text))
          if (!habits.includes(habitFilter)) return false
        }
        return true
      })
      const weekly = (state.data && state.data.weekly) || []
      const currentWeekKey = (state.data && state.data.currentWeek) || ''
      const currentWeekly = weekly.find(item => item.week === currentWeekKey)
      const pastWeekly = weekly.filter(item => item.week !== currentWeekKey)

      if (weeklyDetail) {
        return h(WeeklyDetail, { item: weeklyDetail, onBack: () => setWeeklyDetail(null) })
      }
      const diaryDetail = entries.find(entry => entry.date === diaryDate)
      if (diaryDetail) {
        return h(DiaryDetail, {
          entry: diaryDetail,
          onBack: () => setDiaryDate(''),
          onChanged: async () => {
            const data = await fetchPanel()
            setState({ status: 'ready', data, error: null })
          },
        })
      }

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
                        {
                          key: item.week,
                          onClick: () => setWeeklyDetail(item),
                          title: '打开这一期周报',
                          style: {
                            fontSize: 11,
                            color: C.sub,
                            lineHeight: '18px',
                            display: 'flex',
                            gap: 6,
                            cursor: 'pointer',
                            borderRadius: 6,
                            padding: '0 4px',
                          },
                        },
                        h('span', { style: { flex: 1, minWidth: 0 } }, `${item.start} ~ ${item.end}：${item.headline || item.summary.slice(0, 30)}`),
                        item.auto ? h(Chip, { color: C.faint }, '自动') : null,
                      ),
                    ),
                  )
                : null,
            )
          : null,

        entries.length
          ? h(
              Safe,
              null,
              h(DiaryDash, {
                entries,
                moodFilter,
                dayFilter,
                onMood: value => setMoodFilter(value || ''),
                onDay: value => setDayFilter(value || ''),
                onHabit: value => setHabitFilter(previous => (previous === value ? '' : value)),
              }),
            )
          : null,

        moodFilter || dayFilter || habitFilter
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' } },
              moodFilter
                ? h(Chip, { color: MOOD_COLORS[moodFilter] || C.brand }, `${MOOD_EMOJI[moodFilter] || ''} ${MOOD_LABEL[moodFilter] || moodFilter}`)
                : null,
              dayFilter ? h(Chip, { color: C.brand }, dayFilter) : null,
              habitFilter ? h(Chip, { color: '#7ed6a5' }, `习惯 ${habitFilter}`) : null,
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    setMoodFilter('')
                    setDayFilter('')
                    setHabitFilter('')
                  },
                  style: {
                    fontSize: 11,
                    padding: '1px 8px',
                    borderRadius: 999,
                    border: `1px solid ${C.line}`,
                    background: 'transparent',
                    color: C.sub,
                    cursor: 'pointer',
                  },
                },
                '清除筛选',
              ),
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
                      title: `${day.full} · ${day.entry ? MOOD_LABEL[day.mood] || day.mood : '没有记录'}（点击筛选）`,
                      onClick: () => {
                        if (day.entry) setDayFilter(day.key)
                      },
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        width: 32,
                        cursor: day.entry ? 'pointer' : 'default',
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

        filteredDiary.length === 0
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
              entries.length === 0
                ? '还没有日记。今天先聊几句，日记会自动写出来；也可以点右上角「重写今天」。'
                : '这个筛选下没有日记。',
            )
          : filteredDiary.map(entry =>
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
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'lm-btn',
                      onClick: () => setDiaryDate(entry.date),
                      style: {
                        fontSize: 11,
                        padding: '2px 9px',
                        borderRadius: 999,
                        border: `1px solid ${C.brand}`,
                        background: 'transparent',
                        color: C.brand,
                        cursor: 'pointer',
                      },
                    },
                    '打开独立页 ›',
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
      const [personaFilter, setPersonaFilter] = useState('')

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
      const visiblePersonas = personaFilter === 'custom' ? list.filter(item => !item.builtin) : list

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

        editing
          ? null
          : h(
              'div',
              { className: 'lm-dash', style: { marginBottom: 12 } },
              h(Tile, {
                span: 'lm-span-3',
                label: '人格总数',
                value: list.length,
                onPick: () => setPersonaFilter(''),
              }),
              h(Tile, {
                span: 'lm-span-3',
                label: '自定义',
                value: list.filter(item => !item.builtin).length,
                color: C.brand,
                hint: personaFilter === 'custom' ? '再点一次显示全部' : '只看自定义人格',
                onPick: () => setPersonaFilter(previous => (previous === 'custom' ? '' : 'custom')),
              }),
              h(Tile, {
                span: 'lm-span-3',
                label: '日记总数',
                value: list.reduce((sum, item) => sum + (item.diaryCount || 0), 0),
              }),
              h(Tile, {
                span: 'lm-span-3',
                label: '当前人格',
                value: (list.find(item => item.id === personas.activeId) || {}).emoji || '🐟',
                sub: (list.find(item => item.id === personas.activeId) || {}).name || '大肥鱼',
              }),
            ),

        personaFilter === 'custom'
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
              h(Chip, { color: C.brand }, '只看自定义人格'),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setPersonaFilter(''),
                  style: {
                    fontSize: 11,
                    padding: '1px 8px',
                    borderRadius: 999,
                    border: `1px solid ${C.line}`,
                    background: 'transparent',
                    color: C.sub,
                    cursor: 'pointer',
                  },
                },
                '清除',
              ),
            )
          : null,

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
              visiblePersonas.map(persona =>                h(
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
