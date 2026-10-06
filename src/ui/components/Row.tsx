import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH, radius, spacing } from '../../theme/tokens';
import { Icon } from './Icon';

/**
 * 列表行 / 设置项（见 docs/TECH_DESIGN.md §7.8）
 *
 * 左侧留一个图标插槽，中间是「标题 + 副标题」，右侧放数值或自定义节点；
 * `selected` 时整行换主色底并显示对勾，用作单选列表（口琴预设）。
 */

export interface RowProps {
  title: string;
  subtitle?: string;
  /** 左侧图标插槽；不传则整行不缩进 */
  leading?: ReactNode;
  /** 右侧附属文字（如「当前」「已校对」） */
  trailing?: string;
  /** 右侧自定义节点，优先于 trailing */
  right?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  showChevron?: boolean;
  accessibilityLabel?: string;
}

export function Row({
  title,
  subtitle,
  leading,
  trailing,
  right,
  onPress,
  selected = false,
  showChevron = false,
  accessibilityLabel,
}: RowProps) {
  const { colors } = useTheme();

  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: selected ? colors.accent : colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (trailing ? (
          <Text style={[styles.trailing, { color: colors.accent }]}>{trailing}</Text>
        ) : null)}
      {selected ? <Icon name="check" size={17} color={colors.accent} strokeWidth={2.4} /> : null}
      {showChevron ? <Icon name="chevronRight" size={17} color={colors.placeholder} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surfaceAlt }]}>{content}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: selected ? colors.accentSoft : colors.surfaceAlt },
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  leading: {
    marginLeft: -2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
  },
  trailing: {
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});