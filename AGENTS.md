# HarmonicaFlow — Agent Brief

> 团队公共 agent 上下文。一句话定位：**把一份乐谱，变成能跟着吹的动态音块。**
> —— 用户只负责导入和吹，编配、时序、视角、命中反馈全部自动完成。

---

## ⚠️ 最高优先级（每次任务前必做）

### 1. 先读 `AGENTS.LOCAL.md`（如存在）

`AGENTS.LOCAL.md` 是个人本地覆盖（已 gitignore，不入库，**故此处不写成链接**），**冲突时以 LOCAL 为准**；不存在则跳过。

### 2. Expo 变了 —— 不要相信训练数据

Expo 每个 SDK 版本都会带破坏性变更，你记忆里的 API 很可能已被改名、迁移或删除。写任何触碰 Expo / EAS / React Native API 的代码之前：

1. 读 `package.json` 里 `expo` 的主版本号。
2. 拉对应版本文档：`https://docs.expo.dev/versions/v<major>.0.0/`
3. 其他一切问题先拉 `https://docs.expo.dev/llms.txt` —— 它是全部 Expo 文档的索引，并包含对常见 LLM 误解的更正。顺着它的链接到具体页面，**绝不凭记忆作答**。

### 3. 改代码 = 改文档

任何代码改动**必须同步更新关联文档**。文档都在 `docs/`：

| 改了什么 | 必须更新 |
|---|---|
| `src/core/parsers/**` 解析器 | [TECH_DESIGN.md](./docs/TECH_DESIGN.md) §5 解析器设计 |
| `src/core/arrange.ts` 编配算法 | 同上 §6 自动编配算法 |
| `src/core/layouts/**` 音阶预设 | 同上 §4 音阶预设（关键风险项） |
| `src/core/model.ts` 领域模型 / 谱面格式 | 同上 §3 数据模型 + §3.1 自有 JSON 谱面格式 |
| `src/core/pitch.ts` 音高 / 简谱 / 调号 | 同上 §5 + §6 |
| `src/core/visual/**` 视觉参数与几何 | 同上 §7.11 集中式视觉参数模块 + §9.1 视觉状态验证矩阵 |
| `src/player/**` 时序 | 同上 §7.1 时序 + §7.2 播放状态机 + §12.2 时序接缝 |
| `src/ui/NoteTimeline.tsx` · `StaffBar.tsx` 渲染 | 同上 §7.3 时间轴渲染 + §7.4 视角算法 + §7.6 音阶标注 + §7.9 命中高亮 |
| `src/ui/effects/**` 触碰特效 | 同上 §7.5 触碰特效 |
| `src/theme/**` 配色 / 皮肤 / 令牌 | 同上 §7.7 主题系统 + §7.8 UI 设计系统 |
| `src/ui/components/**` 设计系统组件 | 同上 §7.8 UI 设计系统（新增图标需登记 `IconName`） |
| `src/store/**` 持久化 | 同上 §8 持久化 + §12.1 存储接缝 |
| `src/app/**` 页面 | [PRD.md](./docs/PRD.md) §6 界面说明 + TECH_DESIGN §7 |
| 新增 / 更换依赖 | TECH_DESIGN §2 依赖清单（**运行时依赖数量是受约束的**） |
| `app.json` / `eas.json` / `.github/workflows/**` | TECH_DESIGN §11 构建与部署方案（含 §11.8 发布检查清单） |
| 模块分层 / 依赖方向 | TECH_DESIGN §1 架构总览 + [ARCHITECTURE.md](./docs/ARCHITECTURE.md) §3 模块划分与依赖方向 |
| 产品行为 / 需求变化 | PRD.md 对应章节 |
| 范围 / 排期变化 | [PLAN.md](./docs/PLAN.md) 对应任务与「明确不做」 |
| 验收标准变化 | [ACCEPTANCE.md](./docs/ACCEPTANCE.md) 对应任务验收表 |

