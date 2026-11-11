# 更新日志 / Changelog

本文件记录 dsh-long-memory 的所有重要变更，中英双语。
All notable changes to dsh-long-memory are recorded here, in Chinese and English.

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

---

## [0.15.0] — 2026-11-11

### 新增

- **本周周报**：日记页顶部新增卡片，把这一周的日记与新增记忆归纳成一篇周记——标题、120–200 字正文、心情走向、三条值得记住的事，以及当前人格的一句短评；数据存 `reports.json`，保留最近 24 期。
- 周报手动生成（至少 2 篇日记），可随时「重新生成」；卡片下方列出最近 4 期往期周报。

### 变更

- 周报解析兼容模型把 `HEADLINE/SUMMARY/...` 写成一行或加粗的情况。
- 版本号 `0.14.0` → `0.15.0`。

---

## [0.15.0] — 2026-11-11

### Added

- **Weekly report**: a card at the top of the diary tab distils the week's diaries and new memories into one entry — headline, a 120–200 character body, the mood arc, three highlights and a one-line comment in the active persona's voice; stored in `reports.json`, keeping the last 24.
- Generated on demand (needs at least two diaries), re-generatable, with the last four previous weeks listed underneath.

### Changed

- The parser tolerates replies that put `HEADLINE/SUMMARY/...` on one line or wrap the labels in bold.
- Version `0.14.0` → `0.15.0`.

---

## [0.14.0] — 2026-11-10

### 新增

- **`memory_recall` 工具**：模型可按问题主动回忆记忆，按相关度排序、跨全局与工作区，可选包含归档条目；命中时刷新 `lastUsedAt`，让衰减判断跟随真实使用。
- **每日备份**：每天第一次写入时把记忆库快照存到 `backups/memories-YYYY-MM-DD.json`，只保留最近 7 份。
- **回收站**：删除的记忆进入 `trash.json` 保留 30 天，面板可逐条恢复或一键清空。
- **提炼设置**：面板新增开关——自动提炼、每 N 轮提炼一次（1–20）、只把用户消息发给模型（不发送助手回复）。

### 变更

- `settings.json` 新增 `auto` / `everyTurns` / `onlyUser` 三个字段，旧文件自动兼容。
- 版本号 `0.13.0` → `0.14.0`。

---

## [0.14.0] — 2026-11-10

### Added

- **`memory_recall` tool**: the model can recall memories on demand, relevance-ranked across global and workspace scopes, optionally including archived rows; hits refresh `lastUsedAt` so decay follows real use.
- **Daily backups**: the first write of each day snapshots the store to `backups/memories-YYYY-MM-DD.json`, keeping the last seven.
- **Recycle bin**: deleted memories go to `trash.json` for 30 days, restorable one by one or emptied from the panel.
- **Extraction settings**: auto-extraction on/off, extract every N turns (1–20), and send only user messages to the model (no assistant replies).

### Changed

- `settings.json` gained `auto` / `everyTurns` / `onlyUser`; older files still load.
- Version `0.13.0` → `0.14.0`.

---

## [0.13.0] — 2026-11-04

### 新增

- **情绪卡自定义**：每个自定义人格可分别设置 6 种心情（开心 / 生气 / 难过 / 害羞 / 困惑 / 日常）的 emoji，以及文案模板（支持 `{name}`、`{mood}` 占位）；情绪卡的配色改用该人格的强调色。
- **人格编辑更清楚**：头像 emoji 与强调色不再是无标签的输入框，新增 8 个预设头像（🐟 😼 🍵 🤖 🧘 🦊 🐧 🎩）一键填入。
- 日记渲染时按 `personaId` 找人格的 `moods` / `cardCaption` / `accent`，未设置的项回退内置表情与默认文案，旧日记不受影响。

### 变更

- 人格记录新增 `moods`、`cardCaption` 字段（`personas.json` 自动兼容旧数据）。
- 版本号 `0.12.0` → `0.13.0`。

---

## [0.13.0] — 2026-11-04

### Added

- **Mood-card customization**: each custom persona can set an emoji for all six moods (happy / angry / sad / shy / confused / daily) plus a caption template with `{name}` and `{mood}` placeholders; the card takes its tint from the persona accent.
- **Clearer persona editor**: the avatar emoji and accent colour are no longer unlabelled inputs, and eight preset avatars (🐟 😼 🍵 🤖 🧘 🦊 🐧 🎩) fill in with one click.
- Diary rendering resolves each entry's persona by `personaId` and falls back to the built-in faces and caption when nothing is set, so older entries are unaffected.

