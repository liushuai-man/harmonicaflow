import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';
import { elevation, radius, spacing } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';

/**
 * 分段控件（见 docs/TECH_DESIGN.md §7.8）
 *
 * 选项切换用一块「滑块」在选项间平滑位移（reanimated 在 UI 线程做动画），
 * 比单纯换背景色更有连续感；选项较多或过窄时也不会挤压文字。
 */

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** 轨道内边距，滑块四周留出同样的呼吸位 */
const PAD = 3;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const progress = useSharedValue(index);

  useEffect(() => {
    progress.value = withTiming(index, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [index, progress]);

  const itemWidth = trackWidth > 0 ? (trackWidth - PAD * 2) / options.length : 0;

  const indicatorStyle = useAnimatedStyle(
    () => ({
      width: itemWidth,
      transform: [{ translateX: progress.value * itemWidth }],
    }),
    [itemWidth],
  );

  return (
    <View
      style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {itemWidth > 0 ? (
        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: colors.surface, borderColor: colors.border },
            elevation(1, colors.shadow),
            indicatorStyle,
          ]}
        />
      ) : null}

      {options.map((option) => {
        const active = option.value === value;
        const tint = active ? colors.accent : colors.textMuted;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            style={styles.item}
          >
            {option.icon ? <Icon name={option.icon} size={15} color={tint} strokeWidth={2} /> : null}
            <Text style={[styles.label, { color: tint }, active && styles.labelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: PAD,
  },
  indicator: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    bottom: PAD,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
  },
  label: {
    fontSize: 13,
  },
  labelActive: {
    fontWeight: '700',
  },
});