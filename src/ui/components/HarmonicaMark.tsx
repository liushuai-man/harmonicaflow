import Svg, { Circle, Rect } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

/**
 * 装饰性口琴插画（见 docs/TECH_DESIGN.md §7.8）
 *
 * 用一个矢量口琴为首页 Hero / 空态提供「主题相关」的视觉焦点，
 * 比通用占位图更贴题；颜色取自色板，深浅两套自动跟随。
 */

export interface HarmonicaMarkProps {
  /** 图形宽度（像素） */
  size?: number;
}

/** 画布比例（宽 : 高） */
const RATIO = 72 / 132;

export function HarmonicaMark({ size = 132 }: HarmonicaMarkProps) {
  const { colors } = useTheme();
  const holes = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <Svg width={size} height={Math.round(size * RATIO)} viewBox="0 0 132 72" fill="none">
      {/* 琴身 */}
      <Rect
        x={6}
        y={22}
        width={120}
        height={30}
        rx={9}
        fill={colors.accentSoft}
        stroke={colors.accent}
        strokeWidth={1.6}
      />
      {/* 上盖板 */}
      <Rect x={6} y={22} width={120} height={11} rx={9} fill={colors.accent} fillOpacity={0.24} />
      {/* 气孔 */}
      {holes.map((i) => (
        <Rect
          key={i}
          x={14 + i * 11.6}
          y={36}
          width={7.4}
          height={11}
          rx={3}
          fill={colors.accent}
          fillOpacity={0.55}
        />
      ))}
      {/* 两端固定钉 */}
      <Circle cx={12} cy={52} r={1.8} fill={colors.accent} fillOpacity={0.5} />
      <Circle cx={120} cy={52} r={1.8} fill={colors.accent} fillOpacity={0.5} />
    </Svg>
  );
}