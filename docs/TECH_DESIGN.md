# 口琴跟吹助手 HarmonicaFlow — 技术方案

- 版本：v0.6.0
- 日期：2026-10-08
- 关联文档：[PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)（系统架构：后端 / PC 端 / AI 层，**远期规划**）

> v0.6.0 文档修订：区分当前实现与目标契约，修正缓存、存储扩展和线程边界的过度承诺；UI 原则见 [UI_DESIGN.md](./UI_DESIGN.md)。本次不改代码或默认数值。以下版本摘要仅为历史，当前正文优先。

> v0.5.0 变更摘要（**T3：音频时钟接管时序**，不改消费侧）：
> ① §2 新增运行时依赖 `expo-audio` + 必需 peer `expo-asset`（本项目首次新增运行时依赖，均为 Expo 官方模块、Expo Go 内置）；
> ② 新增 `player/timeSource.ts`（`createAudioClock`），把音频进度换算到时间轴坐标（**音频 0s ↔ `LEAD_IN_MS`**）并收口 play/pause/seek/变速；
> ③ `usePlayback` 增加可选参数 `audioUri`：无伴奏时行为不变（本地计时器），有伴奏时以 **300ms 周期 / 80ms 容差**校准音频时钟（§7.1 / §7.2 / §12.2）；
> ④ 跟吹页新增「伴奏」入口（运行期选文件，**不持久化**——与曲目绑定属 T4）。

> v0.4.0 变更摘要（对 v0.3.0 的**开工前修订**，不新增功能）：
> ① 视觉参数与几何**下沉到平台无关层** `core/visual/`（原 `ui/timeline/params.ts`）——纯数据 + 纯函数，PC / Web 可直接复用；
> ② 方向策略文件改名 `ui/timeline/layouts.ts` → **`ui/timeline/flow.ts`**，避免与 `core/layouts/`（口琴音阶预设）撞名；
> ③ 落块方向由二选一升级为**三选一** `flow: 'down' | 'right' | 'auto'`（`auto` 依屏幕宽高比自动选向），不再是硬约束；
> ④ 视角公式补 **`K_MIN` 下限**，修正 `k → 1` 时 `aheadRatio` 发散的问题；
> ⑤ 明确 **Web 端封面只存远程 URL、不缓存字节**（避免撑爆 `localStorage` 5MB 配额），仅原生端缓存字节；
> ⑥ 补 **`TimeSource` 桥接说明**：音频时钟不能直接当作 Reanimated 共享值，需经 `useFrameCallback` 逐帧写回；
> ⑦ §9 补 **视觉状态验证矩阵**；补 **派生数据（arrange / 时间轴）按 `contentHash` 缓存**，避免首页与跟吹页各算一遍；
> ⑧ §10 目录补 `core/text.ts`、`core/visual/`，并标注 monorepo 化推迟（见 [ARCHITECTURE.md](./ARCHITECTURE.md) §11）。

> v0.3.0 变更摘要：新增**视觉参数集中模块**（原 `ui/timeline/params.ts`，v0.4.0 已迁至 `core/visual/params.ts`）；`NoteTimeline` 的落块抽象为**方向策略**（`flow: 'down' | 'right'`，共用同一套音块分层渲染与剔除逻辑）；**视角**升级为「预设 + 连续角度」（`rotateX` 由 `0°` 连续可调，透视距离仍按几何反推）；新增**白线皮肤**（`skin: 'mono' | 'color'`，黑白灰渐变背景用已有 `react-native-svg` 绘制，零新增依赖）；新增**命中高亮（hover 联动）**（音块 / 判定线段 / 音阶标注共享共享值驱动，UI 线程过渡）；新增**音乐封面**（`ui/components/SongCover.tsx` + 封面字节缓存走 `store/docStore.ts`，在线随机图仅可选开关）；新增**横向琴谱条**与**扩展点**章节（存储 / 时序 / 服务三层留位，为后端、播放器、Agent 预留）。

> v0.2.0 变更摘要：新增 `theme/`（深浅双色板 + 主色派生 + ThemeProvider）；`store/` 引入 `PrefsProvider`（`updatePrefs` 读-合并-写）；`NoteTimeline` **只保留纵向**并新增透视、底部简谱标注、触碰触发的 `ui/effects/` 特效注册表；单词偏好删除 `orientation`，新增 `themeMode / accent / perspective`；出包改走 **EAS 云端构建**（本地不需要 JDK）。

---

## 1. 架构总览

```
┌──────────────────────────────────────────────┐
│ src/app/      页面层（Expo Router）           │
│   index / practice/[id] / settings            │
├──────────────────────────────────────────────┤
│ theme/        主题层（色板 + 皮肤 + Provider） │
│   palette / color / skin / ThemeProvider      │
├──────────────────────────────────────────────┤
│ ui/           展示组件（无业务逻辑）           │
│   timeline/ 音块时间轴（方向策略 + 横向琴谱）  │
│   components/ 设计系统组件（含 SongCover）     │
│   effects/  触碰特效注册表                     │
├──────────────────────────────────────────────┤
│ player/       时序与播放状态机                 │
│   timing / usePlayback（TimeSource 可替换）    │
├──────────────────────────────────────────────┤
│ store/        持久化（唯一存储入口）           │
│   docStore（read/write 收口）/ library / prefs │
├──────────────────────────────────────────────┤
│ core/         纯 TS，零 UI 依赖，可 Node 验证  │
│   parsers/  →  Score                          │
│   arrange   →  TabNote[]                      │
│   pitch     →  音名 / MIDI / 简谱              │
│   layouts/  →  音阶预设数据                    │
│   visual/   →  视觉参数 + 几何/方向纯函数      │
└──────────────────────────────────────────────┘
```

> **`core/visual/` 为什么在 core 而不是 ui**：视觉参数（像素/角度/时长）与几何计算（坐标映射、透视反推）是**纯数据 + 纯函数**，不含任何 React / RN 依赖。放在 `core` 才能被 Node 脚本直接验证，也才能在 PC / Web 端零改动复用（见 §7.11）。

关键边界：`core/` 不 import 任何 React / RN / Expo 模块，因此可以脱离设备用 Node 脚本验证解析、编配与简谱转换的正确性。

**边界说明**：上图是职责概览，不表示各层必须串联依赖，实际依赖方向见 ARCHITECTURE §3。
1. `store/docStore.ts` 是唯一**本地**读写入口；未来同步由独立编排层处理，不能隐式塞入每次文件读写。
2. `player/timing.ts` 是纯函数；`usePlayback.ts` 与 `timeSource.ts` 当前已依赖 React/Reanimated/Expo 音频，是平台适配层，不能称为只依赖 core 的纯层。
3. 未来 `services/` 承接外部能力，页面不直接 `fetch`；现有在线封面是 `coverCache.ts` 的可选联网路径。接口在真实需求出现时抽取，不创建空实现。

> 后续演进：先在当前目录保持边界。第二个独立消费者确需共享包时才抽取纯核心与平台接口；同仓库 Web 适配或博客链接不自动触发 monorepo，也不预先锁定 Electron。见 [ARCHITECTURE.md](./ARCHITECTURE.md) §3。

数据流：

```
文件字节 ──parsers──▶ Score(NoteEvent[]) ──arrange──▶ TabNote[] ──ui──▶ 音块时间轴
                                                     ▲                        │
                                        HarmonicaLayout(预设, 可编辑)          │ 触碰判定线
                                                                              ▼
                                                              effects/ 按列播放特效
```

---

## 2. 关键依赖清单

下表列关键能力依赖，不是完整数量统计；准确清单和版本以 `package.json` / lockfile 为准。新增运行时依赖须先评估并批准，不将“轻量”解释为必须自研全部基础能力。

| 依赖 | 版本策略 | 用途 |
|---|---|---|
| `expo` | 项目锁定 SDK 57，升级单独审批 | 框架 |
| `expo-router` | 随 SDK | 路由 |
| `react-native-reanimated` | Expo 内置 | UI 线程动画（时间轴平移） |
| `react-native-worklets` | 随 reanimated 4（0.10.x） | reanimated 4 的必需 peer 依赖，提供 worklet 运行时与 babel 插件 |
| `react-native-svg` | Expo 内置 | 绘制音块 |
| `expo-document-picker` | 随 SDK | 选择乐谱文件 |
| `expo-file-system` | 随 SDK | 读文件 + 曲库持久化 |
| `expo-audio` | 随 SDK | 播放伴奏音频（T3：音频时钟接管时序） |
| `expo-asset` | 随 SDK | `expo-audio` 的**必需 peer 依赖**，缺失时 Expo Go 之外会崩 |
| `fast-xml-parser` + `fflate` | 纯 JS / MIT | MusicXML 解析、.mxl 解压 |

