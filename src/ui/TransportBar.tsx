import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { SPEED_OPTIONS } from '../player/usePlayback';
import { formatDuration } from '../player/timing';
import type { TimelineOrientation } from './NoteTimeline';

interface TransportBarProps {
  isPlaying: boolean;
  speed: number;
  orientation: TimelineOrientation;
  positionMs: SharedValue<number>;
  totalMs: number;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (ms: number) => void;
  onSpeedChange: (speed: number) => void;
  onOrientationChange: (orientation: TimelineOrientation) => void;
}

interface ControlButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
}

function ControlButton({ label, onPress, primary }: ControlButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function TransportBar({
  isPlaying,
  speed,
  orientation,
  positionMs,
  totalMs,
  onPlayPause,
  onRestart,
  onSeek,
  onSpeedChange,
  onOrientationChange,
}: TransportBarProps) {
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
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <Pressable
          style={styles.progressTrack}
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            if (barWidth <= 0 || totalMs <= 0) return;
            const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidth));
            onSeek(ratio * totalMs);
          }}
        >
          <Animated.View style={[styles.progressFill, fillStyle]} />
        </Pressable>
        <Text style={styles.time}>{`${formatDuration(elapsedMs)} / ${formatDuration(totalMs)}`}</Text>
      </View>

      <View style={styles.controls}>
        <ControlButton label="重播" onPress={onRestart} />
        <ControlButton label={isPlaying ? '暂停' : '播放'} onPress={onPlayPause} primary />
        <ControlButton label={`${speed}x`} onPress={cycleSpeed} />
        <ControlButton
          label={orientation === 'horizontal' ? '横向' : '纵向'}
          onPress={() => onOrientationChange(orientation === 'horizontal' ? 'vertical' : 'horizontal')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E4E6EA',
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
    backgroundColor: '#E9EBEF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#EB5757',
  },
  time: {
    fontSize: 12,
    color: '#8A8F98',
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
    backgroundColor: '#F1F3F6',
  },
  buttonPrimary: {
    backgroundColor: '#2F80ED',
    flex: 1.4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3C4149',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
});
