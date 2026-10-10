/**
 * 集中式视觉参数（见 docs/TECH_DESIGN.md §7.11）
 *
 * 纯常量，**零依赖**——不 import React / RN / Expo。放 core 才能被 Node 脚本直接断言，
 * 也才能被 PC / Web 端零改动复用，保证多端视觉一致。
 *
 * 约定：
 *   - 这里只放「开发者常量」；「用户可调项」进 Prefs（见 store/library.ts §8）。
 *   - 调观感优先改这里，不要在组件里写魔法数字。
 */

// ── 几何 ────────────────────────────────────────────────
/** 每秒多少像素（时间轴尺度的基准） */
export const PX_PER_SEC = 160;
/** 可视集合重算步长（ms）：越大越省 JS 线程，越小剔除越紧 */
export const WINDOW_STEP_MS = 500;
/** 最短音块像素，避免极短音符看不见 */
export const MIN_BLOCK_PX = 8;
/** 列内音块与边框的间距 */
export const BLOCK_GAP = 3;
/** 判定线下方的简谱标注区高度（down 方向） */
export const LABEL_AREA_H = 42;
/** 判定线右侧的简谱标注区宽度（right 方向） */
export const LABEL_AREA_W = 42;
/** 一次前进跨越的音符数超过该值视为拖动进度：只推游标、不补发特效 */
export const MAX_BURST = 8;
/** 远端降噪阈值：短边小于该值的音块只画主体，避免远场噪点 */
export const NOISE_MIN_PX = 14;
/** 剔除余量（时间，ms）：锚点最多滞后一个重算步长，多留一点避免边缘闪入 */
export const CULL_MARGIN_MS = WINDOW_STEP_MS;
/** 每张 SVG 时间轴分片的逻辑尺寸上限；原生位图另按密度限制物理边长。 */
export const TILE_SIZE = 512;
export const TILE_MAX_PHYSICAL_SIZE = 2048;
export const SETTINGS_TRANSITION_MS = 180;
export const SHATTER_MS = 240;
export const SHATTER_PARTICLES = 5;
export const SHATTER_MAX_INSTANCES = 8;
export const SHATTER_DISTANCE = 18;
export const SHATTER_SIZE = 3;

// ── 视角 ────────────────────────────────────────────────
/** 视角上限（度） */
export const VIEW_ANGLE_MAX = 45;
/** 默认视角（度）；0 = 100% 垂直（无透视） */
export const DEFAULT_VIEW_ANGLE = 22;
/** 小于该角度视为完全垂直，走平铺分支（规避 tanθ → 0） */
export const FLAT_ANGLE_DEG = 1;
/** 视角预设：只是"把角度设到该值"的快捷方式，与高级滑块不冲突 */
export const VIEW_PRESETS = [
  { label: '垂直', degree: 0 },
  { label: '弱', degree: 22 },
  { label: '强', degree: 34 },
] as const;
/** 压缩强度（开发者常量，**不进设置页**）：越小前缩越剧烈 */
export const K_DEFAULT = 1.6;
/** k 下限：`aheadRatio` 含 1/(k−1)，k → 1 会发散，必须夹住 */
export const K_MIN = 1.15;
/** 平铺（θ = 0）时判定线上方预排的屏数 */
export const AHEAD_RATIO_FLAT = 1.2;
/** `aheadRatio` 硬上限，防止极端角度下预排过多节点 */
export const AHEAD_RATIO_MAX = 6;

// ── 交互 / 命中 ─────────────────────────────────────────
/** 命中高亮持续时长（ms），随后自然回落 */
export const HIT_HIGHLIGHT_MS = 200;
/** 控件 hover / press 的统一过渡时长（ms），保证各控件观感一致 */
export const INTERACTION_MS = 120;

// ── 方向 ────────────────────────────────────────────────
/** `auto` 选向的宽高比阈值：width / height ≥ 该值 → 选横向 `right`，否则 `down` */
export const AUTO_FLOW_THRESHOLD = 1;

// ── 横向琴谱条 ──────────────────────────────────────────
/** 琴谱条高度 */
export const STAFF_BAR_H = 38;
/** 琴谱条上每个音符的基准宽度（px/小节感） */
export const STAFF_BAR_PX_PER_SEC = 44;
/** `full` 模式下预排到判定线两侧的音符数上限（避免长曲全量渲染） */
export const STAFF_BAR_WINDOW = 24;
export const NOTATION_HEIGHT = 148;
export const NOTATION_BEAT_WIDTH = 64;
export const NOTATION_STEP = 5;

// ── 用户可选项的类型（值本身进 Prefs，见 store/library.ts §8） ──
/** 皮肤：白线（mono）/ 彩色（color） */
export type SkinMode = 'mono' | 'color';
/** 透明度档位：实心 / 柔和 / 玻璃 */
export type OpacityMode = 'solid' | 'soft' | 'glass';
/** 横向琴谱条：完整谱面 / 判定线附近精简提示 / 关闭 */
export type StaffBarMode = 'full' | 'hint' | 'off';

// ── 默认值（用户可在设置页覆盖） ─────────────────────────
/** 默认皮肤：白线（mono） */
export const DEFAULT_SKIN: SkinMode = 'mono';
/** 默认透明度档位 */
export const DEFAULT_OPACITY: OpacityMode = 'solid';
/** 默认落块方向：自动（按宽高比选向） */
export const DEFAULT_FLOW = 'auto' as const;
/** 默认横向琴谱模式：精简提示条 */
export const DEFAULT_STAFF_BAR: StaffBarMode = 'hint';
/** 默认不拉取在线随机封面（离线优先） */
export const DEFAULT_ONLINE_COVER = false;