> 音名与 MIDI 互转自行实现（12 半音表），不引入 `@tonaljs/*`。
> 全部依赖均可在 **Expo Go** 中运行，无需自定义原生构建。
> v0.2.0 未新增运行时依赖：主题、透视、特效、简谱均为纯 JS/TS 实现。
> **v0.3.0 同样零新增依赖**：黑白灰渐变背景用已有的 `react-native-svg`（整屏 `<Svg>` + `LinearGradient`）绘制，
> 不使用 `expo-linear-gradient`（避免新增原生模块、免重新出包）；音乐封面在线随机图用运行时内置的 `fetch`，
> 本地缓存复用 `expo-file-system`；命中高亮用 `react-native-reanimated` 共享值。
> 后续的 UI 设计系统（`theme/tokens.ts` + `ui/components/`，见 §7.8）同样零新增依赖：图标用已有的
> `react-native-svg` 手绘，组件为项目内代码而非第三方库。
> **v0.5.0（T3）是本项目首次新增运行时依赖**：`expo-audio`（播放伴奏）+ 其必需 peer `expo-asset`。
> 两者均为 Expo 官方模块、Expo Go 内置，且**不含自定义原生代码**，因此 Expo Go 与 EAS 出包都不受影响。

### 2.1 出包方式（EAS 云端构建）

RN/Expo 打 Android 包在本地必然依赖 JDK（Gradle/AGP 运行在 JVM 上），换 Python/Go 重写等于废弃现有代码。因此**出包走 EAS 云端构建**，本机不安装 Java：

```
bunx eas-cli login          # 首次需 Expo 账号
bunx eas-cli build --platform android --profile preview    # 云端出 APK
bunx eas-cli build --platform android --profile production # 出 AAB 上架
```

- `eas.json` 提供 `development / preview / production` 三档 profile（`preview` 出可直接安装的 APK）。
- 本机仍可 `npx expo start` 用 Expo Go 扫码做真机联调，无需任何原生工具链。
- 原生工程由 **CNG** 在云端生成；`android/` `ios/` 依旧不手改。

---

## 3. 数据模型

```ts
export type SourceFormat = 'json' | 'abc' | 'musicxml';

/** 与来源格式、口琴型号解耦的音符事件 */
export interface NoteEvent {
  id: string;
  midi: number;            // MIDI 音高，C4 = 60
  startTicks: number;      // 起始 tick
  durationTicks: number;   // 时值 tick
  lyric?: string;
}

export interface Score {
  id: string;
  title: string;
  composer?: string;
  ppq: number;                    // 每四分音符 tick 数
  tempoBpm: number;
  timeSignature: [number, number];
  keySignature?: string;          // 如 "C" / "G"
  events: NoteEvent[];
  source: SourceFormat;
}

/** 口琴上的一对孔位（复音/布鲁斯：blow+draw；半音阶：再含 push） */
export interface Hole {
  index: number;                  // 1 起
  blow: number | null;            // MIDI，null = 该孔无此吹法
  draw: number | null;
  blowPush?: number | null;       // 半音阶推键
  drawPush?: number | null;
}

export interface HarmonicaLayout {
  id: string;
  name: string;
  type: 'tremolo24' | 'diatonic10' | 'chromatic12';
  key: string;
  holes: Hole[];
  notes?: string;                 // 排列来源 / 待校对说明
}

export type TabAction = 'blow' | 'draw' | 'blowPush' | 'drawPush';

/** 编配结果，渲染层直接消费 */
export interface TabNote extends NoteEvent {
  hole: number;
  action: TabAction;
  noteName: string;               // 如 "C5"
  feasible: boolean;              // false = 所选口琴吹不出
}
```

### 3.1 自有 JSON 谱面格式

```json
{
  "format": "harmonicaflow-score",
  "version": 1,
  "title": "示例曲",
  "composer": "",
  "ppq": 480,
  "tempoBpm": 90,
  "timeSignature": [4, 4],
  "keySignature": "C",
  "notes": [
    { "note": "C5", "start": 0,   "duration": 480 },
    { "note": "E5", "start": 480, "duration": 480 }
  ]
}
```

- `start` / `duration` 单位为 tick（与 `ppq` 配套）；也允许 `"start": "1/4"` 形式的分数拍。
- 校验：`format` 必须匹配，`ppq > 0`，音名可被音高模块解析。

---

## 4. 音阶预设（关键风险项）

> ⚠️ **24 孔复音口琴的音阶排列因品牌/地区而异**（Hohner、Seydel 与国产 24 孔并不一致）。因此排列**只作为可编辑的数据**存在，算法中没有任何硬编码排列；App 内提供音阶表页面供用户对照实体琴校对修改。
> 上表默认值中，10 孔布鲁斯（Richter 调音）为业内标准；24 孔复音与半音阶的高音区存在品牌差异，**需用户校对**。

### 4.1 24 孔复音（C 调，常见亚洲式排列）

奇数孔为吹、偶数孔为吸；吹排与吸排各自独立升序（因此存在"孔号大的音反而低"的情况）。

| 孔号 | 1 | 3 | 5 | 7 | 9 | 11 | 13 | 15 | 17 | 19 | 21 | 23 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 吹 | C4 | E4 | G4 | C5 | E5 | G5 | C6 | E6 | G6 | C7 | E7 | G7 |

| 孔号 | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 22 | 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 吸 | D4 | F4 | A4 | B4 | D5 | F5 | A5 | B5 | D6 | F6 | A6 | B6 |

### 4.2 10 孔布鲁斯（C 调，Richter 标准调音）

| 孔号 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 吹 | C4 | E4 | G4 | C5 | E5 | G5 | C6 | E6 | G6 | C7 |
| 吸 | D4 | G4 | B4 | D5 | F5 | A5 | B5 | D6 | F6 | A6 |

> 本版**不实现压音（bending）**，因此低音区缺失音与 F/A 等音会被标记为不可吹。

### 4.3 半音阶（12 孔，Solo 调音，C 调）

| 孔号 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 吹 | C4 | E4 | G4 | C5 | C5 | E5 | G5 | C6 | C6 | E6 | G6 | C7 |
| 吸 | D4 | F4 | A4 | B4 | D5 | F5 | A5 | B5 | D6 | F6 | A6 | B6 |

- 推键（push）使音高 +1 半音，即 `blowPush = blow + 1`、`drawPush = draw + 1`。

---

## 5. 解析器设计

统一入口：

```ts
parse(content: string | Uint8Array, filename: string): Score
```

按扩展名分派：`.json` → json 解析器；`.abc` / `.txt` → ABC；`.musicxml` / `.xml` / `.mxl` → MusicXML。

| 解析器 | 实现要点 |
|---|---|
| `json.ts` | 直接校验并映射为 `Score`；支持 `note` 音名或 `midi` 数字；tick 或分数拍 |
| `abc.ts` | 实现常用子集：头部 `X/T/M/L/K/Q`；音名 `CDEFGAB` + 八度 `'` `,`；临时记号 `^ _ =`；时值倍数 `2`、`/2`、`3/2`；小节线、连音 `-`、休止 `z`。`L:` 定义默认时值，`Q:` 或默认 120 取速度 |
| `musicxml.ts` | `fast-xml-parser` 解析；遍历 `score-partwise/part/measure/note`：取 `pitch(step,alter,octave)`、`duration`、`rest`、`chord`、`tie`；用 `divisions` 把 duration 折算为 tick（`ppq` 固定为 480）；`backup`/`forward` 处理多声部时间轴；`<sound tempo>` 或默认 120 取速度。`.mxl` 先用 `fflate` 解压出 `META-INF/container.xml` 指向的根 XML |

> **现状与目标分开**：当前 MusicXML 默认取第一个 `part`；同一 part 内多 voice 的旋律选择尚未形成可靠契约，和弦最高音分支也有游标比较问题。当前返回 `Score`，没有解析诊断报告，不能声称已统计所有丢弃内容。

