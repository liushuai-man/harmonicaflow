import { useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { LEAD_IN_MS } from './timing';
import { createAudioClock } from './timeSource';

/**
 * 播放状态机（见 docs/TECH_DESIGN.md §7.2）
 *
 * 播放位置 `positionMs` 是 Reanimated 共享值：`withTiming` 在 UI 线程上线性推进，
 * 因此时间轴滚动不会触发 React 重渲染。JS 侧只持有 isPlaying / speed 这类低频状态。
 *
 * 供给侧有两套时钟（见 §7.1）：
 * - **无伴奏**（默认）：本地计时器（`withTiming`）驱动，行为与以往完全一致；
 * - **有伴奏**：本地计时器仍负责 UI 线程的平滑推进，另按固定周期读取音频时钟校准，
 *   使滚动位置以伴奏为准（音频 0s ↔ 时间轴 LEAD_IN_MS）。这样既不抖动，也不漂移。
 */

export const SPEED_OPTIONS = [0.5, 0.75, 1] as const;
export type Speed = (typeof SPEED_OPTIONS)[number];

/** 音频时钟校准周期（毫秒） */
const SYNC_INTERVAL_MS = 300;
/** 允许的音画漂移上限（毫秒），超过才纠正，避免频繁重锚带来的抖动 */
const DRIFT_TOLERANCE_MS = 80;

export interface Playback {
  /** 定位/重播/换曲的离散版本，用于清除特效，不参与连续时钟。 */
  revision: SharedValue<number>;
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

export function usePlayback(
  totalMs: number,
  initialSpeed: number = 1,
  audioUri?: string,
): Playback {
  const positionMs = useSharedValue(0);
  const revision = useSharedValue(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(initialSpeed);

  const speedRef = useRef(initialSpeed);
  const playingRef = useRef(false);
  const totalRef = useRef(totalMs);
  totalRef.current = totalMs;

  const hasAudio = audioUri != null;
  const player = useAudioPlayer(audioUri ?? null);
  const clock = useMemo(
    () => (hasAudio ? createAudioClock(player, LEAD_IN_MS) : null),
    [hasAudio, player],
  );

  const handleFinish = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    clock?.pause();
  }, [clock]);

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
        { duration: Math.max(1, (total - from) / speedRef.current), easing: Easing.linear, reduceMotion: ReduceMotion.Never },
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
    if (from === 0) revision.value += 1;
    startFrom(from);
    clock?.startAt(from, speedRef.current);
  }, [positionMs, startFrom, clock, revision]);

  const pause = useCallback(() => {
    cancelAnimation(positionMs);
    playingRef.current = false;
    setIsPlaying(false);
    clock?.pause();
  }, [positionMs, clock]);

  const restart = useCallback(() => {
    revision.value += 1;
    cancelAnimation(positionMs);
    startFrom(0);
    clock?.startAt(0, speedRef.current);
  }, [positionMs, startFrom, clock, revision]);

  const seek = useCallback(
    (ms: number) => {
      revision.value += 1;
      cancelAnimation(positionMs);
      const value = clamp(ms, 0, totalRef.current);
      positionMs.value = value;
      if (playingRef.current) {
        startFrom(value);
        clock?.startAt(value, speedRef.current);
      }
    },
    [positionMs, startFrom, clock, revision],
  );

  const setSpeed = useCallback(
    (next: number) => {
      speedRef.current = next;
      setSpeedState(next);
      clock?.setRate(next);
      if (playingRef.current) {
        const current = positionMs.value;
        cancelAnimation(positionMs);
        startFrom(current);
      }
    },
    [positionMs, startFrom, clock],
  );

  // 伴奏时钟校准：本地计时器负责平滑，这里只纠正超过容差的漂移
  useEffect(() => {
    if (!clock) return;
    const id = setInterval(() => {
      // 伴奏比谱面短时会先播完：此时不再校准，交由本地计时器把剩余段走完
      if (!playingRef.current || !clock.hasStarted() || !player.playing) return;
      const audioMs = clock.now();
      if (Math.abs(audioMs - positionMs.value) > DRIFT_TOLERANCE_MS) startFrom(audioMs);
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [player, clock, positionMs, startFrom]);

  // 卸载：停止伴奏（播放器实例由 expo-audio 自动释放）
  useEffect(() => () => clock?.dispose(), [clock]);

  // 换曲 / 换伴奏：位置归零并停止
  useEffect(() => {
    revision.value += 1;
    cancelAnimation(positionMs);
    positionMs.value = 0;
    playingRef.current = false;
    setIsPlaying(false);
    clock?.pause();
  }, [totalMs, positionMs, clock, revision]);

  useEffect(() => () => cancelAnimation(positionMs), [positionMs]);

  return { revision, positionMs, isPlaying, speed, play, pause, restart, seek, setSpeed };
}
