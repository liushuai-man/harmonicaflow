import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { EffectContext, TimelineEffect } from './types';

/**
 * 默认特效：判定线处的脉冲环（见 docs/TECH_DESIGN.md §7.5）
 *
 * 方块底沿压线的瞬间，在该列中心播放一次"扩散 + 淡出"的圆环，
 * 给"该吹了"一个即时的视觉提示。
 */

const PULSE_DURATION_MS = 320;

interface PulseRingProps {
  x: number;
  y: number;
  size: number;
  color: string;
  instanceId: number;
  onDone: (instanceId: number) => void;
}

function PulseRing({ x, y, size, color, instanceId, onDone }: PulseRingProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: PULSE_DURATION_MS,
      easing: Easing.out(Easing.quad),
    });
    const timer = setTimeout(() => onDone(instanceId), PULSE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [instanceId, onDone, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - progress.value),
    transform: [{ scale: 0.5 + progress.value * 1.2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export const pulseEffect: TimelineEffect = {
  name: 'pulse',
  durationMs: PULSE_DURATION_MS,
  render(ctx: EffectContext) {
    const size = Math.min(Math.max(ctx.columnWidth - 2, 16), 34);
    return (
      <PulseRing
        key={`pulse-${ctx.instanceId}`}
        instanceId={ctx.instanceId}
        x={ctx.x}
        y={ctx.y}
        size={size}
        color={ctx.color}
        onDone={ctx.onDone}
      />
    );
  },
};

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
});