### 5.1 语义正确性与诊断（待实现，PLAN T0）

- 解析成功不等于语义正确。先修 ABC 调号及 Q 节拍单位、MusicXML 和弦/多声部，再建立“解析 → 单旋律归一化 → 编配”的纯函数边界；首个 part 只是默认选择，不能等同主旋律识别。
- 诊断应区分完全支持、可用但简化、无法练习；记录被忽略的声部/反复/变速等信息。不支持且影响音高或时序的内容不能静默假装正确。
- 可恢复的内容保留并提示；无法得到可靠音符时明确失败，保留其他曲目和原文件，不编造音符。“降级”不表示所有输入都必须成功，也不与 ACCEPTANCE 的 L1/L2/L3 验证级别混用。
- 当前模型只有单一 BPM/拍号/调号。先声明匀速子集与限制；一般变速谱支持需另设计按 tick 的 tempo map 与分段时间换算，不靠音频校时补偿谱面语义错误。
- 新增诊断/旋律契约前同步更新 §3 模型与测试样本，不在呈现组件中补解析规则。

---

## 6. 自动编配算法（`core/arrange.ts`）

```
输入：Score.events（按 startTicks 升序）+ HarmonicaLayout
输出：TabNote[]（与输入等长，一一对应）
```

1. **建索引**：遍历 `holes`，构造 `Map<midi, {hole, action}[]>`。复音/半音阶琴存在同音多孔（如 C5 在孔 7/9 等），故候选是数组。
2. **选优**：按时间顺序做**束搜索（beam search）**，避免纯贪心陷入局部最优。代价函数

   ```
   cost(state) = prev.cost
               + |hole - prevHole| * HOLE_WEIGHT
               + (prevAction === action ? 0 : ACTION_CHANGE_PENALTY)
               + |hole - center| * OCTAVE_WEIGHT
   ```

   每步对所有候选算出最优前驱，按 cost 排序后保留前 `BEAM_WIDTH` 条（默认 12），
   最后一个音回溯取全局最优路径。action 变化按**完整吹法**（`blow`/`draw`/`blowPush`/`drawPush`）
   比较，而非仅比较吹吸家族，避免半音阶上滥用推键。
3. **可行性**：候选为空 → `feasible = false`，`hole/action` 取该音最接近的孔位用于展示，并计入统计。
4. **输出**：`TabNote[]`，附 `noteName`（由 `pitch.ts` 生成）。

`arrange` 同时返回统计信息：`{ total, feasibleCount, infeasibleNotes: string[] }`，供跟吹页顶部提示条使用。

---

## 7. 时序与渲染

### 7.1 时序（`player/timing.ts`）

```
msPerTick = 60000 / (tempoBpm * ppq)
totalMs   = max(startTicks + durationTicks) * msPerTick
```
含 `LEAD_IN_MS = 2000` 的起吹留白。

**音频时钟接管（v0.5.0 / T3）**：伴奏音频的播放进度以**时间轴坐标**记账——第一个音块位于 `positionMs = LEAD_IN_MS`，故定义 **音频 0s ↔ 时间轴 `LEAD_IN_MS`**（`audioStartMs = LEAD_IN_MS`）。`LEAD_IN_MS` 保持不变，因此**时间轴 / 特效 / 命中高亮等消费侧一行未改**，只换了供给侧时钟。

### 7.2 播放状态机（`player/usePlayback.ts`）

- 以 Reanimated 共享值 `positionMs` 承载播放位置，`play()` 用 `withTiming(totalMs, { duration: (totalMs - from)/speed, easing: linear })` 驱动，暂停时 `cancelAnimation` 并从当前值续播。
- 对外暴露：`positionMs / isPlaying / speed / play / pause / restart / seek(ms) / setSpeed(x)`；倍速档位 `SPEED_OPTIONS = [0.5, 0.75, 1]`。函数签名新增可选第三参 `audioUri`，**不传时行为与以前完全一致**（本地计时器）。
- **两套时钟（供给侧的桥接，见 §12.2）**：
  - **无伴奏**（默认）：本地 `withTiming` 计时器驱动，唯一时钟。
  - **有伴奏**：本地 `withTiming` 仍在 UI 线程负责**平滑推进**；另按 300ms 周期读取音频时钟（`player.currentTime`），当偏差超过 **80ms 容差**时才重锚一次。这样既不引入 `withTiming` 之外的抖动，又把漂移钉在感知阈值以内（音频可辨识的规律性偏差约为 ±100ms）。回调频率不足或耗电不可接受时，退路是「本地计时器为主 + 音频仅作伴奏」，**不阻塞后续任务**。
  - 起吹留白：`positionMs < LEAD_IN_MS` 期间伴奏尚未起播，由本地计时器跑完 `(LEAD_IN_MS − from) / speed` 后 `seekTo(0) + play()` 交接；暂停 / 拖动 / 变速会取消或重排这个交接定时器。
  - 变速：`setSpeed` 同时写 `player.playbackRate`；音频播放位置与滚动位置的换算天然一致（都以 `speed` 推进），故无需在 `playbackRate` 上二次换算。
  - 音频时钟实现收口在 [`player/timeSource.ts`](../src/player/timeSource.ts)（`createAudioClock`），`usePlayback` 不直接依赖 expo-audio 的 API 细节。

### 7.3 时间轴渲染（`ui/NoteTimeline.tsx`，双向单视图）

- **方向策略**（`flow: 'down' | 'right' | 'auto'`，来自设置，接口与纯几何见 `core/visual/flow.ts`）：把「时间轴 + 判定线 + 音阶标注」抽象成一个 `FlowLayout` 策略，两个方向实现**共用同一套**音块分层渲染、可视剔除、触碰特效、命中高亮逻辑，差别只在坐标映射与判定线位置：
  - `down`：X = 孔位列，Y = 时间；判定线在**底部**横线；音阶标注在判定线**下方**。
  - `right`：Y = 孔位列，X = 时间；判定线在**右侧**竖线；音阶标注在判定线**右侧**（孔列自上而下依次排列）。
  - `auto`（默认）：按可视区**宽高比**自动选向——竖屏 / 窄窗选 `down`，横屏 / 宽窗选 `right`，随窗口尺寸变化即时重算（纯函数 `resolveFlow(flow, {width, height})`）。方向是**用户可改的偏好**，不是硬约束。
  - 切换方向保持 `positionMs` 不变（不打断滚动位置），仅重算布局参数。
- 用一个 `Animated.View` 包裹整块 `<Svg>` 承载整体平移（而非动画 SVG 内部的 `<G>`，以规避 SVG 内部 transform 动画的兼容风险）；**只有 1 个动画节点**，滚动在 UI 线程完成，不触发 React 重渲染；平移轴随方向切换（`down` 用 `translateY`，`right` 用 `translateX`）。
- **全曲绝对坐标**：音块坐标只由音符自身时刻决定，与可视窗口无关。滚动完全由 UI 线程的整块平移承担（anchor-free、永不重建），因此每 500ms 的重算不会改变渲染坐标，滚动连续无跳动。
- **剔除**：`useAnimatedReaction` 监听 `positionMs`，每 500ms 通过 `runOnJS` 回传一次锚点；锚点**只用于剔除可视音块集合**（判定线上方 `ahead` 像素 + 判定线以下），渲染坐标不变，控制节点数 < 40。
- 坐标（统一用 `PX_PER_SEC = 160` 与 `BLOCK_GAP` / `MIN_BLOCK_PX`；画布长度 `songLen = (totalMs + LEAD_IN_MS) * pxPerMs + playhead`）：

  ```
  len  = max(durationMs * pxPerMs, MIN_BLOCK_PX)          // 时值 → 方块长度
  lane = (hole - 1) * rowSize + BLOCK_GAP / 2             // 孔列 → 横向/纵向档位

  // 全曲绝对坐标（恒定，永不随窗口变化）
  down :  w = rowSize - BLOCK_GAP, h = len   // y = songLen - (startMs + LEAD_IN_MS) * pxPerMs - len, x = lane
  right:  h = rowSize - BLOCK_GAP, w = len   // x = songLen - (startMs + LEAD_IN_MS) * pxPerMs - len, y = lane
  ```

  屏幕位置折算：`down` 为 `playhead + (positionMs - startMs - LEAD_IN_MS) * pxPerMs`（作用于 Y），`right` 同式作用于 X，与原窗口化公式等价。
