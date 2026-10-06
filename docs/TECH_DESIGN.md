# 口琴跟吹助手 HarmonicaFlow — 技术方案

- 版本：v0.2.0
- 日期：2026-10-06
- 关联文档：[PRD.md](./PRD.md)

> v0.2.0 变更摘要：新增 `theme/`（深浅双色板 + 主色派生 + ThemeProvider）；`store/` 引入 `PrefsProvider`（`updatePrefs` 读-合并-写）；`NoteTimeline` **只保留纵向**并新增透视、底部简谱标注、触碰触发的 `ui/effects/` 特效注册表；单词偏好删除 `orientation`，新增 `themeMode / accent / perspective`；出包改走 **EAS 云端构建**（本地不需要 JDK）。

---

## 1. 架构总览

```
┌──────────────────────────────────────────────┐
│ src/app/      页面层（Expo Router）           │
│   index / practice/[id] / settings            │
├──────────────────────────────────────────────┤
│ theme/        主题层（色板 + Provider）        │
│   palette / color / ThemeProvider             │
├──────────────────────────────────────────────┤
│ ui/           展示组件（无业务逻辑）           │
│   NoteTimeline / TransportBar / effects/      │
├──────────────────────────────────────────────┤
│ player/       时序与播放状态机                 │
│   timing / usePlayback                        │
├──────────────────────────────────────────────┤
│ store/        持久化（expo-file-system）       │
│   library / prefs（Provider）                  │
├──────────────────────────────────────────────┤
│ core/         纯 TS，零 UI 依赖，可 Node 验证  │
│   parsers/  →  Score                          │
│   arrange   →  TabNote[]                      │
│   pitch     →  音名 / MIDI / 简谱              │
│   layouts/  →  音阶预设数据                    │
└──────────────────────────────────────────────┘
```

关键边界：`core/` 不 import 任何 React / RN / Expo 模块，因此可以脱离设备用 Node 脚本验证解析、编配与简谱转换的正确性。

数据流：

```
文件字节 ──parsers──▶ Score(NoteEvent[]) ──arrange──▶ TabNote[] ──ui──▶ 音块时间轴
                                                     ▲                        │
                                        HarmonicaLayout(预设, 可编辑)          │ 触碰判定线
                                                                              ▼
                                                              effects/ 按列播放特效
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
> v0.2.0 未新增运行时依赖：主题、透视、特效、简谱均为纯 JS/TS 实现。

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

### 7.3 时间轴渲染（`ui/NoteTimeline.tsx`，纵向单视图）

- 用一个 `Animated.View` 包裹整块 `<Svg>` 承载整体平移（而非动画 SVG 内部的 `<G>`，以规避 SVG 内部 transform 动画的兼容风险）；**只有 1 个动画节点**，滚动在 UI 线程完成，不触发 React 重渲染。
- **窗口化**：`useAnimatedReaction` 监听 `positionMs`，每 500ms 通过 `runOnJS` 回传一次锚点，JS 侧重算可视音块集合（约 ±1 屏），控制节点数 < 40。
- 坐标（纵向，`PX_PER_SEC_V = 160`）：

  ```
  h      = max(durationMs * pxPerMs, MIN_BLOCK_PX)
  bottom = ahead - (startMs + LEAD_IN_MS - anchorMs) * pxPerMs
  y      = bottom - h
  x      = (hole - 1) * rowSize
  ```

  方块自上而下流入的组合位移由 `translateY = playhead - ahead + delta` 统一驱动。
- 配色统一取主题色板（`theme/`）：吹 = 暖色、吸 = 冷色、推键为对应亮色，不可吹 = 弱化描边；不再在组件内硬编码色值。
- 判定线：位于 `playhead = height - LABEL_AREA_H`（底部留出 42px 简谱标注区），颜色取 `theme.playhead`。
- 判定线上方的可视区单独用一个带 `overflow: hidden` 的容器包裹，方块越过判定线后即被裁掉，形成"压线即命中"的观感。

### 7.4 纵向透视（近大远小）

SVG 仅支持 2D 仿射，做不了真透视；因此把透视施加在**包裹 Svg 的容器**上：

```
transform: [{ perspective: P }, { rotateX: 'θ' }]
transformOrigin: '50% 100%'
```

- 以判定线为原点旋转（透视容器的高度即判定线上方的可视区，`transformOrigin: '50% 100%'` 锚在其底边），判定线保持不动、越往上越"后退"，形成近大远小。
- 强度做成设置项 `perspective: 'off' | 'weak' | 'strong'`（默认 `weak`），映射到两组参数（`weak` = perspective 1200 / rotateX 14deg，`strong` = 700 / 26deg），便于真机微调。
- 已知代价：块内文字会随容器一起倾斜（属可接受的视觉风格）；如后续需要文字始终保持正视，可改为对每列单独做 2D 梯形缩放。
- 该变换只作用于展示容器，不影响时序与命中计算（判定线仍按未变换坐标计算）。

### 7.5 触碰特效（`ui/effects/`）

- **触发**：纵向判定线对应 `note.startMs`。以 `useAnimatedReaction` 监听 `positionMs` 越过各接触时刻（跨桶判断），`runOnJS` 触发一次特效实例。
- **渲染**：特效实例记录 `{ id, hole, action, color }`，在判定线该列中心渲染，约 320ms 后由实例自己回调 `onDone(id)` 移除；不阻塞主时间轴动画。
- **可插拔**：`effects/types.ts` 定义 `TimelineEffect` 接口（`name` / `durationMs` / `render(ctx)`），`effects/registry.ts` 维护注册表，`effects/pulse.tsx` 为默认"脉冲环"。以后新增特效只需注册新实现，不改动 `NoteTimeline`。
- 触发加了防刷量：单次前进跨越的音符数超过 `MAX_BURST = 8` 视为拖动进度，只推进游标不补发特效。
- 颜色取该音所在 `action` 的主题色，与音块保持一致。

### 7.6 底部简谱标注

- `core/pitch.ts` 新增 `midiToJianpu(midi, tonicPc)`：返回音级 `1-7`、变音记号（非音阶级统一用 `#` 记法，如 C 调 C#4 = `#1`）、相对基准八度的偏移；`formatJianpu` 把偏移渲染为小圆点（高八度后置 `1·`、低八度前置 `·1`）。
- 主音由 `keySignatureToTonicPc(score.keySignature)` 解析（缺省 C）；基准八度取中央 C 附近的主音。
- 时间轴底部按孔列显示该孔 **吹 / 吸** 两个简谱度数，并标出孔号，供用户对照实体琴（半音阶的推键音同孔同列，不重复标注）。

