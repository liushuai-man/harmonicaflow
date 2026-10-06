import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { radius } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';

/**
 * 图标底托（见 docs/TECH_DESIGN.md §7.8）
 *
 * 列表卡片与设置项左侧的「小方块」：统一尺寸与圆角，
 * 让纯文字列表多一个视觉锚点，扫读时能按图标快速定位。
 */

export type IconTileTone = 'accent' | 'neutral' | 'blow' | 'draw';

export interface IconTileProps {
  name: IconName;
  size?: number;
  tone?: IconTileTone;
  style?: StyleProp<ViewStyle>;
}

export function IconTile({ name, size = 40, tone = 'accent', style }: IconTileProps) {
  const { colors } = useTheme();
  const { background, foreground } = resolveTone(tone, colors);
  const glyph = Math.round(size * 0.5);

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: radius.md, backgroundColor: background },
        style,
      ]}
    >
      <Icon name={name} size={glyph} color={foreground} strokeWidth={1.9} />
    </View>
  );
}

function resolveTone(tone: IconTileTone, colors: ReturnType<typeof useTheme>['colors']) {
  switch (tone) {
    case 'accent':
      return { background: colors.accentSoft, foreground: colors.accent };
    case 'blow':
      return { background: colors.warningBg, foreground: colors.blow };
    case 'draw':
      return { background: colors.surfaceAlt, foreground: colors.draw };
    case 'neutral':
      return { background: colors.surfaceAlt, foreground: colors.textMuted };
  }
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});