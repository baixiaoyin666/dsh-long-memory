# 更新日志 / Changelog

本文件记录 dsh-long-memory 的所有重要变更，中英双语。
All notable changes to dsh-long-memory are recorded here, in Chinese and English.

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

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
