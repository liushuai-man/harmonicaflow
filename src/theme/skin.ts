import type { TabAction } from '../core/model';
import type { OpacityMode, SkinMode } from '../core/visual';
import { adjustLightness, withAlpha } from './color';
import type { Palette, Scheme } from './palette';

/**
 * 皮肤与透明度（见 docs/TECH_DESIGN.md §7.7）
 *
 * `skin` 与 `scheme`（深浅）**正交**：皮肤决定「用什么线条、音块怎么填」，
 * 深浅决定「底色与对比」。两者 + 透明度 → 一组「时间轴视觉令牌」，
 * 组件只按令牌取值，不硬编码色值。
 *
 * 选项类型（`SkinMode` / `OpacityMode`）与用户可调项的**默认值**统一定义在
 * `core/visual/params.ts`，此处只负责把选项组合成具体视觉令牌。
 */

export type { OpacityMode, SkinMode };

/** 单个音块的画法；`gradient = null` 表示空心（只描边） */
export interface BlockSkin {
  /** 三档渐变（顶亮 → 主色 → 底暗）；null = 空心不填充 */
  gradient: { top: string; mid: string; bottom: string } | null;
  stroke: string;
  strokeWidth: number;
  /** 推键的内侧描边色；null = 不加 */
  innerStroke: string | null;
  /** 块内音名/孔号标签色 */
  labelColor: string;
}

export interface TimelineSkin {
  /** 整屏背景渐变 stops（自上而下） */
  backgroundStops: { offset: number; color: string }[];
  /** 背景不透明度 */
  backgroundOpacity: number;
  /** 偶数列淡底；null = 不画列底 */
  laneStripe: string | null;
  /** 列间分隔线 */
  divider: string;
  dividerWidth: number;
  /** 判定线 */
  playhead: string;
  playheadWidth: number;
  /** 命中高亮色（音块 / 判定线段 / 音阶标注共用） */
  highlight: string;
  /** 顶部高光带不透明度（0 = 不画） */
  sheenOpacity: number;
  /** 音块填充不透明度（透明度档位） */
  fillOpacity: number;
  /** 是否彩色皮肤（彩色下吹吸走语义色） */
  colorful: boolean;
  /** 按动作类型取音块画法；含不可吹 */
  block: Record<TabAction | 'infeasible', BlockSkin>;
}

/** 透明度档位 → 填充 / 背景不透明度 */
const OPACITY: Record<OpacityMode, { fill: number; background: number; sheen: number }> = {
  solid: { fill: 1, background: 1, sheen: 0.5 },
  soft: { fill: 0.82, background: 1, sheen: 0.34 },
  glass: { fill: 0.5, background: 0.86, sheen: 0.18 },
};

function tone(base: string): { top: string; mid: string; bottom: string } {
  return {
    top: adjustLightness(base, 0.15),
    mid: base,
    bottom: adjustLightness(base, -0.13),
  };
}

/** 彩色皮肤：沿用语义色（吹暖 / 吸冷），与现在一致 */
function colorBlocks(colors: Palette): TimelineSkin['block'] {
  return {
    blow: { gradient: tone(colors.blow), stroke: withAlpha('#FFFFFF', 0.3), strokeWidth: 1, innerStroke: null, labelColor: colors.onAccent },
    blowPush: { gradient: tone(colors.blowPush), stroke: withAlpha('#FFFFFF', 0.3), strokeWidth: 1, innerStroke: withAlpha('#FFFFFF', 0.5), labelColor: colors.onAccent },
    draw: { gradient: tone(colors.draw), stroke: withAlpha('#FFFFFF', 0.3), strokeWidth: 1, innerStroke: null, labelColor: colors.onAccent },
    drawPush: { gradient: tone(colors.drawPush), stroke: withAlpha('#FFFFFF', 0.3), strokeWidth: 1, innerStroke: withAlpha('#FFFFFF', 0.5), labelColor: colors.onAccent },
    infeasible: {
      gradient: tone(colors.infeasible),
      stroke: colors.infeasibleBorder,
      strokeWidth: 1.5,
      innerStroke: null,
      labelColor: colors.infeasibleText,
    },
  };
}

