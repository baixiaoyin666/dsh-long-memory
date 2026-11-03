# 更新日志 / Changelog

本文件记录 dsh-long-memory 的所有重要变更，中英双语。
All notable changes to dsh-long-memory are recorded here, in Chinese and English.

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

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
