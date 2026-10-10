import { useState } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { INTERACTION_MS } from '../../core/visual';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 给卡片、列表、封面等非 Button 点击入口同一套反馈。 */
export function MotionPressable({ style, children, onPressIn, onPressOut, ...props }: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const down = useSharedValue(false);
  const reduced = useReducedMotion();
  const feedback = useAnimatedStyle(() => ({
    opacity: withTiming(down.value ? 0.86 : 1, { duration: reduced ? 0 : INTERACTION_MS }),
    transform: [{ scale: withTiming(down.value && !reduced ? 0.99 : 1, { duration: reduced ? 0 : INTERACTION_MS }) }],
  }));
  return <AnimatedPressable {...props}
    onPressIn={event => { down.value = true; setPressed(true); onPressIn?.(event); }}
    onPressOut={event => { down.value = false; setPressed(false); onPressOut?.(event); }}
    style={[typeof style === 'function' ? style({ pressed }) : style, feedback]}>
    {typeof children === 'function' ? children({ pressed }) : children}
  </AnimatedPressable>;
}