/**
 * 白线皮肤：深色 = 黑底白线、音块为亮块实体 / 白色描边空心；
 * 浅色 = 白底黑灰线、音块为暗块实体 / 深色描边空心。两套都"一眼可辨吹吸"。
 */
function monoBlocks(scheme: Scheme): TimelineSkin['block'] {
  if (scheme === 'dark') {
    return {
      blow: { gradient: tone('#E9EBEE'), stroke: withAlpha('#FFFFFF', 0.5), strokeWidth: 1, innerStroke: null, labelColor: '#14171B' },
      blowPush: { gradient: tone('#FFFFFF'), stroke: withAlpha('#FFFFFF', 0.7), strokeWidth: 1, innerStroke: withAlpha('#14171B', 0.45), labelColor: '#14171B' },
      // 吸 = 空心描边块；留一点极淡填充，避免"空洞"在长音块上显得突兀
      draw: { gradient: null, stroke: withAlpha('#FFFFFF', 0.85), strokeWidth: 1.5, innerStroke: null, labelColor: '#FFFFFF' },
      drawPush: { gradient: null, stroke: withAlpha('#FFFFFF', 1), strokeWidth: 2, innerStroke: null, labelColor: '#FFFFFF' },
      infeasible: {
        gradient: null,
        stroke: withAlpha('#FFFFFF', 0.22),
        strokeWidth: 1,
        innerStroke: null,
        labelColor: withAlpha('#FFFFFF', 0.5),
      },
    };
  }
  return {
    blow: { gradient: tone('#2A2E34'), stroke: withAlpha('#000000', 0.18), strokeWidth: 1, innerStroke: null, labelColor: '#FFFFFF' },
    blowPush: { gradient: tone('#14171B'), stroke: withAlpha('#000000', 0.28), strokeWidth: 1, innerStroke: withAlpha('#FFFFFF', 0.4), labelColor: '#FFFFFF' },
    draw: { gradient: null, stroke: withAlpha('#14171B', 0.75), strokeWidth: 1.5, innerStroke: null, labelColor: '#14171B' },
    drawPush: { gradient: null, stroke: withAlpha('#14171B', 0.95), strokeWidth: 2, innerStroke: null, labelColor: '#14171B' },
    infeasible: {
      gradient: null,
      stroke: withAlpha('#14171B', 0.2),
      strokeWidth: 1,
      innerStroke: null,
      labelColor: withAlpha('#14171B', 0.45),
    },
  };
}

export function buildTimelineSkin(
  scheme: Scheme,
  skin: SkinMode,
  opacity: OpacityMode,
  accent: string,
  colors: Palette,
): TimelineSkin {
  const op = OPACITY[opacity];
  const dark = scheme === 'dark';

  if (skin === 'color') {
    return {
      backgroundStops: [
        { offset: 0, color: colors.background },
        { offset: 1, color: colors.background },
      ],
      backgroundOpacity: 1,
      laneStripe: colors.surfaceAlt,
      divider: colors.border,
      dividerWidth: 1,
      playhead: colors.playhead,
      playheadWidth: 2,
      highlight: colors.accent,
      sheenOpacity: op.sheen,
      fillOpacity: op.fill,
      colorful: true,
      block: colorBlocks(colors),
    };
  }

  const accentTone = dark ? adjustLightness(accent, 0.15) : accent;
  return {
    backgroundStops: dark
      ? [
          { offset: 0, color: '#05070A' },
          { offset: 0.55, color: '#14171B' },
          { offset: 1, color: '#23272D' },
        ]
      : [
          { offset: 0, color: '#FFFFFF' },
          { offset: 0.55, color: '#F2F3F5' },
          { offset: 1, color: '#E6E8EB' },
        ],
    backgroundOpacity: op.background,
    laneStripe: dark ? withAlpha('#FFFFFF', 0.03) : withAlpha('#000000', 0.025),
    divider: dark ? withAlpha('#FFFFFF', 0.16) : withAlpha('#14171B', 0.12),
    dividerWidth: 1,
    playhead: dark ? withAlpha('#FFFFFF', 0.9) : withAlpha('#14171B', 0.8),
    playheadWidth: 1.5,
    highlight: accentTone,
    sheenOpacity: op.sheen,
    fillOpacity: op.fill,
    colorful: false,
    block: monoBlocks(scheme),
  };
}