- 配色统一取主题色板（`theme/`）与**皮肤**（`theme/skin.ts`）：彩色皮肤下吹 = 暖色、吸 = 冷色、推键为对应亮色，不可吹 = 弱化描边；**白线皮肤**下吹 = 白/浅灰渐变实体、吸 = 白色描边空心、不可吹 = 极淡灰弱化；组件内不硬编码色值，只按 `skin` 取色阶。
- **音块分层渲染**（全部静态元素，不引入逐块动画，满足上面的"单动画节点"约束）：
  - `<Defs>` 里按动作类型各定义一次 `LinearGradient`（`blow / blowPush / draw / drawPush / infeasible`，色阶按当前皮肤派生：彩色 = 顶亮→主色→底暗，白线 = 白→浅灰），另加一条共用的白色高光渐变；渐变用默认的 `objectBoundingBox` 单位，**同一个 id 被任意尺寸音块复用**，节点数不随窗口化增长。渐变方向随手势：`down` 用竖向（上亮下暗），`right` 用横向（左亮右暗）。
  - 每块由 `<G>` 包裹多层：投影（半透明 Rect）→ 渐变主体 → 迎光面高光带 → 背光面色阶线；推键额外叠加一圈内侧描边（不用 SVG `pattern`，规避 Android 兼容风险）。
  - 被透视压扁的远端小块（`w < 14` 或 `h < 14`）只画主体，避免远场出现噪点；音名标签垂直居中，避开顶部高光带。
  - 不使用 SVG `filter`（`feDropShadow` / `feGaussianBlur`）——在 react-native-svg 的 Android 实现上不可靠且开销大。
  - 渐变 id 必须是 URL 安全字符串：`url(#…)` 引用不了含冒号的 id（如 `React.useId()` 的输出）。
- 判定线：`down` 位于 `playhead = height - LABEL_AREA_H`（底部留出 42px 简谱标注区），`right` 位于 `playhead = width - LABEL_AREA_W`（右侧留出标注区）；颜色取皮肤线条色（白线皮肤 = 细白线，彩色皮肤 = `theme.playhead`）。
- 判定线一侧的可视区单独用一个带 `overflow: hidden` 的容器包裹，方块越过判定线后即被裁掉，形成"压线即命中"的观感。
- **横向琴谱条**（可选，`staffBar: 'full' | 'hint' | 'off'`）：一条独立于落块的读谱辅助——`full` 显示整曲按时间顺序的音名/简谱（小字号、只读、随 `positionMs` 高亮当前音），`hint` 只在判定线附近显示**即将到来的 1–2 小节**，`off` 不渲染。它复用 `core/pitch.ts` 的简谱输出，不参与时序与编配。

### 7.4 视角算法（垂直 ↔ 斜视，连续可调）

默认视觉是「钢琴瀑布」式的近大远小；视角是**一个连续量**，不是开关：

- **设置项**：持久化 `viewAngle: number`（度，范围 `0`–`VIEW_ANGLE_MAX = 45`）；`0` = **100% 垂直**（无透视，纯正交），角度越大越"斜视"。设置页同时给**预设按钮**（垂直 `0°` / 弱 `22°` / 强 `34°`）作为快捷方式与**高级滑块**（0–45°）直接调；预设只是把滑块设到对应值，两者不冲突。
- **压缩强度 `k`**（前缩快慢）与角度共同决定观感：`k` 越接近 1，远端越快收拢到消失点。**`k` 有下限 `K_MIN = 1.15`**——因为 `aheadRatio` 含 `1/(k-1)`，`k → 1` 会发散（需要预排无限屏才能填满），所以 `k` 只在 `[K_MIN, +∞)` 取值。**`k` 是开发者常量（`K_DEFAULT = 1.6`），不进设置页**——它对用户没有可解释的语义，暴露只会增加困惑；用户只调角度（`viewAngle`），`k` 由 `core/visual/params.ts` 统一微调（§7.11）。

SVG 仅支持 2D 仿射，做不了真透视；因此把透视施加在**包裹 Svg 的容器**上，以判定线为原点旋转：

```
down :  transform: [{ perspective: P }, { rotateX: 'θdeg' }]   transformOrigin: '50% 100%'
right:  transform: [{ perspective: P }, { rotateY: 'θdeg' }]   transformOrigin: '0% 50%'   // 绕过右侧判定线
```

- **完全垂直（θ = 0）**：直接不挂 `perspective / rotateX|rotateY`，走「平铺」分支（`aheadRatio = AHEAD_RATIO_FLAT`），避免 `tanθ → 0` 的数值问题；这正是「100% 垂直」档的实现。
- **关键几何约束**：绕判定线旋转 θ、透视距离 P 时，平面的投影长度被裁剪在 `P / tanθ`；若 `P < playhead·tanθ`，可视区远端无内容、会露出空白。因此 P 不写死，而是按可视尺寸反推（`k > 1`）：

  ```
  θ  = clamp(viewAngle, 0, VIEW_ANGLE_MAX)；小角度（< 1°）视为 0，走平铺分支
  k  = max(k, K_MIN),  K_MIN = 1.15             // 防止 (k-1) → 0 使 aheadRatio 发散
  P          = round(k * playhead * tanθ)       // k 越小前缩越剧烈
  aheadRatio = clamp(k / (cosθ * (k - 1)) * 1.1, 1.2, AHEAD_RATIO_MAX)   // 预排屏数 + 10% 余量，且有硬上限
  ```

  三重保护让公式在边界处不发散：`θ < 1°` 走平铺分支避开 `tan0`、`k` 有下限避开 `1/(k-1)`、`aheadRatio` 再有硬上限 `AHEAD_RATIO_MAX = 6` 防止极端角度下预排过多节点。这样对机型尺寸自适应，不再依赖固定 P 值。

  > **`aheadRatio` 的推导与"两套模型"的边界**：设判定线上方距离 `d` 的平面点投影到 `y' = d·cosθ / (1 + d·sinθ/P)`；令 `y' = playhead`、代入 `P = k·playhead·tanθ`，解得 `d / playhead = k / (cosθ·(k−1))`，即上式。注意 `θ → 0` 时该式极限为 `k/(k−1) ≈ 2.67`，与平铺分支的 `AHEAD_RATIO_FLAT = 1.2` **不相等**——但 `aheadRatio` **只用于剔除（决定预挂载多少屏外的音块）**，不参与渲染坐标（坐标是全曲绝对、锚点无关）。所以这个跳变**不会造成方块位置跳动**，仅在一瞬间改变已挂载的节点数（≤ 一屏的差异）。这是刻意的取舍：不为一个纯剔除参数引入混合插值。
- 判定线保持不动、越往远端越"后退"，各孔列同时向中轴收拢，即"人眼看向远路"的消失点观感。
- 已知代价：块内文字会随容器一起倾斜（属可接受的视觉风格）；如后续需要文字始终保持正视，可改为对每列单独做 2D 梯形缩放。
- 该变换只作用于展示容器，不影响时序与命中计算（判定线仍按未变换坐标计算）。
- `down` 与 `right` 共用同一套公式，只是旋转轴与 `transformOrigin` 不同。

### 7.5 触碰特效（`ui/effects/`）

- **触发**：判定线对应 `note.startMs`（`down` 为方块下沿压线、`right` 为方块右沿压线）。以 `useAnimatedReaction` 监听 `positionMs` 越过各接触时刻（跨桶判断），`runOnJS` 触发一次特效实例。
- **渲染**：特效实例记录 `{ id, hole, action, color }`，在判定线该列中心渲染，约 320ms 后由实例自己回调 `onDone(id)` 移除；不阻塞主时间轴动画。
- **可插拔**：`effects/types.ts` 定义 `TimelineEffect` 接口（`name` / `durationMs` / `render(ctx)`），`effects/registry.ts` 维护注册表，`effects/pulse.tsx` 为默认"脉冲环"。以后新增特效只需注册新实现，不改动 `NoteTimeline`。
- 触发加了防刷量：单次前进跨越的音符数超过 `MAX_BURST = 8` 视为拖动进度，只推进游标不补发特效。
- 颜色取该音所在 `action` 的主题色，与音块保持一致。