### 7.7 主题系统（`theme/`）

- `theme/color.ts`：无依赖的 HSL 工具（hex/rgb/hsl 互转、明度调整、透明度、相对亮度、可读前景色），负责按主色 `accent` 派生深浅两套变体。
- `theme/palette.ts`：色板键 `background / surface / surfaceAlt / text / textMuted / border / placeholder / accent / accentSoft / onAccent / blow / blowPush / draw / drawPush / infeasible / infeasibleBorder / infeasibleText / playhead / success / danger / warningBg / warningText`；由 `buildPalette(scheme, accent)` 生成，另导出 `ACCENT_PRESETS` 供设置页选集。
- 吹/吸为**语义色**（暖/冷），与主色解耦，保证"吹吸一眼可辨"；深色下主色与吸音色会自动提亮，保证对比度。
- `theme/ThemeProvider.tsx`：从 `usePrefs()` 读取 `themeMode` 与 `accent`，经 `useColorScheme()` 解析出最终 `scheme`，`useMemo` 生成色板并通过 Context 下发；对外暴露 `useTheme()` 返回 `{ scheme, colors }`。
- 全部组件样式中的硬编码色值改为从 `useTheme()` 取值；静态 `StyleSheet` 只保留尺寸/布局。
- 切换深浅或改主色即时生效（Context 驱动重渲染），无需重启。

---

## 8. 持久化（`store/library.ts`）

用户偏好：`prefs.json`

| 字段 | 类型 | 说明 |
|---|---|---|
| `layoutId` | `string` | 当前口琴预设 |
| `speed` | `number` | 播放倍速（0.5 / 0.75 / 1） |
| `themeMode` | `'system' \| 'light' \| 'dark'` | 主题模式 |
| `accent` | `string` | 主色（hex），缺省为品牌蓝 |
| `perspective` | `'off' \| 'weak' \| 'strong'` | 纵向透视强度 |
| `layoutOverrides` | `Record<string, Hole[]>` | 音阶表校对覆盖，按 layoutId 存放 |

- 旧字段 `orientation` 已移除；读取时忽略未知字段，缺失字段回落到默认值（向后兼容旧 `prefs.json`）。
- 为避免设置页与主题层互相覆盖，新增 `store/prefs.tsx` 的 `PrefsProvider` / `usePrefs()`，写操作一律走 `updatePrefs(patch)`（读-合并-写），主题与设置页共用同一份状态。

