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

interface ControlButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
}

function ControlButton({ label, onPress, primary }: ControlButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.surfaceAlt },
        primary && { backgroundColor: colors.accent },
        pressed && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: colors.text },
          primary && { color: colors.onAccent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
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

  const fillStyle = useAnimatedStyle(() => ({
    width: totalMs > 0 ? Math.max(0, Math.min(1, positionMs.value / totalMs)) * barWidth : 0,
  }), [barWidth, totalMs]);

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
      ]}
    >
      <View style={styles.progressRow}>
        <Pressable
          style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            if (barWidth <= 0 || totalMs <= 0) return;
            const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidth));
            onSeek(ratio * totalMs);
          }}
        >
          <Animated.View
            style={[styles.progressFill, { backgroundColor: colors.playhead }, fillStyle]}
          />
        </Pressable>
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {`${formatDuration(elapsedMs)} / ${formatDuration(totalMs)}`}
        </Text>
      </View>

      <View style={styles.controls}>
        <ControlButton label="重播" onPress={onRestart} />
        <ControlButton label={isPlaying ? '暂停' : '播放'} onPress={onPlayPause} primary />
        <ControlButton label={`${speed}x`} onPress={cycleSpeed} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  time: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
