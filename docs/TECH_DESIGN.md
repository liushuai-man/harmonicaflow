# 口琴跟吹助手 HarmonicaFlow — 技术方案

- 版本：v0.1.0
- 日期：2026-10-05
- 关联文档：[PRD.md](./PRD.md)

---

## 1. 架构总览

```
┌──────────────────────────────────────────────┐
│ src/app/      页面层（Expo Router）           │
│   index / practice/[id] / settings            │
├──────────────────────────────────────────────┤
│ ui/           展示组件（无业务逻辑）           │
│   NoteTimeline / TransportBar                 │
├──────────────────────────────────────────────┤
│ player/       时序与播放状态机                 │
│   timing / usePlayback                        │
├──────────────────────────────────────────────┤
│ store/        持久化（expo-file-system）       │
├──────────────────────────────────────────────┤
│ core/         纯 TS，零 UI 依赖，可 Node 验证  │
│   parsers/  →  Score                          │
│   arrange   →  TabNote[]                      │
│   layouts/  →  音阶预设数据                    │
└──────────────────────────────────────────────┘
```

关键边界：`core/` 不 import 任何 React / RN / Expo 模块，因此可以脱离设备用 Node 脚本验证解析与编配的正确性。

数据流：

```
文件字节 ──parsers──▶ Score(NoteEvent[]) ──arrange──▶ TabNote[] ──ui──▶ 音块时间轴
                                                     ▲
                                        HarmonicaLayout(预设, 可编辑)
```

---

## 2. 依赖清单（运行时共 7 项）

| 依赖 | 版本策略 | 用途 |
|---|---|---|
| `expo` | SDK 最新稳定 | 框架 |
| `expo-router` | 随 SDK | 路由 |
| `react-native-reanimated` | Expo 内置 | UI 线程动画（时间轴平移） |
| `react-native-worklets` | 随 reanimated 4（0.10.x） | reanimated 4 的必需 peer 依赖，提供 worklet 运行时与 babel 插件 |
| `react-native-svg` | Expo 内置 | 绘制音块 |
| `expo-document-picker` | 随 SDK | 选择乐谱文件 |
| `expo-file-system` | 随 SDK | 读文件 + 曲库持久化 |
| `fast-xml-parser` + `fflate` | 纯 JS / MIT | MusicXML 解析、.mxl 解压 |

> 音名与 MIDI 互转自行实现（12 半音表），不引入 `@tonaljs/*`。
> 全部依赖均可在 **Expo Go** 中运行，无需自定义原生构建。

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

> 只取**单一声部**（melody）：默认取第一个 `part`；同一 `start` 上出现和弦时，保留最高音（口琴单音吹奏），其余丢弃并在解析报告中计数。

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

### 7.2 播放状态机（`player/usePlayback.ts`）

- 以 Reanimated 共享值 `positionMs` 承载播放位置，`play()` 用 `withTiming(totalMs, { duration: (totalMs - from)/speed, easing: linear })` 驱动，暂停时 `cancelAnimation` 并从当前值续播。
- 对外暴露：`positionMs / isPlaying / speed / play / pause / restart / seek(ms) / setSpeed(x)`；倍速档位 `SPEED_OPTIONS = [0.5, 0.75, 1]`。

### 7.3 时间轴渲染（`ui/NoteTimeline.tsx`）

- 用一个 `Animated.View` 包裹整块 `<Svg>` 承载整体平移（而非动画 SVG 内部的 `<G>`，以规避 SVG 内部 transform 动画的兼容风险）；**只有 1 个动画节点**，滚动在 UI 线程完成，不触发 React 重渲染。
- **窗口化**：`useAnimatedReaction` 监听 `positionMs`，每 500ms 通过 `runOnJS` 回传一次锚点，JS 侧重算可视音块集合（约 ±1 屏），控制节点数 < 40。
- 坐标（横向，`PX_PER_SEC_H = 90`）：

  ```
  x = playhead + (startMs + LEAD_IN_MS - anchorMs) * pxPerMs
  w = max(durationMs * pxPerMs, MIN_BLOCK_PX)
  y = (holeCount - hole) * rowSize
  ```

  纵向（`PX_PER_SEC_V = 160`）交换语义：`h` 由时值决定，`x = (hole - 1) * rowSize`，方块自下向上流入演奏线。
- 配色：吹 = 暖色（橙 `#F2994A`），吸 = 冷色（蓝 `#2F80ED`），推键为对应亮色，不可吹 = 灰色虚线描边并计入顶部提示。
- 行序（横向）：孔号小者在下、大者在上，符合"从低音孔到高音孔由下往上"的直觉。

---

## 8. 持久化（`store/library.ts`）

- 曲库索引：`Paths.document + 'library.json'`，存 `LibraryEntry[] = { id, title, source, origin, fileName, noteCount, importedAt }`。
- 导入的原始文件复制到 `Paths.document + 'scores/{id}.{ext}'` 保存，重复导入以 `File.md5` 内容哈希去重（哈希命中则不重复写盘）。
- 用户偏好：`prefs.json`，含 `layoutId / orientation / speed / layoutOverrides`（音阶表校对覆盖，按 layoutId 存放）。
- 内置示例曲随包发布（`assets/songs/*.json`），以 `builtin:` 前缀虚拟成条目，**不复制到文件系统**；`arrange` 统计在首页后台分帧计算，不落盘。
- 全部走 expo-file-system 新 API（`File` / `Directory` / `Paths`），不引入 AsyncStorage。

---

## 9. 验证方式

1. **核心逻辑（无 UI）**：`npx tsx scripts/verify-core.ts`，用示例曲与 MusicXML 样本跑 `parse → arrange`，打印 markdown 表格，人工核对音高、时值、孔位、吹吸。
2. **构建自检**：`npx tsc --noEmit`（类型）→ `npx expo-doctor`（依赖与配置）→ `npx expo export --platform android`（Metro 能解析全部依赖并打包）。
3. **端到端**：`npx expo start` → Expo Go：
   - 首页点内置示例曲 → 跟吹页方块随时间平滑移动、长度随时值变化、横/纵切换正常；
   - 导入 `.json` / `.abc` / `.musicxml`，确认自动解析并标记不可吹音；
   - 切换三种预设，确认孔位与吹吸映射随之变化；
   - 设置页改音阶表并保存，返回跟吹页确认指法即时重排。
4. **长曲性能**：3 分钟以上曲目滚动无卡顿，验证窗口化与 UI 线程动画生效。
5. **音阶表校对**：用实体琴逐孔核对默认预设，不符处经设置页修正后再次验证编配结果。

---

## 10. 目录结构

```
src/app/                  _layout.tsx · index.tsx · practice/[id].tsx · settings.tsx
src/core/                 model.ts · pitch.ts · arrange.ts
src/core/layouts/         tremolo24C.ts · diatonic10C.ts · chromatic12C.ts · index.ts
src/core/parsers/         json.ts · abc.ts · musicxml.ts · index.ts
src/player/               timing.ts · usePlayback.ts
src/ui/                   NoteTimeline.tsx · TransportBar.tsx
src/store/                library.ts
assets/songs/             内置示例曲 JSON
scripts/verify-core.ts    核心逻辑验证脚本
docs/                     PRD.md · TECH_DESIGN.md
```
