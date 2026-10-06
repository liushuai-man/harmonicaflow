import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';

/**
 * 音乐封面（见 docs/TECH_DESIGN.md §7.10）
 *
 * 有可用封面就显示图片；没有（或加载失败）就退回「首字 + 主题色」的占位块，
 * 保证列表与跟吹页的版式稳定，不出现空洞或跳版。
 */

export interface SongCoverProps {
  uri?: string | null;
  title: string;
  size: number;
  /** 圆角半径，默认 size 的 1/4 */
  radius?: number;
}

export function SongCover({ uri, title, size, radius }: SongCoverProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const corner = radius ?? Math.round(size / 4);
  const initial = title.trim().slice(0, 1) || '♪';

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: corner,
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.border,
        },
      ]}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: corner }}
          onError={() => setFailed(true)}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initial, { color: colors.accent, fontSize: size * 0.44 }]}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  initial: {
    fontWeight: '700',
  },
});