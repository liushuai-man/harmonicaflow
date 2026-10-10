import { MotionPressable as Pressable } from './MotionPressable';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { elevation, radius, spacing } from '../../theme/tokens';

/**
 * 卡片容器（见 docs/TECH_DESIGN.md §7.8）
 *
 * 统一的「表面」表达：圆角 + 细描边 + 轻投影，用来把信息分块、让内容浮离背景。
 * 传入 `onPress` 即变为可点卡片，并带按下反馈；不传则是纯容器。
 */

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** 内边距，默认 16；自绘布局时置 false */
  padded?: boolean;
  /** 是否投影，默认 true */
  elevated?: boolean;
  /** 主色描边（用于强调 / 选中态） */
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({
  children,
  onPress,
  padded = true,
  elevated = true,
  highlighted = false,
  style,
  accessibilityLabel,
}: CardProps) {
  const { colors } = useTheme();

  const base: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: colors.surface,
      borderColor: highlighted ? colors.accentBorder : colors.border,
    },
    elevated && elevation(1, colors.shadow),
    padded && styles.padded,
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: {
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});