**自查**：commit diff 里有代码 + 没有文档 → 检查是否漏改。
**新增文档**：放进 `docs/`，并在 [README.md](./README.md) 顶部「详细设计 / 过程管理」登记。

### 4. 并行调度 sub agent

**首要目的**：用独立 context 隔离搜索 / 大文件读取 / 长日志，**保护主上下文**；其次才是提速。

- 独立、职责不重叠的子任务**单条消息内**派发多个 `Agent` 并行；写操作用 `isolation: worktree`。
- 主线负责汇总与一致性校验。**不嵌套**（sub agent 内不再派 sub agent）。
- **worktree 用完即清**（`git worktree remove` + 删临时分支）。
- **串行 / 不派**：任务琐碎（token 不划算）· 有数据依赖 · 同资源无隔离 · 需全局一致性 · **涉及 `core/` 契约的改动**（`model.ts` / `core/visual/params.ts` 默认值 / `docStore.ts` 接口）。

### 5. 对齐唯一验收标准与三条铁律

**总验收（唯一标准）**：

> 打开 App → 导入支持范围内的乐谱 → **无需逐曲编配或调整视觉** → 音块平滑流入判定线、压线时刻与该吹的时刻一致、底部孔位与吹吸正确 → 全程可用、默认离线。默认琴型必须明确，其他实体琴需匹配预设或校对，不能假定系统能从乐谱识别用户的琴。

**四条门禁**（细则见 [ACCEPTANCE.md](./docs/ACCEPTANCE.md) §2）：
`npx tsc --noEmit` · `npm run lint` · `npm run verify` · `npx expo-doctor` —— **全绿才算完成**。

纯 Markdown 变更按 ACCEPTANCE §2 检查链接、引用、差异与一致性，不据此宣称功能验收通过。视觉原则以 [UI_DESIGN.md](./docs/UI_DESIGN.md) 为准：默认完整、偏好渐进开放，保留瀑布与底部孔位/吹吸锚点；具体风格及默认参数仍需用户定档。

**三条减负铁律**（每次做取舍时按此排序）：

**复用优先于自研 · 纯函数优先于组件内逻辑 · 自动优先于手动。**

---

> 以下为参考资料。**冲突时服从上面的最高优先级。**

## 项目概述

Expo / React Native 的**单机、单用户** Android 跟吹应用，**纯本地、无后端**；轻依赖（零新增运行时依赖）与离线可用是硬约束。

| 用途 | 选型 |
|---|---|
| 语言 / 框架 | TypeScript（strict）· React 19 · Expo SDK 57 · React Native 0.86 |
| 路由 | Expo Router（`src/app/` 下每个文件一个屏） |
| 动画 | Reanimated 4（跑在 UI 线程）+ react-native-worklets |
| 绘图 | react-native-svg —— 图标 / 渐变 / 时间轴 / 滑杆**全部自绘**，不引第三方 UI 库 |
| 持久化 | 原生 `expo-file-system` / Web `localStorage`，**统一收口在 `store/docStore.ts`** |
| 文件选择 | expo-document-picker |
| 出包 | **EAS 云端构建**（本机不装 Java / Android Studio） |
| 发布 | `development`（dev client）/ `preview`（APK，真机直装）/ `production`（AAB 上架） |
| 平台 | 当前 Android 优先；Web 尚未开发/验收为完整产品，未来电脑使用先验证 Web；博客为独立展示模块，桌面壳未定。iOS 不在范围 |

## 模块与分层

依赖方向**单向，禁止反向**：

| 层 | 目录 | 约束 |
|---|---|---|
| 算法层 | `src/core/` | **零 React / RN / Expo 依赖**（`npm run verify` 有边界断言）。可被 Node 脚本直接验证，可被多端零改动复用 |
| 时序层 | `src/player/` | `timing.ts` 为纯函数依赖 core；hook/音频时钟是 React/Reanimated/Expo 平台适配，不反向进入 core |
| 存储层 | `src/store/` | 可依赖 `core`；**数据读写只能走 `docStore.ts`** |
| 主题层 | `src/theme/` | 可依赖 `core` |
| 呈现层 | `src/ui/` · `src/app/` | 最上层，可依赖以上所有 |

