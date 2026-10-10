import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { SHATTER_DISTANCE, SHATTER_MS, SHATTER_PARTICLES, SHATTER_SIZE } from '../../core/visual/params';
import type { EffectContext, TimelineEffect } from './types';

function Fragment({ ctx, index }: { ctx: EffectContext; index: number }) {
  const reduced = useReducedMotion();
  const { positionMs, startMs, horizontal, columnWidth } = ctx;
  const spread = (index - (SHATTER_PARTICLES - 1) / 2) / SHATTER_PARTICLES;
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (positionMs.value - startMs) / SHATTER_MS));
    const across = spread * Math.min(columnWidth * 1.5, SHATTER_DISTANCE) * p;
    const along = SHATTER_DISTANCE * (p * p - p) * 2;
    return { opacity: reduced ? 0 : (1 - p) * 0.7, transform: [
      { translateX: horizontal ? along : across }, { translateY: horizontal ? across : along },
      { rotate: `${spread * p * 120}deg` }, { scale: 1 - p * 0.7 },
    ] };
  });
  return <Animated.View style={[styles.fragment, { backgroundColor: ctx.color }, style]} />;
}

function Shatter(ctx: EffectContext) {
  const { positionMs, startMs, instanceId, onDone } = ctx;
  useAnimatedReaction(() => positionMs.value - startMs >= SHATTER_MS, (done, previous) => {
    if (done && !previous) runOnJS(onDone)(instanceId);
  });
  return <View pointerEvents="none" style={{ position: 'absolute', left: ctx.x, top: ctx.y }}>
    {Array.from({ length: SHATTER_PARTICLES }, (_, index) => <Fragment key={index} ctx={ctx} index={index} />)}
  </View>;
}

export const shatterEffect: TimelineEffect = {
  name: 'shatter', durationMs: SHATTER_MS,
  render: ctx => <Shatter key={ctx.instanceId} {...ctx} />,
};
const styles = StyleSheet.create({ fragment: { position: 'absolute', width: SHATTER_SIZE, height: SHATTER_SIZE, borderRadius: 1 } });
