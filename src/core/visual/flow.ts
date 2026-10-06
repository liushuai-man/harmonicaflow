import {
  AHEAD_RATIO_FLAT,
  AHEAD_RATIO_MAX,
  AUTO_FLOW_THRESHOLD,
  BLOCK_GAP,
  FLAT_ANGLE_DEG,
  K_DEFAULT,
  K_MIN,
  LABEL_AREA_H,
  LABEL_AREA_W,
  PX_PER_SEC,
  VIEW_ANGLE_MAX,
} from './params';

/**
 * 方向策略与视角几何（见 docs/TECH_DESIGN.md §7.3 / §7.4 / §7.11）
 *
 * 纯函数 + 纯类型，**零依赖**（不 import React / RN）。`down` / `right` 两个方向
 * 共用同一套坐标公式，只有「哪根轴是时间」与判定线落点不同，故这里用
 * `axis` 与 `rotateAxis` 两个字段代替两份实现。
 */

/** 用户在设置里可选的方向（`auto` 由宽高比解析成具体方向） */
export type FlowSetting = 'down' | 'right' | 'auto';
/** 解析后的具体方向 */
export type FlowDirection = 'down' | 'right';
/** 时间轴平移轴：`down` 用 y，`right` 用 x */
export type FlowAxis = 'y' | 'x';

export interface Viewport {
  width: number;
  height: number;
}

/** 视角变换描述；`null` 表示平铺（不加透视） */
export interface ViewTilt {
  perspective: number;
  axis: 'X' | 'Y';
  degree: number;
}

export interface ViewGeometry {
  /** 具体方向 */
  direction: FlowDirection;
  /** 平移轴 */
  axis: FlowAxis;
  /** 判定线位置（px）：down = height − LABEL_AREA_H，right = width − LABEL_AREA_W */
  playhead: number;
  /** 判定线上方需预排的像素（仅用于剔除，不参与渲染坐标） */
  ahead: number;
  /** 单列尺寸：down 为列宽、right 为行高 */
  rowSize: number;
  /** 沿时间轴的画布总长 */
  songLen: number;
  /** 每毫秒像素 */
  pxPerMs: number;
  /** 透视参数；null = 看垂直 */
  tilt: ViewTilt | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * `auto` 依宽高比选向：宽 / 方 → `right`，窄 → `down`。
 * 视口尺寸未就绪（<= 0）时回落 `down`，避免首帧出现 0 宽度布局。
 */
export function resolveFlow(setting: FlowSetting, viewport: Viewport): FlowDirection {
  if (setting !== 'auto') return setting;
  const { width, height } = viewport;
  if (width <= 0 || height <= 0) return 'down';
  return width / height >= AUTO_FLOW_THRESHOLD ? 'right' : 'down';
}

export interface ViewGeometryInput {
  direction: FlowDirection;
  viewport: Viewport;
  /** 孔列数（决定单列尺寸） */
  laneCount: number;
  /** 视角角度（度），会被夹在 [0, VIEW_ANGLE_MAX] */
  angleDeg: number;
  /** 全曲时长（ms），不含 lead-in */
  totalMs: number;
  /** 起吹留白（ms），由 player/timing 传入，避免 core 反向依赖 player */
  leadInMs: number;
  /** 压缩强度；默认 K_DEFAULT，内部夹在 [K_MIN, +∞) 防发散 */
  k?: number;
}

/**
 * 计算视角与画布几何。
 *
 * 视角公式（详见 §7.4）：
 *   k   = max(k, K_MIN)                       // 防 1/(k−1) 发散
 *   P   = round(k · playhead · tanθ)          // 透视距离按可视尺寸反推
 *   aheadRatio = clamp(k / (cosθ·(k−1)) · 1.1, AHEAD_RATIO_FLAT, AHEAD_RATIO_MAX)
 *
 * 三重保护：`θ < FLAT_ANGLE_DEG` 走平铺分支避开 tan0；`k` 有下限；`aheadRatio` 有上限。
 * 视口或列数未就绪时返回 `null`，调用方跳过渲染。
 */
export function computeViewGeometry(input: ViewGeometryInput): ViewGeometry | null {
  const { direction, viewport, laneCount, angleDeg, totalMs, leadInMs } = input;
  const { width, height } = viewport;
  if (width <= 0 || height <= 0 || laneCount <= 0) return null;

  const horizontal = direction === 'right';
  const k = Math.max(input.k ?? K_DEFAULT, K_MIN);
  const pxPerMs = PX_PER_SEC / 1000;

  const playhead = Math.max((horizontal ? width : height) - (horizontal ? LABEL_AREA_W : LABEL_AREA_H), 1);
  const rowSize = (horizontal ? height : width) / laneCount;
  const angle = clamp(angleDeg, 0, VIEW_ANGLE_MAX);

  let tilt: ViewTilt | null = null;
  let aheadRatio = AHEAD_RATIO_FLAT;

  if (angle >= FLAT_ANGLE_DEG) {
    const rad = (angle * Math.PI) / 180;
    const tan = Math.tan(rad);
    const cos = Math.cos(rad);
    aheadRatio = clamp((k / (cos * (k - 1))) * 1.1, AHEAD_RATIO_FLAT, AHEAD_RATIO_MAX);
    tilt = {
      perspective: Math.round(k * playhead * tan),
      axis: horizontal ? 'Y' : 'X',
      degree: angle,
    };
  }

  return {
    direction,
    axis: horizontal ? 'x' : 'y',
    playhead,
    ahead: playhead * aheadRatio,
    rowSize,
    songLen: (totalMs + leadInMs) * pxPerMs + playhead,
    pxPerMs,
    tilt,
  };
}

/** 孔列 → 横向/纵向档位偏移（列内留 BLOCK_GAP / 2 的边距） */
export function laneOffset(lane: number, rowSize: number): number {
  return (lane - 1) * rowSize + BLOCK_GAP / 2;
}

/**
 * 音符时刻 → 沿时间轴的**绝对**坐标（从画布起点算起）。
 * 与可视窗口无关，因此滚动时坐标恒定、不跳动（详见 §7.3）。
 */
export function timeOffset(startMs: number, leadInMs: number, songLen: number, pxPerMs: number): number {
  return songLen - (startMs + leadInMs) * pxPerMs;
}