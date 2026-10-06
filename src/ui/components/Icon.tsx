import type { ReactNode } from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

/**
 * 图标集（见 docs/TECH_DESIGN.md §7.8）
 *
 * 采用与 Lucide 一致的「24 网格 · 2px 描边 · 圆头圆角」几何规范手工绘制，
 * 用已有的 react-native-svg 渲染，**不引入图标字体或图标库**：
 *   - 颜色随主题走（继承 stroke），深浅两套自动适配；
 *   - 只需当前用到的字形，包体几乎零增量。
 * 新增图标时在此登记字形即可，调用方只认 `IconName`。
 */

export type IconName =
  | 'play'
  | 'pause'
  | 'restart'
  | 'settings'
  | 'upload'
  | 'chevronRight'
  | 'chevronDown'
  | 'music'
  | 'harp'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'check'
  | 'alert'
  | 'info'
  | 'sparkles'
  | 'palette'
  | 'gauge'
  | 'target'
  | 'pencil';

interface GlyphProps {
  color: string;
  strokeWidth: number;
}

const GLYPHS: Record<IconName, (props: GlyphProps) => ReactNode> = {
  // 实心字形：自带 fill，覆盖根节点的 stroke
  play: ({ color }) => (
    <Path
      d="M8 5.4v13.2a1 1 0 0 0 1.53.85l10.4-6.6a1 1 0 0 0 0-1.7L9.53 4.55A1 1 0 0 0 8 5.4z"
      fill={color}
      stroke="none"
    />
  ),
  pause: ({ color }) => (
    <>
      <Rect x={6.4} y={4.5} width={3.6} height={15} rx={1.4} fill={color} stroke="none" />
      <Rect x={14} y={4.5} width={3.6} height={15} rx={1.4} fill={color} stroke="none" />
    </>
  ),
  restart: () => (
    <>
      <Path d="M20.5 12a8.5 8.5 0 1 1-2.55-6.06" />
      <Path d="M20.6 3.6v4.7h-4.7" />
    </>
  ),
  settings: () => (
    <>
      <Line x1={4} y1={21} x2={4} y2={14.5} />
      <Line x1={4} y1={10.5} x2={4} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={12.5} />
      <Line x1={12} y1={8.5} x2={12} y2={3} />
      <Line x1={20} y1={21} x2={20} y2={16.5} />
      <Line x1={20} y1={12.5} x2={20} y2={3} />
      <Line x1={1.5} y1={14.5} x2={6.5} y2={14.5} />
      <Line x1={9.5} y1={8.5} x2={14.5} y2={8.5} />
      <Line x1={17.5} y1={16.5} x2={22.5} y2={16.5} />
    </>
  ),
  upload: () => (
    <>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Path d="M16.5 8L12 3.5 7.5 8" />
      <Line x1={12} y1={3.5} x2={12} y2={15} />
    </>
  ),
  chevronRight: () => <Path d="M9.5 18l6-6-6-6" />,
  chevronDown: () => <Path d="M6 9.5l6 6 6-6" />,
  music: () => (
    <>
      <Path d="M9 18V5.2l12-2v12.6" />
      <Circle cx={6} cy={18} r={3} />
      <Circle cx={18} cy={15.8} r={3} />
    </>
  ),
  // 口琴：琴身 + 四道气孔隔条
  harp: () => (
    <>
      <Rect x={2.2} y={7.5} width={19.6} height={9} rx={2.6} />
      <Line x1={7.1} y1={7.5} x2={7.1} y2={16.5} />
      <Line x1={12} y1={7.5} x2={12} y2={16.5} />
      <Line x1={16.9} y1={7.5} x2={16.9} y2={16.5} />
    </>
  ),
  sun: () => (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: () => <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  // 跟随系统：半明半暗的圆
  auto: ({ color }) => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 3a9 9 0 0 1 0 18z" fill={color} stroke="none" />
    </>
  ),
  check: () => <Path d="M20 6.5L9.2 17.3 4 12.1" />,
  alert: () => (
    <>
      <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <Line x1={12} y1={9} x2={12} y2={13.4} />
      <Line x1={12} y1={17.2} x2={12.01} y2={17.2} />
    </>
  ),
  info: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Line x1={12} y1={16.2} x2={12} y2={11.4} />
      <Line x1={12} y1={8} x2={12.01} y2={8} />
    </>
  ),
  sparkles: () => (
    <>
      <Path d="M11.5 3.5l1.85 4.95 4.95 1.85-4.95 1.85L11.5 17.1 9.65 12.15 4.7 10.3l4.95-1.85L11.5 3.5z" />
      <Path d="M18.8 15l.72 1.93 1.93.72-1.93.72-.72 1.93-.72-1.93-1.93-.72 1.93-.72L18.8 15z" />
    </>
  ),
  palette: ({ color }) => (
    <>
      <Path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.85-.95 1.5-1.95-.35-1 .4-2.05 1.45-2.05H17a4 4 0 0 0 4-4c0-5.05-4.05-9-9-9z" />
      <Circle cx={7.6} cy={12.4} r={1.05} fill={color} stroke="none" />
      <Circle cx={10} cy={8.4} r={1.05} fill={color} stroke="none" />
      <Circle cx={14.6} cy={7.8} r={1.05} fill={color} stroke="none" />
    </>
  ),
  gauge: ({ color }) => (
    <>
      <Path d="M4.6 18.5a9 9 0 1 1 14.8 0" />
      <Line x1={12} y1={14.2} x2={15.6} y2={10.6} />
      <Circle cx={12} cy={14.2} r={1.5} fill={color} stroke="none" />
    </>
  ),
  target: ({ color }) => (
    <>
      <Circle cx={12} cy={12} r={8.6} />
      <Circle cx={12} cy={12} r={4.4} />
      <Circle cx={12} cy={12} r={1.2} fill={color} stroke="none" />
    </>
  ),
  pencil: () => (
    <>
      <Path d="M4 20h4l10-10-4-4L4 16v4z" />
      <Path d="M13.5 5.5l4 4" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** 边长（像素），默认 20 */
  size?: number;
  /** 颜色，缺省跟随主题正文色 */
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color, strokeWidth = 1.9 }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.text;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tint}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]({ color: tint, strokeWidth })}
    </Svg>
  );
}