- 视觉参数与几何（`core/visual/`）放在 **core 而不是 ui**：纯数据 + 纯函数，这样才能被脚本断言、被 PC / Web 复用。
- `src/app/` 只放路由（每个文件一个屏），非路由代码（组件 / hooks / 工具）一律放在 `src/app/` 之外。
- 页面层**不直接 `fetch`**；未来外部调用统一走 `src/services/`（见 §12.3）。

## 目录结构

```
HarmonicaFlow/
├── package.json / package-lock.json
├── AGENTS.md / AGENTS.LOCAL.md（可选，gitignore）
├── app.json / eas.json / tsconfig.json / eslint.config.js
├── docs/                          # PRD / 技术方案 / 架构 / 评测方案 / 任务规划 / 验收标准
├── src/
│   ├── app/                       # Expo Router 路由
│   │   ├── _layout.tsx
│   │   ├── index.tsx              # 曲库首页
│   │   ├── settings.tsx           # 统一设置页
│   │   └── practice/[id].tsx      # 跟吹页
│   ├── core/                      # 零 React / RN / Expo 依赖
│   │   ├── model.ts               # 领域模型
│   │   ├── pitch.ts               # MIDI / 音名 / 简谱 / 调号
│   │   ├── text.ts
│   │   ├── arrange.ts             # 自动编配
│   │   ├── parsers/               # index · json · abc · musicxml
│   │   ├── layouts/               # index · tremolo24C · diatonic10C · chromatic12C
│   │   └── visual/                # params · flow · index（视觉参数与几何）
│   ├── player/                    # timing.ts · usePlayback.ts
│   ├── store/                     # docStore · library · prefs · coverCache
│   ├── theme/                     # palette · color · tokens · skin · ThemeProvider
│   └── ui/
│       ├── NoteTimeline.tsx       # 时间轴（双方向单视图）
│       ├── StaffBar.tsx           # 横向琴谱
│       ├── TransportBar.tsx       # 播放控件
│       ├── components/            # 设计系统（Icon / Card / Button / Badge / Slider / SongCover …）
│       └── effects/               # 触碰特效（types · registry · pulse）
├── assets/songs/                  # 内置示例曲（twinkle · ode-to-joy）
├── scripts/verify-core.ts         # 核心逻辑自检（无 UI，Node 直接跑）
├── tests/                         # （暂无；纯函数层由 verify-core 覆盖）
└── .github/workflows/             # ci.yml · eas-build.yml · deploy-web.yml
```

## 命令清单

本项目用 **npm**（有 `package-lock.json`，无 `bun.lock`）。

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add —— 会解析出 SDK 兼容版本
npx expo start              # 启动开发服务器
npx expo start --clear      # 清 Metro 缓存后启动（改过依赖后用）

npx tsc --noEmit            # 类型检查
npm run lint                # ESLint
npm run verify              # 核心逻辑自检（解析 / 编配 / 简谱 / 视觉几何）
npx expo-doctor             # 依赖与配置体检

