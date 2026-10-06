import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { radius, spacing } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';

/**
 * 徽标 / 药丸标签（见 docs/TECH_DESIGN.md §7.8）
 *
 * 用于状态与来源标注（示例、已校对、可吹比例…），只给语义 `tone`，
 * 具体色值由主题解析，避免各处各写一套淡色底。
 */

export type BadgeTone = 'accent' | 'neutral' | 'success' | 'danger' | 'warning';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'neutral', icon, style }: BadgeProps) {
  const { colors } = useTheme();
  const { background, foreground } = resolveTone(tone, colors);

  return (
    <View style={[styles.badge, { backgroundColor: background }, style]}>
      {icon ? <Icon name={icon} size={11} color={foreground} strokeWidth={2.4} /> : null}
      <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function resolveTone(tone: BadgeTone, colors: ReturnType<typeof useTheme>['colors']) {
  switch (tone) {
    case 'accent':
      return { background: colors.accentSoft, foreground: colors.accent };
    case 'success':
      return { background: colors.successSoft, foreground: colors.success };
    case 'danger':
      return { background: colors.dangerSoft, foreground: colors.danger };
    case 'warning':
      return { background: colors.warningBg, foreground: colors.warningText };
    case 'neutral':
      return { background: colors.surfaceAlt, foreground: colors.textMuted };
  }
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});