import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { formatDuration } from '../player/timing';
import { SPEED_OPTIONS } from '../player/usePlayback';
import { useTheme } from '../theme/ThemeProvider';
import { elevation, radius, spacing } from '../theme/tokens';
import { Button } from './components';

interface TransportBarProps {
  isPlaying: boolean;
  speed: number;
  positionMs: SharedValue<number>;
  totalMs: number;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (ms: number) => void;
  onSpeedChange: (speed: number) => void;
}

export function TransportBar({
  isPlaying,
  speed,
  positionMs,
  totalMs,
  onPlayPause,
  onRestart,
  onSeek,
  onSpeedChange,
}: TransportBarProps) {
  const { colors } = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // 进度条与时间文字只需低频刷新，避免播放时整棵树重渲染
  useAnimatedReaction(
    () => Math.floor(positionMs.value / 500),
    (bucket: number, previous: number | null) => {
      if (previous === null || bucket !== previous) {
        runOnJS(setElapsedMs)(bucket * 500);
      }
    },
    [],
  );

  const fillStyle = useAnimatedStyle(
    () => ({
      width: totalMs > 0 ? Math.max(0, Math.min(1, positionMs.value / totalMs)) * barWidth : 0,
    }),
    [barWidth, totalMs],
  );

  const cycleSpeed = () => {
    const index = SPEED_OPTIONS.indexOf(speed as (typeof SPEED_OPTIONS)[number]);
    const next = SPEED_OPTIONS[(index + 1) % SPEED_OPTIONS.length];
    onSpeedChange(next);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderTopColor: colors.border },
        elevation(2, colors.shadow),
      ]}
    >
      <View style={styles.progressRow}>
        <Pressable
          style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="播放进度"
          onPress={(event) => {
            if (barWidth <= 0 || totalMs <= 0) return;
            const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidth));
            onSeek(ratio * totalMs);
          }}
        >
          <Animated.View
            style={[styles.fill, { backgroundColor: colors.playhead }, fillStyle]}
          >
            <View
              style={[
                styles.thumb,
                { backgroundColor: colors.surface, borderColor: colors.playhead },
              ]}
            />
          </Animated.View>
        </Pressable>
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {`${formatDuration(elapsedMs)} / ${formatDuration(totalMs)}`}
        </Text>
      </View>

      <View style={styles.controls}>
        <Button
          label="重播"
          icon="restart"
          variant="secondary"
          onPress={onRestart}
          style={styles.side}
        />
        <Button
          label={isPlaying ? '暂停' : '播放'}
          icon={isPlaying ? 'pause' : 'play'}
          variant="primary"
          onPress={onPlayPause}
          style={styles.main}
        />
        <Button
          label={`${speed}x`}
          icon="gauge"
          variant="secondary"
          onPress={cycleSpeed}
          style={styles.side}
        />
      </View>
    </View>
  );
}

const TRACK_HEIGHT = 8;
const THUMB_SIZE = 16;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  fill: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute',
    right: -(THUMB_SIZE / 2),
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
  time: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  side: { flex: 1 },
  main: { flex: 1.35 },
});