### 7.6 音阶标注（判定线一侧）

底部演奏面板以孔号和吹/吸为主要信息，简谱为辅助；横向模式沿判定线对应一侧放置。布局与动作强调的目标见 UI_DESIGN §2–§4，不能仅以简谱两行已显示就判定动作可读性通过。

- `core/pitch.ts` 新增 `midiToJianpu(midi, tonicPc)`：返回音级 `1-7`、变音记号（非音阶级统一用 `#` 记法，如 C 调 C#4 = `#1`）、相对基准八度的偏移；`formatJianpu` 把偏移渲染为小圆点（高八度后置 `1·`、低八度前置 `·1`）。
- 主音由 `keySignatureToTonicPc(score.keySignature)` 解析（缺省 C）；基准八度取中央 C 附近的主音。
- 按孔列显示该孔 **吹 / 吸** 两个简谱度数并标出孔号，供用户对照实体琴（半音阶的推键音同孔同列，不重复标注）。位置随方向：`down` 在判定线**下方**（底部栏），`right` 在判定线**右侧**（右侧栏，孔列自上而下）。

### 7.7 主题系统（`theme/`）

- `theme/color.ts`：无依赖的 HSL 工具（hex/rgb/hsl 互转、明度调整、透明度、相对亮度、可读前景色），负责按主色 `accent` 派生深浅两套变体。
- `theme/palette.ts`：色板键 `background / surface / surfaceAlt / text / textMuted / border / placeholder / accent / accentSoft / onAccent / blow / blowPush / draw / drawPush / infeasible / infeasibleBorder / infeasibleText / playhead / success / danger / warningBg / warningText / shadow / accentBorder / successSoft / dangerSoft`；由 `buildPalette(scheme, accent)` 生成，另导出 `ACCENT_PRESETS` 供设置页选集。
- **皮肤（`theme/skin.ts`，v0.3.0 新增）**：`skin: 'mono' | 'color'`（默认 `mono`）。`skin` 与 `scheme`（深浅）**正交**，产出一组「时间轴视觉令牌」：**背景渐变 stops**、**线条色与线宽**、**音块填充 / 描边策略**、**高亮色**（默认取 `accent`）。
  - `mono`：**黑白灰渐变背景**（深色 = 黑→灰、浅色 = 白→浅灰），音块 = 亮块实体 / 白色描边空心 / 极淡灰不可吹；所有结构线条为细白线。背景用整屏 `<Svg>` + `LinearGradient` 画在最底层，**零新增依赖**。
  - `color`：沿用现有暖/冷语义色音块与彩色判定线，背景为纯色 `background`。
- 吹/吸在**彩色皮肤**下为**语义色**（暖/冷），与主色解耦，保证"吹吸一眼可辨"；深色下主色与吸音色会自动提亮，保证对比度。**白线皮肤**下靠「实体 vs 空心 + 线宽」区分，同样一眼可辨。
- **透明度**：`opacity: 'solid' | 'soft' | 'glass'`（设置项，默认 `solid`），映射为音块填充不透明度与背景不透明度；`glass`（通透）档能透过音块看到背景线条。透明度只影响视觉，不影响命中判定。
- `theme/ThemeProvider.tsx`：从 `usePrefs()` 读取 `themeMode`、`accent`、`skin`、`opacity`，经 `useColorScheme()` 解析出最终 `scheme`，`useMemo` 生成色板与皮肤令牌并通过 Context 下发；对外暴露 `useTheme()` 返回 `{ scheme, colors, skin, timeline }`（`timeline` 即当前皮肤的时间轴视觉令牌）。
- 全部组件样式中的硬编码色值改为从 `useTheme()` 取值；静态 `StyleSheet` 只保留尺寸/布局。
- 切换深浅 / 皮肤 / 主色 / 透明度即时生效（Context 驱动重渲染），无需重启。

### 7.8 UI 设计系统（`theme/tokens.ts` + `ui/components/`）

设计原则以 [UI_DESIGN.md](./UI_DESIGN.md) 为准。下列组件是当前实现；字体层级、动作级底栏强调、减少装饰动效和完整状态覆盖属于 T1 待验证/待完善项目，不因写入本文视为已经实现。皮肤扩展只改视觉令牌，不改编配、时间换算或孔位映射；新增偏好须说明价值与组合验收，不自动添加设置项。

参照 shadcn/ui 的「开放代码 + 可组合 + 好看默认值」思路，把散落在页面里的内联样式收敛成一层自有组件，
**不引入任何 UI 库或图标字体**——图标用已有的 `react-native-svg` 手绘，令牌只写尺寸与投影：

- `theme/tokens.ts`：与配色无关的几何令牌——`spacing`（4pt 刻度）/ `radius` / `MIN_TOUCH`，以及
  `elevation(level, shadowColor)`（iOS 走 `shadow*`、Android 走 `elevation`，两者互不相通必须成对给）。
- `ui/components/`：`Icon`（24 网格 · 手绘描边图标集，颜色随主题）、`Card`（圆角 + 细描边 + 轻投影）、
  `Button`（primary/secondary/ghost/danger × sm/md/lg，支持图标与加载态）、`Badge`（语义色药丸标签）、
  `IconTile`（列表左侧图标底托）、`SegmentedControl`（滑块平移动画）、`Row`（列表 / 设置行）、
  `HarmonicaMark`（主题化口琴插画）；统一从 `ui/components/index.ts` 导出。
- 色板新增 `shadow` / `accentBorder` / `successSoft` / `dangerSoft` 四个语义键，供投影、强调描边与徽标使用。
- 组件只吃「语义色板 + 几何令牌」，页面不写死色值与投影；深浅配色、主色切换对全部组件即时生效。
- 可达性与反馈统一：可点区域不低于 `MIN_TOUCH`，可点元素带 `accessibilityRole/Label/State`，并有按下反馈。
- v0.3.0 新增组件：`SongCover`（曲目封面，见 §7.10）、`Slider`（连续角度 / 透明度的**高级调节**控件，用 RN 内置 `PanResponder` + Reanimated 共享值实现，**不引入** `@react-native-community/slider` 原生依赖），并给 `Button / Row / SegmentedControl` 补上指针 `hover` 态（PC / Web）。

### 7.9 命中高亮（hover 联动）

这里“命中”仅指音块到点提示，与指针 hover、麦克风吹奏正确性判定是三件事。底部演奏面板是孔位/吹吸信息锚点；当前代码主要按 `hitHole` 强调整孔，不能当成动作级吹/吸/推键强调已完成的证据。完善目标与验收见 UI_DESIGN §3–§4。

- **目标**：音块压线瞬间，**音块 + 判定线该列段 + 该孔音阶标注**三者同步高亮一下（约 `HIT_HIGHLIGHT_MS = 200ms`，随后自然回落），给"该吹了"一个连贯、即时的提示。
- **触发**：与触碰特效共用同一套「跨接触时刻」检测（`useAnimatedReaction` 监听 `positionMs` 越过 `hitTimes`），避免两套计时造成抖动。
- **驱动（当前实现与约束）**：连续滚动与到点高亮采用共享值及动画样式，不在逐帧路径上 `setState`。当前还有低频可视窗口更新和离散特效实例的 React 状态管理，不能声称整个时间轴完全没有 React 重渲染；这些路径需控制更新量并真机测量。
- **节点预算**：高亮尽量复用节点，特效可有界创建/回收；“只有一个动画节点”仅描述整体平移的骨架，不是整个页面的节点数承诺。UI 线程实现是设计手段，不能替代帧率与可读性验收。
- **指针 hover（PC / Web）**：控件层（`Button / Row / SegmentedControl / Slider`）在有指针时提供 `hover` 与 `press` 两态过渡反馈；过渡时长统一取自 §7.11 的 `INTERACTION_MS`，保证各控件一致、自然。

### 7.10 音乐封面（`ui/components/SongCover.tsx`）