npx expo install --fix      # 修正不兼容的包版本
npx expo export --platform android   # 验证 Metro 能解析全部依赖并打包
npx eas-cli@latest build -p android --profile preview   # 云端出 APK
```

> ⚠️ 本机**不装 Java**，不要尝试 `./gradlew` 或本地打 Android 包，一律走 EAS。

## 文档组织

`docs/` 下：

| 文件 | 内容 | 何时更新 |
|---|---|---|
| [PRD.md](./docs/PRD.md) | 产品定位 / 需求 / 界面 / 成功标准 / 后期规划 | 产品行为、需求变化 |
| [UI_DESIGN.md](./docs/UI_DESIGN.md) | 品牌一致性 / 底部信息锚点 / 个性化与视觉交付约束 | 视觉原则、信息层级或组件语义变化 |
| [TECH_DESIGN.md](./docs/TECH_DESIGN.md) | 分层 / 数据模型 / 算法 / 时序渲染 / 构建部署 / 扩展点 | 技术契约变化 |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 当前边界与跨端 / 博客 / 后端 / AI 的条件性演进 | 对应需求启动时实施，不让本地评分或博客展示依赖后端阶段 |
| [AI_SCORING.md](./docs/AI_SCORING.md) | 录音评测方案（音高检测 / 评分 / LLM 点评） | 评测方案变化 |
| [PLAN.md](./docs/PLAN.md) | 后续任务规划：T0–T7、顺序、产出物、明确不做 | 范围 / 排期变化 |
| [ACCEPTANCE.md](./docs/ACCEPTANCE.md) | 验收标准：三级验证、逐任务验收表、回归清单 | 验收标准变化 |

常用章节定位：`§2` 依赖清单 · `§3` 数据模型 · `§4` 音阶预设 · `§5` 解析器 · `§6` 编配 · `§7` 时序与渲染（`§7.1`–`§7.11`）· `§8` 持久化 · `§9` 验证方式（`§9.1` 视觉矩阵 V1–V10）· `§10` 目录结构 · `§11` 构建与部署（`§11.8` 发布检查清单）· `§12` 扩展点。

## 边界规则

### ✅ 可自主做

- 编辑 `src/**` 业务代码
- 跑四条门禁：`tsc` / `lint` / `verify` / `expo-doctor`，以及 `expo export` 验证打包
- 在 `docs/` 起草文档补遗、按 [PLAN.md](./docs/PLAN.md) 执行任务并填 [ACCEPTANCE.md](./docs/ACCEPTANCE.md) §6 的验收记录
- 按约定粒度拆提交（见下方「Git 提交」）

### ⚠️ 先问

- **新增任何运行时依赖**（零新增运行时依赖是本项目的硬约束）
- 改 `app.json` 的 `version` / `android.versionCode` / `android.package` / `runtimeVersion`（**改原生相关依赖或 `runtimeVersion` 后必须重新出包**）
- 改 `.github/workflows/**`（CI/CD 行为）
- **改 `core/visual/params.ts` 的默认值定档**（视觉定档需用户拍板，见 ACCEPTANCE.md T1-4）
- 改 `docs/` 里的**需求、验收标准、设计原则**（补遗目录、修正笔误不用问）
- 改模块分层或依赖方向（`core` ↔ `ui` 的边界）
- 升级 Expo SDK 版本

### 🚫 绝不

- **手改 `android/` 或 `ios/`** —— 由 CNG 生成且不入库；原生行为只能配 `app.json` 与 config plugin
- **本地打 Android 包**（本机无 Java）；一律走 EAS 云端构建
- **绕过 `docStore.ts` 直读写 `localStorage` / `FileSystem`**
- **在逐帧滚动/动作高亮路径上 `setState`** —— 用 SharedValue + 动画样式；低频剔除与离散特效状态更新须有界并实测，不能声称全组件零重渲染
- **把视觉默认常量散落在组件里** —— 一律收敛到 `core/visual/params.ts`
- **用 Web 验收替代 Android 真机验收** —— 当前 Web 存在跟吹适配问题，不能当成永久平台限制；未来 Web 单独验收，Android 仍需兼容版本的 Expo Go / 开发构建 / 独立 APK 真机验证
- 引第三方 UI 库 / 图标库 / 渐变库（自绘或复用 `react-native-svg`）
- 引入后端 / 云端服务（当前纯本地，生产环境零后端依赖）
- 把用户乐谱内容**默认**发往远端（默认全离线）
- `git push --force` 到 main、跳 hook（`--no-verify`）
- 手工改 `expo-env.d.ts`（Expo 生成）

## 操作前必读

- **改跟吹渲染 / 时序**：TECH_DESIGN §7.3 时间轴渲染 + §7.4 视角算法 + `core/visual/params.ts`（音块用**全曲绝对坐标**，锚点只用于剔除，否则滚动会跳）
- **改视觉 / 皮肤 / 主题**：§7.7 主题系统 + §7.8 UI 设计系统 + §7.11 集中式视觉参数模块，改完跑 §9.1 的「受影响维度 + V9 + V10」
- **改解析器 / 加格式**：§5 解析器设计（可恢复内容保留并提示，不可解析时明确失败且不影响其他曲目；不生成伪谱，不把降级与验收 L1 混用）
- **改编配**：§6 自动编配算法 + §4 音阶预设（**24 孔排列因品牌而异，只能作为可编辑数据存在，禁止硬编码**）
- **改持久化**：§8 持久化 + §12.1 存储接缝，改 `Prefs` 字段**必须写迁移逻辑**
- **改接口 / 扩展点**：§12 扩展点（§12.2 时序接缝 / §12.3 外部能力接缝）
- **改构建 / 发布**：§11（含 §11.8 发布检查清单）
- **报「完成」之前**：ACCEPTANCE.md §2 四条门禁 + §4 回归清单 R1–R8

## 关键约束速查（写代码时对照）

| 约束 | 要求 | 出处 |
|---|---|---|
| 零新增运行时依赖 | 图标 / 渐变 / 滑杆 / 皮肤全部自绘或复用 `react-native-svg` | TECH_DESIGN §2 |
| `core` 不依赖 UI | `src/core/**` 不 import `react` / `react-native` / `expo` | TECH_DESIGN §1（`verify` 有断言） |
| 视觉参数集中 | 几何 / 视角 / 时长 / 皮肤默认值只在 `core/visual/params.ts` | TECH_DESIGN §7.11 |
| 滚动不跳动 | 音块用全曲绝对坐标，`anchorMs` 只用于剔除可视集合 | TECH_DESIGN §7.3 |
| 动画不 `setState` | 命中高亮 / hover 联动走 SharedValue + `useAnimatedStyle` | TECH_DESIGN §7.9 |
| 存储单一入口 | 数据读写只能走 `store/docStore.ts` | TECH_DESIGN §8 |
| 个性化有边界 | 已有偏好保留、默认完整；新增项需有用户价值与组合验收，不能破坏动作语义和可读性 | PRD §6.4 / UI_DESIGN |
| 解析诊断不伪造 | 部分支持明确提示，失败保留其他曲目可用，不以伪谱掩盖错误 | TECH_DESIGN §5 |
| 断网可用 | 默认全离线；仅「在线随机封面」开启时才联网 | PRD §8 |
| 音阶表可编辑 | 排列只作为数据存在，算法里**没有任何硬编码排列** | TECH_DESIGN §4 |
| 可复现 | 同一份谱面 + 同一份音阶表 → 编配结果确定、列表排序确定 | TECH_DESIGN §6 |

## Git 提交（多次少量）

- **小步提交**：每完成一个可独立说明的改动就立刻提交到本地，不要攒成一个巨型提交。宁可多提交几次，也不要把多个不相关的改动混在一起。
- **一次提交只做一件事**：按逻辑边界拆分（如 `docs` / `core` / `theme` / `ui` / `app` / `test` 各自独立成 commit），保证每个提交都能单独回退。
- **提交前保持可编译**：至少跑 `npx tsc --noEmit`（涉及核心逻辑时再跑 `npm run verify`），不让坏状态进入历史。
- **沿用现有提交风格**：`chore:` / `docs:` / `feat(core):` / `feat(ui):` / `fix:` / `test:` 前缀 + 中文简述（说明「为什么」而非「改了什么」）。
- **精确暂存**：只 `git add` 本次改动涉及的文件，不要用 `git add -A` 混入无关文件。
- **提交时机**：仅在用户要求提交时执行；执行时按上述粒度拆成多次提交，而不是一次提交全部改动。

---

# Development Guide

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
