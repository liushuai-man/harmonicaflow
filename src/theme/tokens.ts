import { Platform, type ViewStyle } from 'react-native';

/**
 * 设计令牌（见 docs/TECH_DESIGN.md §7.8）
 *
 * 把「尺寸 / 圆角 / 海拔」这类与配色无关的视觉常量收敛到一处，
 * 组件只引用令牌、不写字面量，保证全应用节奏一致。
 * 配色仍走 useTheme() 的语义色板（深浅两套），令牌只管几何。
 */

/** 4pt 基准间距刻度 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/** 圆角刻度 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** 可点区域最小边长（触控可达性下限） */
export const MIN_TOUCH = 44;

export type ElevationLevel = 0 | 1 | 2 | 3;

interface ElevationSpec {
  y: number;
  radius: number;
  opacity: number;
  elevation: number;
}

const ELEVATIONS: Record<Exclude<ElevationLevel, 0>, ElevationSpec> = {
  1: { y: 2, radius: 8, opacity: 0.06, elevation: 2 },
  2: { y: 4, radius: 14, opacity: 0.1, elevation: 5 },
  3: { y: 10, radius: 24, opacity: 0.16, elevation: 10 },
};

/**
 * 跨平台投影：iOS 用 shadow*，Android 用 elevation（两者互不相通，必须成对给）。
 * `shadowColor` 由调用方从色板传入，保证深色下不会出现死黑投影。
 */
export function elevation(level: ElevationLevel, shadowColor = '#000000'): ViewStyle {
  if (level === 0) return {};
  const spec = ELEVATIONS[level];
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor,
        shadowOffset: { width: 0, height: spec.y },
        shadowOpacity: spec.opacity,
        shadowRadius: spec.radius,
      },
      android: { elevation: spec.elevation },
      default: {},
    }) ?? {}
  );
}