import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * 播放状态机（见 docs/TECH_DESIGN.md §7.2）
 *
 * 播放位置 `positionMs` 是 Reanimated 共享值：`withTiming` 在 UI 线程上线性推进，
 * 因此时间轴滚动不会触发 React 重渲染。JS 侧只持有 isPlaying / speed 这类低频状态。
 */

export const SPEED_OPTIONS = [0.5, 0.75, 1] as const;
export type Speed = (typeof SPEED_OPTIONS)[number];

export interface Playback {
  /** 当前播放位置（毫秒），范围 [0, totalMs] */
  positionMs: SharedValue<number>;
  isPlaying: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
  seek: (ms: number) => void;
  setSpeed: (speed: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function usePlayback(totalMs: number, initialSpeed: number = 1): Playback {
  const positionMs = useSharedValue(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(initialSpeed);

  const speedRef = useRef(initialSpeed);
  const playingRef = useRef(false);
  const totalRef = useRef(totalMs);
  totalRef.current = totalMs;

  const handleFinish = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  const startFrom = useCallback(
    (fromMs: number) => {
      const total = totalRef.current;
      if (total <= 0) return;
      const from = clamp(fromMs, 0, total);
      positionMs.value = from;
      playingRef.current = true;
      setIsPlaying(true);
      positionMs.value = withTiming(
        total,
        { duration: Math.max(1, (total - from) / speedRef.current), easing: Easing.linear },
        (finished?: boolean) => {
          'worklet';
          if (finished) runOnJS(handleFinish)();
        },
      );
    },
    [handleFinish, positionMs],
  );

  const play = useCallback(() => {
    if (playingRef.current) return;
    const total = totalRef.current;
    const from = positionMs.value >= total - 1 ? 0 : positionMs.value;
    startFrom(from);
  }, [positionMs, startFrom]);

  const pause = useCallback(() => {
    cancelAnimation(positionMs);
    playingRef.current = false;
    setIsPlaying(false);
  }, [positionMs]);

  const restart = useCallback(() => {
    cancelAnimation(positionMs);
    startFrom(0);
  }, [positionMs, startFrom]);

  const seek = useCallback(
    (ms: number) => {
      cancelAnimation(positionMs);
      const value = clamp(ms, 0, totalRef.current);
      positionMs.value = value;
      if (playingRef.current) startFrom(value);
    },
    [positionMs, startFrom],
  );

  const setSpeed = useCallback(
    (next: number) => {
      speedRef.current = next;
      setSpeedState(next);
      if (playingRef.current) {
        const current = positionMs.value;
        cancelAnimation(positionMs);
        startFrom(current);
      }
    },
    [positionMs, startFrom],
  );

  // 换曲：位置归零并停止
  useEffect(() => {
    cancelAnimation(positionMs);
    positionMs.value = 0;
    playingRef.current = false;
    setIsPlaying(false);
  }, [totalMs, positionMs]);

  return { positionMs, isPlaying, speed, play, pause, restart, seek, setSpeed };
}