- 曲库索引：`Paths.document + 'library.json'`，存 `LibraryEntry[] = { id, title, source, origin, fileName, noteCount, importedAt }`。
- 导入的原始文件复制到 `Paths.document + 'scores/{id}.{ext}'` 保存，重复导入以 `File.md5` 内容哈希去重（哈希命中则不重复写盘）。
- 内置示例曲随包发布（`assets/songs/*.json`），以 `builtin:` 前缀虚拟成条目，**不复制到文件系统**；`arrange` 统计在首页后台分帧计算，不落盘。
- 全部走 expo-file-system 新 API（`File` / `Directory` / `Paths`），不引入 AsyncStorage。

---

## 9. 验证方式

1. **核心逻辑（无 UI）**：`npx tsx scripts/verify-core.ts`，用示例曲与 MusicXML 样本跑 `parse → arrange`，打印 markdown 表格，人工核对音高、时值、孔位、吹吸。
2. **构建自检**：`npx tsc --noEmit`（类型）→ `npx expo-doctor`（依赖与配置）→ `npx expo export --platform android`（Metro 能解析全部依赖并打包）。
3. **端到端**：`npx expo start` → Expo Go：
   - 首页点内置示例曲 → 跟吹页方块随时间平滑下落、长度随时值变化、底部简谱标注正确；
   - 切换主题（跟随系统/浅/深）与主色，确认整屏配色即时更新；
   - 切换透视强度（关/弱/强），确认真机观感并选定默认值；
   - 播放时确认方块触碰判定线触发特效，且不影响帧率；
   - 导入 `.json` / `.abc` / `.musicxml`，确认自动解析并标记不可吹音；
   - 切换三种预设，确认孔位与吹吸映射随之变化；
   - 设置页改音阶表并保存，返回跟吹页确认指法即时重排。
4. **长曲性能**：3 分钟以上曲目滚动无卡顿，验证窗口化与 UI 线程动画生效。
5. **音阶表校对**：用实体琴逐孔核对默认预设，不符处经设置页修正后再次验证编配结果。
6. **出包验证**：`npx eas-cli@latest build -p android --profile preview` 云端出 APK，安装到真机确认可运行（本地无需 JDK）。完整方案见 §11。

---

## 10. 目录结构

```
src/app/                  _layout.tsx · index.tsx · practice/[id].tsx · settings.tsx
src/core/                 model.ts · pitch.ts · arrange.ts
src/core/layouts/         tremolo24C.ts · diatonic10C.ts · chromatic12C.ts · index.ts
src/core/parsers/         json.ts · abc.ts · musicxml.ts · index.ts
src/player/               timing.ts · usePlayback.ts
src/theme/                color.ts · palette.ts · ThemeProvider.tsx
src/ui/                   NoteTimeline.tsx · TransportBar.tsx
src/ui/effects/           types.ts · registry.ts · pulse.tsx
src/store/                library.ts · prefs.tsx
assets/songs/             内置示例曲 JSON
scripts/verify-core.ts    核心逻辑验证脚本
eas.json                  EAS 构建 profile（development / preview / production）
docs/                     PRD.md · TECH_DESIGN.md
```

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
npx eas-cli@latest update:configure   # 写入 runtimeVersion / updates.url / extra.eas.projectId
# 在 eas.json 的 preview / production profile 上各加一个 channel 字段
npx eas-cli@latest update --branch production --message "修复跟吹页..."
```

- 前提：`expo-updates` 与 `runtimeVersion` 已配置，且客户端构建时带上了对应 `channel`。
- 约束：改的是原生代码或新增原生模块时，**必须**重新 `eas build`，OTA 无法生效。

### 11.7 后续可选：CI 自动出包

用 `expo/expo-github-action` + `EXPO_TOKEN` 免交互登录，在打 tag 时自动执行 `eas build --non-interactive --no-wait`。当前项目规模暂不需要，先保持手动出包。

### 11.8 发布检查清单

1. `npx tsc --noEmit` / `npm run verify` / `npx expo-doctor` 全绿（见 §9）。
2. `app.json` 的 `version` 与 `android.versionCode` 已递增。
3. Expo Go 真机联调通过（§9.3），确认方块下落、透视、简谱、触碰特效、主题切换均正常。
4. 出 `preview` APK，装到目标机型复验（Expo Go 与独立包的原生模块行为可能不同）。
5. 出 `production` AAB；上架执行 `npx eas-cli@latest submit -p android --profile production`（需 Google Play 服务账号 JSON）。
6. 若启用了 OTA，确认 `channel` 与 `runtimeVersion` 匹配后再推更新。