### Changed

- Personas gained `moods` and `cardCaption` fields (`personas.json` stays backward compatible).
- Version `0.12.0` → `0.13.0`.

---

## [0.12.0] — 2026-11-04

### 新增

- **记忆可编辑**：每条记忆的「编辑」可以改正文、标签、范围和所属工作区；保存后立即生效，不需要删除重建。
- **导入 JSON**：面板右上角「导入」，读入导出的 JSON 备份，按 `id` 去重合并（已存在则跳过），导入的条目会补齐 `weight` / `lastUsedAt` / `archived` 字段。
- **会话内刷新摘要**：上下文压缩（compaction）发生时重建该会话的记忆摘要——那一刻 prompt 缓存本来就失效，所以不额外增加成本；长会话跑到后半段也能看到新记住的事实。

### 变更

- 版本号 `0.11.0` → `0.12.0`。

---

## [0.12.0] — 2026-11-04

### Added

- **Editable memories**: each row's "编辑" edits the text, tags, scope and workspace; saving takes effect immediately, no delete-and-recreate needed.
- **JSON import**: "导入" in the panel header reads an exported backup and merges it by `id` (existing ids are skipped), filling in `weight` / `lastUsedAt` / `archived` for imported rows.
- **In-session brief refresh**: when context compaction happens the session's memory digest is rebuilt — the prompt cache is already invalid at that point, so it costs nothing extra, and long sessions see facts learned later in the same session.

### Changed

- Version `0.11.0` → `0.12.0`.

---

## [0.11.0] — 2026-11-04

### 新增

- **衰减归档**：超过 60 天没有更新、且命中次数 <2 的记忆自动标记为 `archived`，不再进入系统提示；列表默认隐藏归档项，搜索 `archived:true` 可查看，支持单条/批量恢复。
- **疑似重复 / 冲突**：把相似度 0.62–0.9 但未达合并阈值的记忆成对列出，可一键合并；合并保留更长表述、合并标签与来源、累加命中次数。
- **搜索语法**：`tag:xxx`、`scope:global|workspace`、`archived:true`、`before:YYYY-MM-DD`，与普通关键词可混用。
- **批量操作**：每条记忆左侧复选框，批量归档 / 恢复 / 合并 / 删除。
- **日记可编辑**：每篇日记右上角「编辑」，改完保存即写入 `diary.json`。

### 变更

- 记忆新增字段：`weight`（重要度，合并时 +0.3，上限 5）、`lastUsedAt`、`archived`。
- 版本号 `0.10.1` → `0.11.0`。

---

## [0.11.0] — 2026-11-04

### Added

- **Decay / archive**: memories untouched for 60 days with fewer than two hits are archived and dropped from the system brief; the list hides them by default, `archived:true` shows them, and they can be restored one by one or in bulk.
- **Suspected duplicates / conflicts**: pairs with 0.62–0.9 similarity (below the merge threshold) are listed with a one-click merge that keeps the longer wording, unions tags and origins, and sums hits.
- **Search syntax**: `tag:xxx`, `scope:global|workspace`, `archived:true`, `before:YYYY-MM-DD`, mixable with plain keywords.
- **Bulk actions**: a checkbox per row with batch archive / restore / merge / delete.
- **Editable diary**: an "编辑" button on each entry writes the edited body back to `diary.json`.

### Changed

- New memory fields: `weight` (importance, +0.3 per merge, capped at 5), `lastUsedAt`, `archived`.
- Version `0.10.1` → `0.11.0`.

---

## [0.10.1] — 2026-11-04

### 修复

- **没装 dsh-meme 的用户日记没有配图**：现在日记条目在取不到表情包时渲染内置「情绪卡」（按心情配色的 emoji 卡片），并提示安装 dsh-meme 可换成真实表情包。
- 表情包挑选增加降级：按心情取图失败时依次尝试 `daily`、不限分类，再退回情绪卡。

### 变更

- 版本号 `0.10.0` → `0.10.1`。

---

## [0.10.1] — 2026-11-04

### Fixed