- **来源优先级（本地优先）**：① 用户为曲目设置的**本地封面** → ② **内置封面**（随包资源）→ ③ **在线随机图**（仅在开关打开时）→ ④ 兜底：曲名首字 + 皮肤渐变的**占位图**。
- **在线随机图是可选开关（默认关）**：设置项 `onlineCover: boolean`。开启后首次为某曲拉取一张随机图；**缓存策略分平台**（关键，见下）；拉取失败或离线自动回退到 ② / ④。**默认不联网**，符合纯本地原则。
- **缓存策略分平台（修正）**：
  - **原生端**：把字节缓存到持久目录，离线读缓存；仍需考虑设备空间与清理，不能假定容量无限。
  - **Web 端**：只把 URL 映射存进 covers.json，不缓存图片字节；Web 存储容量有限，写入可失败，不能按固定配额或静默成功设计。浏览器缓存不保证离线命中，加载失败回落到占位封面。
  - 判断依据由 `docStore` 暴露的 `supportsBinaryCache` 常量给出，上层不写平台分支。
- **读写收口**：封面字节读写走 `store/docStore.ts`（复用已有 `readBytes` / `writeBytes`，仅原生端走字节路径）；在线取图逻辑单独放在 `store/coverCache.ts`（`fetch` → 原生端写入 `docStore` / Web 端只记 URL → 返回可用 URI），组件只拿 URI，不直接用 `fetch` / `File`。
- **展示**：曲库列表项与跟吹页顶部各一处，圆角 + 细描边，随皮肤取色。

### 7.11 集中式视觉参数模块（`core/visual/`）

- **动机**：时间轴的尺寸 / 角度 / 时长原本散在 `NoteTimeline.tsx` 顶部常量与设置项里，调一个观感要翻多处。v0.3.0 把所有可调视觉常量**收敛到一个模块**，v0.4.0 进一步**下沉到平台无关的 `src/core/visual/`**：
  - `core/visual/params.ts`（纯常量，零依赖）：
    - 几何：`PX_PER_SEC`、`BLOCK_GAP`、`MIN_BLOCK_PX`、`LABEL_AREA_H / LABEL_AREA_W`、`WINDOW_STEP_MS`、`MAX_BURST`、`CULL_MARGIN_MS`。
    - 视角：`VIEW_ANGLE_MAX`、`DEFAULT_VIEW_ANGLE`、`VIEW_PRESETS`（垂直 / 弱 / 强）、`K_DEFAULT`、`K_MIN`、`AHEAD_RATIO_FLAT`、`AHEAD_RATIO_MAX`。
    - 命中与交互：`HIT_HIGHLIGHT_MS`、`INTERACTION_MS`、`NOISE_MIN_PX`（远端降噪阈值）。
    - 皮肤默认：`DEFAULT_SKIN`、`DEFAULT_OPACITY`、`AUTO_FLOW_THRESHOLD`（`auto` 选向的宽高比阈值）。
  - `core/visual/flow.ts`（方向接口 + 纯几何）：`resolveFlow`、`computeViewGeometry(playhead, angle, k)`、`laneToOffset` / `timeToOffset` 等。
- **为什么在 `core` 而不是 `ui`**：这些是**纯数据 + 纯函数**，不 import React / RN。放 `core` 才能：① 被 Node 脚本（`scripts/verify-core.ts` 或其扩展）直接断言；② 被 PC / Web 端零改动复用，保证**多端视觉一致**。
- **命名避撞**：方向策略文件叫 `flow.ts`，**不叫 `layouts.ts`**——`core/layouts/` 已经是**口琴音阶预设**（`tremolo24C` 等），两者语义无关，同名会造成阅读混淆。
- **页面与组件只读不写**：`NoteTimeline`、设置页、`SongCover` 都从该模块取值，或经 `usePrefs()` 覆盖为**用户值**，不再各自写默认常量。
- **"用户可调项"与"开发者常量"分离**：前者进 `Prefs`（持久化、设置页可改），后者只在 `params.ts` 改（改一处即可整体微调）。

---

## 8. 持久化（`store/library.ts`）

用户偏好：`prefs.json`（字段是当前实现；尚未具备完整版本化 schema 与恢复机制）

| 字段 | 类型 | 说明 |
|---|---|---|
| `layoutId` | `string` | 当前口琴预设 |
| `speed` | `number` | 播放倍速（0.5 / 0.75 / 1） |
| `themeMode` | `'system' \| 'light' \| 'dark'` | 主题模式 |
| `skin` | `'mono' \| 'color'` | 皮肤，缺省 `mono`（白线） |
| `accent` | `string` | 主色（hex），缺省为品牌蓝 |
| `opacity` | `'solid' \| 'soft' \| 'glass'` | 音块 / 背景透明度，缺省 `solid` |
| `flow` | `'down' \| 'right' \| 'auto'` | 落块方向，缺省 `auto`（按可视区宽高比自动选向；用户可手工指定 `down` / `right`） |
| `viewAngle` | `number` | 视角角度（0–45°），`0` = 完全垂直，缺省 `22` |
| `staffBar` | `'full' \| 'hint' \| 'off'` | 横向琴谱条模式，缺省 `hint` |
| `onlineCover` | `boolean` | 是否允许在线随机封面，缺省 `false` |
| `layoutOverrides` | `Record<string, Hole[]>` | 音阶表校对覆盖，按 layoutId 存放 |

- 旧字段 `orientation` 已移除；旧字段 `perspective`（枚举）**升级为 `viewAngle`（数值）**，读取时把旧枚举映射为角度（`off→0` / `weak→22` / `strong→34`）新字段在下一次 savePrefs 时写回；读取时忽略未知字段，缺失字段回落到默认值（向后兼容旧 `prefs.json`）。
- 为避免设置页与主题层互相覆盖，新增 `store/prefs.tsx` 的 `PrefsProvider` / `usePrefs()`，写操作一律走 `updatePrefs(patch)`（读-合并-写），主题与设置页共用同一份状态。

- 曲库索引：`Paths.document + 'library.json'`，当前写入 { version, entries } 包装，entries 为导入曲目元数据；封面映射另存 covers.json。ID 使用原生 MD5 或回退字节哈希，跨平台不能假定哈希算法/ID 一致；未来同步需统一内容身份契约。
- 导入的原始文件复制到 `Paths.document + 'scores/{id}.{ext}'` 保存，重复导入以 `File.md5` 内容哈希去重（哈希命中则不重复写盘）。
- 封面映射实际保存在 `covers.json`，兼容内置与导入曲目；原生本地导入及可选在线封面均可产生缓存字节，Web 不缓存图片字节。`LibraryEntry.coverUri` 是读取映射后合并的字段。
- 内置示例曲随包发布（`assets/songs/*.json`），以 `builtin:` 前缀虚拟成条目，**不复制到文件系统**。
- **缓存现状**：`loadScore` 只有按曲目 ID 的 `Score` 内存缓存；首页与跟吹页仍各自计算 arrange。共享编配缓存尚未实现；若性能证据需要，缓存键必须包含谱面身份、音阶表实际内容（含 overrides）、编配参数与算法版本，不能只用曲目 ID。删除、改谱或改音阶时有明确失效策略。
- **可靠性目标（待实施）**：偏好及索引须校验/迁移；连续写入顺序、失败恢复与损坏数据提示要有测试。当前文件写入不等于原子事务，不把解析失败回空数组当作完整恢复方案。持久化音频须通过 docStore 复制并管理生命周期。
- **`store/docStore.ts` 是唯一存储边界**（`readText / writeText / readBytes / writeBytes` + 路径解析 + `supportsBinaryCache`），上层业务与组件不直接触碰 `expo-file-system` / `localStorage`；Web 端用 `localStorage`、原生端用应用沙盒，同一组 API 内部按平台分派。
- 全部走 expo-file-system 新 API（`File` / `Directory` / `Paths`），不引入 AsyncStorage。

---

## 9. 验证方式

