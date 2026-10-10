import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { INTERACTION_MS } from '../../core/visual/params';
import { readableOn } from '../../theme/color';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH, elevation, radius, spacing } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';

/**
 * 按钮（见 docs/TECH_DESIGN.md §7.8）
 *
 * 四种语义变体 + 三档尺寸，统一按下反馈与触控下限。
 * 需要主色之外的强调色时，用变体而不是内联样式。
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 左侧图标 */
  icon?: IconName;
  /** 右侧图标 */
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** 撑满容器宽度 */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 38, md: 46, lg: 52 };
const FONT_SIZES: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };
const ICON_SIZES: Record<ButtonSize, number> = { sm: 15, md: 17, lg: 19 };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const { colors } = useTheme();

  const { background, foreground, border } = resolve(variant, colors);
  const inactive = disabled || loading;
  const iconSize = ICON_SIZES[size];
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(false);
  const hovered = useSharedValue(false);
  const feedback = useAnimatedStyle(() => ({
    opacity: withTiming(inactive ? 0.45 : pressed.value ? 0.85 : hovered.value ? 0.93 : 1,
      { duration: reducedMotion ? 0 : INTERACTION_MS }),
    transform: [{ scale: withTiming(!inactive && pressed.value && !reducedMotion ? 0.985 : 1,
      { duration: reducedMotion ? 0 : INTERACTION_MS }) }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { pressed.value = true; }}
      onPressOut={() => { pressed.value = false; }}
      onHoverIn={() => { hovered.value = true; }}
      onHoverOut={() => { hovered.value = false; }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.button,
        {
          backgroundColor: background,
          borderColor: border,
          height: HEIGHTS[size],
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
        },
        variant === 'primary' && elevation(1, colors.shadow),
        fullWidth && styles.fullWidth,
        style,
        feedback,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={iconSize} color={foreground} strokeWidth={2} /> : null}
          <Text style={[styles.label, { color: foreground, fontSize: FONT_SIZES[size] }]}>
            {label}
          </Text>
          {iconRight ? (
            <Icon name={iconRight} size={iconSize} color={foreground} strokeWidth={2} />
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

function resolve(variant: ButtonVariant, colors: ReturnType<typeof useTheme>['colors']) {
  switch (variant) {
    case 'primary':
      return { background: colors.accent, foreground: colors.onAccent, border: 'transparent' };
    case 'secondary':
      return { background: colors.surfaceAlt, foreground: colors.text, border: 'transparent' };
    case 'danger':
      return { background: colors.danger, foreground: readableOn(colors.danger), border: 'transparent' };
    case 'ghost':
      return { background: 'transparent', foreground: colors.text, border: colors.border };
  }
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH * 0.85,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontWeight: '600',
  },
});