- **Users without dsh-meme saw no diary illustration**: entries now render a built-in mood card (an emoji card tinted by the day's mood) when no meme is available, with a hint that installing dsh-meme swaps in real images.
- Meme selection degrades gracefully: it tries the mood tag, then `daily`, then any tag, before falling back to the mood card.

### Changed

- Version `0.10.0` → `0.10.1`.

---

## [0.10.0] — 2026-11-04

### 新增

- **历史会话回填**：扫描 `~/.dsh/sessions/` 下**所有工作区**的既有会话（自动解码 zstd 多帧日志），每个会话取最近 10 轮对话，一次模型调用提炼 ≤6 条事实并入记忆库，来源写入 `origins`。
- 面板「记忆」页新增回填卡片：开始 / 取消、进度条、会话数与新增/合并/跳过/失败计数，运行中每 3 秒自动刷新。
- 回填会跳过子代理会话、已暂停的工作区，以及没有完整对话的会话；逐条去重合并，不会覆盖现有记忆。

### 变更

- 回填单次请求 token 预算 2400（太小会被推理占满导致空返回）。
- 版本号 `0.9.1` → `0.10.0`。

---

## [0.10.0] — 2026-11-04

### Added

- **History backfill**: scans every workspace's existing sessions under `~/.dsh/sessions/` (decoding multi-frame zstd logs), takes the last 10 turns of each session, and distils up to 6 facts per session in one model call, storing them with `origins`.
- The memory tab gained a backfill card: start / cancel, a progress bar, and session / added / merged / skipped / failed counters, refreshing every 3 seconds while it runs.
- Subagent sessions, paused workspaces and sessions without a complete turn are skipped; facts are deduplicated against the existing store.

### Changed

- Backfill requests get a 2400-token budget (too small a budget was fully consumed by reasoning and returned no text).
- Version `0.9.1` → `0.10.0`.

---

## [0.9.1] — 2026-11-04

### 变更

- **情绪趋势改成表情**：最近 14 天每天一格，用 😊 😠 😢 😳 😕 😐 表示当天心情，无记录显示「·」，悬停显示「11月4日 周二 · 开心」。
- **日期显示优化**：日记标题改为「今天 · 11月4日 周二」（昨天/更早自动切换前缀），右侧显示「更新于 10:32」而不是模糊的相对时间；趋势格下方显示日号。

---

## [0.9.1] — 2026-11-04

### Changed

- **Mood trend now uses faces**: one cell per day for the last 14 days, showing 😊 😠 😢 😳 😕 😐 for that day's mood, 「·」 when there is no entry, with a hover title like "11月4日 周二 · 开心".
- **Better dates**: diary titles read "今天 · 11月4日 周二" (yesterday/earlier switch automatically), the right side shows "更新于 10:32" instead of a fuzzy relative time, and each trend cell carries its day number.

---

## [0.9.0] — 2026-11-04

### 新增

- **敏感信息过滤**：写入记忆与来源对话前，自动把 GitHub token、`sk-`密钥、AWS key、Slack token、私钥块、身份证号、手机号、`密码: xxx` 等替换为 `[已脱敏]`，并在提炼错误时跳过。
- **导出**：面板「导出 MD / JSON」两个链接，`GET /dsh-long-memory/data?export=markdown|json` 直接下载（Markdown 按全局/工作区/日记/人格分组，JSON 是完整备份）。
- **情绪趋势**：日记页顶部一条最近 14 篇的情绪色块，按 happy/angry/sad/shy/confused/daily 着色。
- **按工作区开关**：记忆页列出所有工作区，可单独「暂停记录」；暂停后该项目不再自动提炼（手动工具仍可用），状态存 `settings.json`。

### 变更

- 版本号 `0.8.0` → `0.9.0`。

---

## [0.9.0] — 2026-11-04

### Added

- **Secret scrubbing**: before anything is stored (memories and captured conversations), GitHub tokens, `sk-` keys, AWS keys, Slack tokens, private-key blocks, ID numbers, phone numbers and `password: …` are replaced with `[已脱敏]`; a turn whose extraction triggers a redaction is still stored, only scrubbed.
- **Export**: "Export MD / JSON" links in the panel; `GET /dsh-long-memory/data?export=markdown|json` downloads a grouped Markdown journal or a full JSON backup.
- **Mood trend**: a row of the last 14 diary moods coloured by happy/angry/sad/shy/confused/daily.
- **Per-workspace switch**: the memory tab lists every workspace with a pause toggle; a paused workspace stops automatic distillation (manual tools still work), persisted in `settings.json`.

### Changed

- Version `0.8.0` → `0.9.0`.

---

## [0.8.0] — 2026-11-04

### 新增

- **日记改成真实写作**：每篇 300–420 字、2–3 段，强调具体场景与细节、有起承转合，不再罗列事实；模型输出增加 `MOOD:` 与 `EMOJI:` 两行。
- **表情**：日记带情绪标签（happy/angry/sad/shy/confused/daily）与 2–3 个 emoji。
- **配图**：装了 [dsh-meme](https://github.com/yyh-001/dsh-meme) 时，按情绪调用其只读服务 `ctx.get('dshMeme').pick({ tag })` 选一张图，路径记录在日记条目里，由本插件 `data?meme=<date>` 路由直接读文件返回（不依赖外部图床）。
- **人格独立界面**：点「新建/编辑」进入独立编辑页，人格列表暂时隐藏，左上角「← 返回人格列表」回到表格。

### 变更

- 日记生成 token 上限 2200 → 2600，正文上限 1200 → 2000 字。

---

## [0.7.0] — 2026-11-04

### 新增

- **指针跟踪光斑**：玻璃卡片悬停时出现跟随鼠标的柔光（`--mx` / `--my` + radial-gradient）。
- **3D 倾斜**：统计卡与健康度卡片随指针做 ≤6° 的透视倾斜，移出时回弹。
- **数字滚动**：统计卡数值 550ms 缓动累加（0 → N）。
- **磁吸按钮**：刷新 / 重写今天 / 新建人格 / 保存并启用，按钮会向指针方向轻微偏移。
- **环形健康度**：进度条改为 SVG 环形，`stroke-dashoffset` 700ms 过渡，颜色随分数变化。
- **错峰入场**：记忆列表与人格表格的行依次淡入（每行延迟 22ms）。
- **标签页激活态**：阴影加深 + 上浮，切换更明显。

---

## [0.7.0] — 2026-11-04

### Added

- **Pointer-tracked spotlight**: hovering a glass card shows a soft highlight following the cursor (`--mx` / `--my` + radial-gradient).
- **3D tilt**: stat cards and the health card tilt up to 6° toward the pointer and spring back on leave.
- **Number count-up**: stat values ease from 0 to their value over 550ms.
- **Magnetic buttons**: refresh / rewrite / new persona / save drift a few pixels toward the cursor.
- **Ring health meter**: the flat bar became an SVG ring with a 700ms `stroke-dashoffset` transition, coloured by score.
- **Staggered entrance**: memory rows and persona rows fade in one after another (22ms each).
- **Tab active state**: deeper shadow and a slight lift on the selected tab.

---

## [0.6.0] — 2026-11-04

### 新增

- **与玻璃质感配套的交互动效**（纯 CSS，无动画库）：
  - 玻璃卡片悬停上浮 2px、阴影加深；
  - 记忆与人格表格行悬停高亮（品牌色 9% 叠加）；
  - 按钮悬浮上移、按下缩放，标签页悬浮微抬；
  - 输入框聚焦时出现品牌色光环；
  - 统计卡/健康度/列表/日记/人格编辑器淡入上浮（300ms，缓动曲线）；
  - 人格强调色圆点带呼吸光。

---

## [0.6.0] — 2026-11-04

### Added

- **Interaction motion matched to the glass surfaces** (plain CSS, no animation library):
  - glass cards lift 2px and deepen their shadow on hover;
  - memory and persona table rows highlight on hover (9% brand tint);
  - buttons lift on hover and scale down on press; tabs lift slightly;
  - inputs show a brand-coloured focus ring;
  - stat cards, the health block, lists, diary cards and the persona editor fade up (300ms easing);
  - persona accent dots carry a slow breathing glow.

---

## [0.5.0] — 2026-11-04

### 变更

- **视觉改成高模糊玻璃质感**：面板改用半透明卡片（`backdrop-filter: blur(28px) saturate(165%)`）、细描边与内高光，页面叠加柔和的蓝紫渐变，跟随主题明暗。
- 统计卡、健康度区、记忆列表、日记卡片、人格表格与编辑器统一使用玻璃材质。

### 新增

- **人格数据表格增强**：新增「日记」篇数与「最近使用」两列，每行显示该人格的强调色圆点。
- 人格增加**强调色**：内置 6 个人格各有配色，自定义人格可在编辑器里用取色器设置。

---

## [0.5.0] — 2026-11-04

### Changed

- **High-blur glass visuals**: the panel now uses translucent cards (`backdrop-filter: blur(28px) saturate(165%)`), hairline borders and inner highlights, over a soft blue/violet gradient that follows the active theme.
- Stat cards, the health block, the memory list, diary cards, the persona table and the editor all share the glass surface.

### Added

- **Richer persona table**: new "diary" and "last used" columns, plus an accent-colour dot per row.
- Personas gained an **accent colour**: the six built-ins ship with their own, and custom personas can pick one in the editor.

---

## [0.4.0] — 2026-11-04

### 新增

- **人格系统**：面板新增「人格」数据表格（人格 / 类型 / 风格摘要 / 状态 / 操作），默认人格为「🐟 大肥鱼」。
- 内置 6 种热门人格可直接启用：大肥鱼、傲娇猫娘、温柔学姐、毒舌管家、赛博黑客、佛系禅师。
- 自定义人格：名称、emoji、风格摘要、角色设定；支持编辑、删除，以及把内置人格「复制」成可改的自定义人格。
- 日记正文与留言按当前人格的设定生成，日记条目记录 `personaName` / `personaEmoji`，旧条目回退显示「大肥鱼」。
- 人格数据存在 `personas.json`；内置人格随插件更新，自定义人格只存本地。

### 变更

- 面板标签由「记忆 / 日记」扩展为「记忆 / 日记 / 人格」。

---

## [0.4.0] — 2026-11-04

### Added

- **Persona system**: a new Personas tab renders a data table (persona / type / style summary / status / actions); the default persona is 「🐟 大肥鱼」.
- Six built-in popular personas can be activated directly: 大肥鱼, 傲娇猫娘, 温柔学姐, 毒舌管家, 赛博黑客, 佛系禅师.
- Custom personas: name, emoji, style summary and role prompt; edit, delete, or copy a built-in one into an editable custom persona.
- Diary text and its comment are generated in the active persona's voice; entries record `personaName` / `personaEmoji`, older entries fall back to 「大肥鱼」.
- Personas live in `personas.json`; built-ins ship with the plugin, custom ones stay local.

### Changed

- The panel tabs are now Memory / Diary / Personas.

---

## [0.3.0] — 2026-11-03

### 新增

- **日常日记**：面板新增「日记」标签，每天一篇第一人称短文，从当天的记忆自动写成，并附一条「大肥鱼」的情绪留言。
- **习惯记录**：写日记时顺带提炼最多 2 条用户日常习惯，作为 `global` 记忆（标签 `habit`）继续参与检索与后续提炼。
- 日记保存在 `diary.json`；面板可「重写今天」；没有模型路由或今天还没有记忆时不会写入，并给出原因。
- 模型输出格式改为 `FISH: / HABITS: / DIARY:` 三行，避免 JSON 字符串里的换行导致解析失败；解析失败时退回散文正文 + 内置留言。
- 日记请求的 token 上限提高到 2200，避免长文被截断。

### 变更

- 面板 API 路径由 `/dsh-long-memory/api` 改为 `/dsh-long-memory/data`；路由注册挂到插件 effect 上，重载时会先释放旧路由，不再出现「旧处理器一直生效」。
- 版本号 `0.2.0` → `0.3.0`。

---

## [0.3.0] — 2026-11-03

### Added

- **Daily diary**: a new Diary tab writes one first-person entry per day from that day's memories, with a comment from the desk pet 「大肥鱼」.
- **Habit capture**: each diary run also distils up to two daily habits into `global` memories tagged `habit`, so they keep feeding search and later distillation.
- Entries live in `diary.json`; the panel can rewrite today's entry; when there is no model route or no memory for today, nothing is written and the reason is reported.
- The model now answers in `FISH: / HABITS: / DIARY:` lines instead of JSON, so newlines inside the text cannot break parsing; unparseable replies fall back to the prose plus a built-in comment.
- The diary request gets a 2200-token budget so long entries are not cut off.

### Changed

- The panel API moved from `/dsh-long-memory/api` to `/dsh-long-memory/data`, and the route is owned by the plugin effect, so a reload releases the previous route instead of leaving a stale handler in place.
- Version `0.2.0` → `0.3.0`.

---

## [0.2.0] — 2026-11-03

### 新增

- **详情面板**：左侧栏新增「长期记忆」图标，点开是整页面板（设置 → 长期记忆 里也有同一页）。展示总条数、全局/工作区分布、近 7 天新增、平均长度、Top 标签，以及一个健康度评分——重复条目、超过 30 天未更新、上次提炼失败都会扣分并列出具体原因。
- 面板内含完整记忆列表，支持关键词搜索、按范围过滤、逐条删除；每次打开或点「刷新」都读取实时数据。
- 每条记忆可展开 **「查看对话」**：显示产生它的那一轮用户消息与助手回复全文（含会话 id、轮次、时间），以及创建/更新时间、命中次数、来源与工作区路径。提炼时把来源对话随记忆一起写入 `origins`（每条最多保留最近 5 个）。
- 新增本地 API：`GET /dsh-long-memory/api` 返回记忆库与分析结果，`POST` 支持 `{"action":"forget","id":"…"}` 与 `{"action":"save","text":"…","scope":"global|workspace"}`。
- 插件增加 Client 半侧（`client.js`，注册到 `sidebar.panellist` / `main` 与 `settings.section`）。

### 变更

- 版本号 `0.1.1` → `0.2.0`；记忆存储格式未变。

---

## [0.2.0] — 2026-11-03

### Added

- **Detail panel**: a new sidebar icon opens a full page (the same page also sits in Settings → Long-term memory): totals, global/workspace split, new rows in the last 7 days, average length, top tags, and a health score — duplicate rows, rows untouched for 30 days and a failed last distillation each cost points and are listed as concrete reasons.
- The panel lists every memory with keyword search, scope filtering and per-row delete, reading live data on open and on refresh.
- Every row expands into **"view conversation"**: the full user message and assistant reply of the turn it came from (session id, turn, time), plus created/updated times, hit count, source and workspace path. Distillation now records the source conversation in `origins` (the five most recent per row).
- Local API: `GET /dsh-long-memory/api` returns the store plus its analysis; `POST` accepts `{"action":"forget","id":"…"}` and `{"action":"save","text":"…","scope":"global|workspace"}`.
- The plugin now ships a client half (`client.js`, registered into `sidebar.panellist` / `main` and `settings.section`).

### Changed

- Version `0.1.1` → `0.2.0`; the storage format is unchanged.

---

## [0.1.1] — 2026-11-03

### 修复

- 插件在某一轮进行中安装或重载时，会错过该轮的 `turn/start`，导致这一轮不被提炼。现在 `turn/end` 发现没有缓冲区时，会从会话日志回放该轮的 `user/message` 与 `assistant/message`。
- 补上「没有模型路由」时的显式诊断记录，不再静默跳过。

### 新增

- `status.json` 诊断计数器：本次启动看到的轮数、提炼成功/失败次数、最近提炼时间、最近错误。`last-run.json` 保持为单次提炼的明细。

### 变更

- README 与更新日志改为中英双语。
- 记忆存储格式未变，`0.1.0` 的数据可直接沿用。

---

## [0.1.0] — 2026-11-03

### 新增

- 首次发布。
- 每轮对话结束后自动提炼不超过 3 条长期事实，区分 `global` 与 `workspace` 两级。
- 包含式相似度去重合并（阈值 0.82），单库上限 500 条，超出淘汰最久未更新的。
- 新会话首次组装系统提示时注入记忆摘要（≤1400 字），同一会话内冻结以保持 prompt 缓存。
- 工具：`memory_search`、`memory_save`、`memory_forget`。
- 纯本地 JSON 存储，零第三方依赖。

---

## [0.1.1] — 2026-11-03

### Fixed

- Installing or reloading the plugin mid-turn missed that turn's `turn/start`, so the turn was never distilled. When `turn/end` arrives without a buffer, the turn's `user/message` and `assistant/message` events are now replayed from the session log.
- Recorded an explicit diagnostic when a session has no model route instead of skipping silently.

### Added

- `status.json` diagnostic counters: turns seen since boot, successful and failed distillations, last distillation time, last error. `last-run.json` stays the per-run detail.

### Changed

- README and changelog are now bilingual (Chinese and English).
- The memory storage format is unchanged; data from `0.1.0` carries over.

---

## [0.1.0] — 2026-11-03

### Added

- First release.
- After each completed turn, distills at most three durable facts into `global` and `workspace` scopes.
- Containment-similarity deduplication and merging (threshold 0.82); at most 500 rows per store, least recently updated dropped first.
- Injects a memory digest (≤1400 chars) when a new session first assembles its system prompt; the digest is frozen for that session to keep prompt caching effective.
- Tools: `memory_search`, `memory_save`, `memory_forget`.
- Local JSON storage with no third-party dependencies.