1. **核心逻辑（无 UI）**：`npx tsx scripts/verify-core.ts`，用示例曲与 MusicXML 样本跑 `parse → arrange`，打印 markdown 表格，人工核对音高、时值、孔位、吹吸。**v0.4.0 追加断言**：`core/visual` 的 `resolveFlow` 与 `computeViewGeometry` 在边界输入（`viewAngle=0`、`viewAngle=45`、`k=1`）下**必须返回有限值**（不发散、不为 NaN），因为它们是纯函数，最适合在此层兜底。
2. **构建自检**：`npx tsc --noEmit`（类型）→ `npx expo-doctor`（依赖与配置）→ `npx expo export --platform android`（Metro 能解析全部依赖并打包）。
3. **端到端**：`npx expo start` → Expo Go：
   - 首页点内置示例曲 → 跟吹页方块随时间平滑流入判定线（默认**从上到下**）、长度随时值变化、音阶标注正确；
   - 切**皮肤**（白线 / 彩色）与深浅模式、切主色、切**透明度**，确认整屏即时更新，且不打断当前滚动位置；
   - 调**视角**（预设 垂直 / 弱 / 强 + 高级滑块 0–45°），确认 `0°` 完全垂直、角度越大越斜、远端不露空白；
   - 切**落块方向**（从上到下 / 从左到右），确认判定线位置、音阶标注位置、渐变方向随之切换；
   - 切**横向琴谱**（完整 / 精简提示条 / 关闭），确认三种模式显示正确；
   - 播放时确认方块压线触发**命中高亮**（音块 + 判定线段 + 音阶标注同步）与**触碰特效**，且**不影响帧率**；
   - 开关"**在线随机封面**"：开启后确认拉取并**缓存到本地**；断网重启确认读到缓存、离线自动回退到本地 / 占位封面；
   - 导入 `.json` / `.abc` / `.musicxml`，确认自动解析并标记不可吹音；
   - 切换三种预设，确认孔位与吹吸映射随之变化；
   - 设置页改音阶表并保存，返回跟吹页确认指法即时重排。
4. **长曲性能**：3 分钟以上曲目滚动无卡顿，验证窗口化与 UI 线程动画生效。
5. **音阶表校对**：用实体琴逐孔核对默认预设，不符处经设置页修正后再次验证编配结果。
6. **出包验证**：`npx eas-cli@latest build -p android --profile preview` 云端出 APK，安装到真机确认可运行（本地无需 JDK）。完整方案见 §11。

### 9.1 视觉状态验证矩阵（v0.4.0 新增）

与 UI_DESIGN §6、ACCEPTANCE T1-7～10 联合执行。每条结果标记设备、尺寸、系统、构建版本、皮肤及字体缩放；单一 V9 组合不能证明所有组合安全。可读性/动作误辨是阻塞项，风格偏好由用户选择。新验收项目前未验证。

视觉项是**多个正交维度**（方向 × 视角 × 皮肤 × 深浅 × 透明度 × 琴谱 × 封面），全组合是 3×N×2×3×3×3×2，穷举不现实。因此**不做全组合**，只验证「**每个维度单独切换不破**」+「**一组极端组合不破**」，共 10 项：

| # | 维度 | 取值 | 判定标准 |
|---|---|---|---|
| V1 | 方向 | `down` / `right` / `auto`（竖屏 / 横屏各一次） | 判定线、音阶标注、渐变方向、平移轴均正确；切换不打断 `positionMs` |
| V2 | 视角 | `0°` / `22°` / `34°` / `45°` | `0°` 完全垂直无透视；其余远端不露空白、无 NaN、不卡顿 |
| V3 | 皮肤 | `mono` / `color` | 白线皮肤线条为细白线、音块为亮/空心；彩色皮肤吹暖吸冷；几何布局不变 |
| V4 | 深浅 | `light` / `dark` / `system` | 两套皮肤在两种深浅下都清晰可读，线条与文字对比达标 |
| V5 | 透明度 | `solid` / `soft` / `glass` | `glass` 能透见背景线条；**命中判定不受透明度影响** |
| V6 | 琴谱 | `full` / `hint` / `off` | 三种模式渲染正确；`full` 随 `positionMs` 高亮当前音 |
| V7 | 封面 | 内置 / 本地 / 在线开 / 在线关 / 离线 | 优先级正确、离线自动回退；**Web 端不写字节缓存**（`localStorage` 不膨胀） |
| V8 | 命中高亮 | 播放中压线 | 音块 + 判定线段 + 音阶标注同步高亮并回落；**JS 线程无重渲染**（不 `setState` 于动画路径） |
| V9 | 极端组合 | `right` + `45°` + `mono` + `dark` + `glass` + `full` | 仍可读、不崩、不掉帧（这是最容易出问题的一格） |
| V10 | 长曲 | 3 分钟以上曲目 + 各维度切换 | 滚动连续无跳动，剔除节点数 < 40，帧率稳定 |

> 每轮改动只跑「受影响维度 + V9 + V10」；发版前跑全表。

---

## 10. 目录结构

```
src/app/                  _layout.tsx · index.tsx · practice/[id].tsx · settings.tsx
src/core/                 model.ts · pitch.ts · arrange.ts · text.ts（UTF-8 / 字节解码）
src/core/layouts/         tremolo24C.ts · diatonic10C.ts · chromatic12C.ts · index.ts   ← 口琴音阶预设
src/core/parsers/         json.ts · abc.ts · musicxml.ts · index.ts
src/core/visual/          params.ts（视觉常量）· flow.ts（方向接口 + 几何纯函数）      ← v0.4.0 新增，零 RN 依赖
src/player/               timing.ts · usePlayback.ts · timeSource.ts（音频时钟）
src/theme/                color.ts · palette.ts · skin.ts · tokens.ts · ThemeProvider.tsx
src/ui/                   NoteTimeline.tsx（双向单视图）· StaffBar.tsx（横向琴谱）· TransportBar.tsx（播放控件）
src/ui/components/        Icon.tsx · Card.tsx · Button.tsx · Badge.tsx · IconTile.tsx · SegmentedControl.tsx · Slider.tsx · Row.tsx · HarmonicaMark.tsx · SongCover.tsx · index.ts
src/ui/effects/           types.ts · registry.ts · pulse.tsx
src/store/                docStore.ts（唯一存储边界）· library.ts · prefs.tsx · coverCache.ts
assets/songs/             内置示例曲 JSON
assets/covers/            可选内置封面
scripts/verify-core.ts    核心逻辑验证脚本（含 core/visual 边界断言）
eas.json                  EAS 构建 profile（development / preview / production）
docs/                     PRD.md · TECH_DESIGN.md · ARCHITECTURE.md · AI_SCORING.md
```

> **目录演进**：第二个独立消费者确需共享包时才按职责抽取，core/visual 保持单一来源；RN 组件按 Web 适配效果复用，不提前禁止。存储接口与平台实现分别处理，不机械平移整层。见 [ARCHITECTURE.md](./ARCHITECTURE.md) §3.3。

---

## 11. 构建与部署方案

### 11.1 目标与约束

- **交付形态**：安装到 Android 手机的独立 App（不依赖 Expo Go）。
- **本机不装 Java**：RN 打 Android 包必然经过 Gradle/AGP（运行在 JVM 上），换 Python/Go 重写等于废弃现有代码；因此**一律走 EAS 云端构建**，本地只保留 Expo Go 联调。
- **原生工程不入库**：`android/` `ios/` 由 CNG 在云端生成，本地不创建、不手改，原生行为只改 `app.json` 与 config plugin。
- **iOS 不在当前范围**：需要 Apple 开发者账号（付费）与证书，待 Android 流程跑通后再评估。

### 11.2 构建档位（`eas.json`）

| profile | 用途 | 分发 | 产物 | 关键配置 |
|---|---|---|---|---|
| `development` | 本地开发客户端（含 dev menu、热重载） | `internal` | .apk | `developmentClient: true` |
| `preview` | 真机自测 / 内测分发 | `internal` | **.apk**（可直接安装） | `android.buildType: "apk"` |
| `production` | 上架 Google Play | `store` | **.aab** | `android.buildType: "app-bundle"` |

> AAB 是 Google Play 要求的格式，**不能直接安装到设备**；要装到手机必须出 APK（`preview`），或连数据线用 `eas build:run`。

### 11.3 首次接入（一次性）

```bash
# 1. 注册 Expo 账号（免费计划即可，https://expo.dev/signup）
# 2. 登录
npx eas-cli@latest login
# 3. 在项目根执行，把项目绑定到 EAS（会向 app.json 写入 extra.eas.projectId）
npx eas-cli@latest init
```

- `eas init` 会改动 `app.json`，属于需要提交的变更。
- 首次构建时 EAS 会询问 Android 签名密钥（keystore）：选 **Generate new keystore**，由 EAS 远端托管；后续所有构建复用同一签名，才能覆盖安装。

### 11.4 出包与安装

```bash
# 真机自测 APK
npx eas-cli@latest build -p android --profile preview
# 构建完成后：把构建详情页的 APK 链接发到手机下载安装（需允许「安装未知来源应用」）
# 或连数据线直接装：
npx eas-cli@latest build:run -p android

# 上架用 AAB
npx eas-cli@latest build -p android --profile production
```

- 日常联调仍然用 Expo Go：`npx expo start` 后扫码（不产出安装包，仅验证交互与视觉）。
- 构建在 Expo 服务器上进行，本地只需网络；免费计划有月度额度与排队，正式发包建议避开高峰。

### 11.5 版本与标识管理

| 项 | 位置 | 说明 |
|---|---|---|
| `version` | `app.json` | 用户可见版本（语义化），当前 `0.2.0`；发版前递增 |
| `android.versionCode` | `app.json` | Google Play 要求**每次上架必须递增**的整数 |
| `android.package` | `app.json` | `com.harmonicaflow.app`；**上架后不可更改** |
| 签名密钥 | EAS 远端 | `npx eas-cli@latest credentials` 查看/导出 |

- 版本递增目前采用**手动**方式（改 `app.json` → 提交 → 出包），零额外配置。
- 若后续发版频繁，可升级为自动递增：给 `production` profile 加 `autoIncrement: true`，并在 `eas.json` 的 `cli` 里设 `appVersionSource` 决定版本号由本地 `app.json` 还是 EAS 托管。

### 11.6 后续可选：OTA 热更新（EAS Update）

仅 JS/资源变更时，可不重新出包直接推送更新（原生依赖变化仍需重新构建）：

```bash
npx expo install expo-updates
npx eas-cli@latest update:configure   # 写入 runtimeVersion / updates.url / extra.eas.projectId，
                                      # 并自动给 eas.json 的 preview / production 档位补上 channel
npx eas-cli@latest build -p android --profile preview   # channel 是打进包里的，必须重新出一次包
# 发布（SDK 55 起 --environment 为必填）
npx eas-cli@latest update --channel preview --message "修复跟吹页..." --environment preview
```

- 前提：`expo-updates` 与 `runtimeVersion` 已配置，且客户端构建时带上了对应 `channel`；**旧包（未带 channel）收不到更新，需重装一次**。
- 生效方式：更新在启动时后台下载，重启 App（最多两次）后应用。
- 约束：改的是原生代码或新增原生模块时，**必须**重新 `eas build`，OTA 无法生效。
- 回滚：在 EAS 的 Updates 列表选历史版本重新发布，或参考 `npx eas-cli@latest update:republish --help`。
- 分渠道验证：先推 `preview` 确认无误，再推 `production`。
- 面向使用者的操作步骤见 [README §6](../README.md)。

### 11.7 CI 与自动部署（已接入）

三条 GitHub Actions 工作流（`.github/workflows/`）：

| 文件 | 触发 | 作用 |
|---|---|---|
| `ci.yml` | push / PR | 代码检查（`tsc --noEmit` / `npm run verify` / lint） |
| `eas-build.yml` | 手动或打 tag | 云端出 Android 包（用 `EXPO_TOKEN` 免交互登录，`eas build --non-interactive --no-wait`） |
| `deploy-web.yml` | push 到主分支 | 构建 Web 版并部署到 GitHub Pages |

- 一次性配置：GitHub Secrets 加 **`EXPO_TOKEN`**（名称只能含字母/数字/下划线，且与工作流里的 `secrets.EXPO_TOKEN` 完全一致）、本地跑一次 `eas-cli login` + `eas init` 绑定 EAS 项目、Pages 的 Source 选 **GitHub Actions**。
- Web 当前有存储容量与布局适配问题记录，尚未作为完整产品验收；零高度不是永久浏览器限制。未来 Web 单独验证，不能替代 Android 真机结果（见 [README](../README.md)）。

### 11.8 发布检查清单

1. `npx tsc --noEmit` / `npm run lint` / `npm run verify` / `npx expo-doctor` 全绿（见 §9）。
2. `app.json` 的 `version` 与 `android.versionCode` 已递增。
3. Expo Go 真机联调通过（§9 的真机步骤与 §9.1 验证矩阵），确认**落块（`down` / `right` / `auto`）、视角（垂直↔斜视）、皮肤 / 透明度、命中高亮、横向琴谱、封面（含离线回退）、触碰特效、主题切换**均正常。
4. 出 `preview` APK，装到目标机型复验（Expo Go 与独立包的原生模块行为可能不同）。
5. 仅在决定商店发布时出 `production` AAB 并按商店流程提交；个人使用的 preview APK 交付不要求上架。
6. 若启用了 OTA，确认 `channel` 与 `runtimeVersion` 匹配后再推更新。

---

## 12. 扩展点（本版不实现，为后端 / 播放器 / Agent 留位）

当前版本**纯本地、无后端、无账号**。为让后期接入不返工，本版只保证三处接缝干净——**但不在本版写空实现**（避免无谓代码），只在架构与目录上留位，等真正接入时再按接口新增文件。

### 12.1 存储接缝（后端 / 云同步）

- `store/docStore.ts` 是**唯一**读写入口，`library.ts` / `prefs.tsx` / `coverCache.ts` 都经它读写。
- 后期同步另设编排层，复用本地仓储与独立远端适配器，处理身份、队列、版本、冲突与删除。docStore 保持本地 I/O；页面按需展示状态，不承诺零改动。
- 只有第二个独立消费者需要共享包时才拆接口与平台实现，见 [ARCHITECTURE.md](./ARCHITECTURE.md) §3。

### 12.2 时序接缝（音乐播放器 / 导入本地音乐）

- `usePlayback` 用**本地计时器**（Reanimated `withTiming`）驱动 `positionMs`，这是**默认且唯一**的时钟（无伴奏时）。
- **T3 已落地**：接入 `expo-audio` 后，`player/timeSource.ts` 提供 `createAudioClock(player, leadInMs)`——把音频进度换算回时间轴坐标，并收口 `play/pause/seek/变速`；`usePlayback` 通过可选参数 `audioUri` 在「本地时钟」与「音频时钟」之间切换（见 §7.2）。时间轴坐标约定为 **音频 0s ↔ `LEAD_IN_MS`**。
  - 说明：本地计时器**仍保留 `withTiming` 形态**（UI 线程插值），未改造成 pull 式的 `TimeSource` 实现——因为那样会把无伴奏（当前默认路径）的平滑性降级为轮询。音频时钟以「周期校准」的方式成为权威：目标是兼顾平滑与同步，仍需真机验证。
- **⚠️ 接缝不是"零成本"（v0.4.0 修正，v0.5.0 落地）**：`positionMs` 是 **UI 线程上的 Reanimated 共享值**，而音频播放器的进度来自**原生侧**，两者**不在同一线程、也不能直接赋值**，必须补一段**桥接**。T3 采用的方案是**周期校准**（而非逐帧写回）：
  - 本地 `withTiming` 继续在 UI 线程插值（目标为平滑滚动，帧率需实测），JS 侧每 300ms 读一次 `player.currentTime`，偏差超 80ms 才重锚 `positionMs`。
  - 之所以不逐帧写回：`withTiming` 已在 UI 线程平滑推进，逐帧写反而会引入 JS 定时器的抖动，且每帧跨线程写共享值更耗电；周期校准是当前实现选择，不能据此宣称已满足「不抖动」与「不漂移」。
  - 结论：**消费侧（时间轴 / 特效 / 命中高亮）确实不用改**，因为它们只读 `positionMs`；改的是**供给侧的桥接**——这正是"换音频源"的真实工作量。
- 持久伴奏需通过 docStore 复制到持久目录、记录绑定及资源所有权，并处理替换/删除/失败恢复，不能只保存临时 URI。音频起点与谱面起点、BPM 必须匹配；自动内容对齐未实现，周期校时仅处理时钟漂移。

### 12.3 外部能力接缝（Agent / AI 点评）

- 页面层**不直接 `fetch`**；真实外部能力任务启动后新增必要 service，先定义错误、取消、超时与降级契约，不提前创建空跑实现。
- AI 点评方案（录音 → 音高检测 → 评分 → LLM 点评）与统一提示词见 [AI_SCORING.md](./AI_SCORING.md)；**AI 的 API key 由用户自行配置**，与后端解耦。
