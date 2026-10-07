import type { AudioPlayer } from 'expo-audio';

/**
 * 时序接缝：音频时钟（见 docs/TECH_DESIGN.md §12.2）
 *
 * 时间轴坐标与 `player/timing.ts` 保持一致——第一个音块位于 `positionMs = LEAD_IN_MS`，
 * 因此 **音频 0s ↔ 时间轴 LEAD_IN_MS**。本模块把「原生音频播放进度」换算回时间轴毫秒，
 * 并把 play / pause / seek / 变速 四个动作收口在一个文件里，
 * 让 `usePlayback` 的时序逻辑不必直接依赖 expo-audio。
 */
export interface AudioClock {
  /** 起吹留白：音频 0s 对应的时间轴位置（毫秒） */
  readonly leadInMs: number;
  /** 音频是否已真正开始播放（留白期间为 false） */
  hasStarted(): boolean;
  /** 时间轴坐标下的当前播放位置（毫秒），未开始时无意义 */
  now(): number;
  /**
   * 从时间轴位置 `fromMs` 开始播放。若仍在起吹留白内（`fromMs < leadInMs`），
   * 先本地等待 `(leadInMs - fromMs) / rate` 毫秒再从头起播，保持留白不变。
   */
  startAt(fromMs: number, rate: number): void;
  /** 暂停并取消待启动的留白定时器 */
  pause(): void;
  /** 变速（不打断当前播放位置） */
  setRate(rate: number): void;
  /** 释放：取消定时器并停止播放 */
  dispose(): void;
}

export function createAudioClock(player: AudioPlayer, leadInMs: number): AudioClock {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  // 世代号：seekTo 是异步的，用它作废「暂停 / 拖动后仍在途的起播」
  let generation = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const begin = (seconds: number, rate: number) => {
    const gen = ++generation;
    started = false;
    player
      .seekTo(seconds)
      .then(() => {
        if (gen !== generation) return;
        player.playbackRate = rate;
        player.shouldCorrectPitch = true;
        player.play();
        started = true;
      })
      .catch(() => {
        // 伴奏不可读时不阻塞跟吹：静默失败，时间轴仍由本地计时器驱动
      });
  };

  return {
    leadInMs,
    hasStarted: () => started,
    now: () => player.currentTime * 1000 + leadInMs,
    startAt(fromMs, rate) {
      clearTimer();
      started = false;
      if (fromMs >= leadInMs) {
        begin((fromMs - leadInMs) / 1000, rate);
      } else {
        generation += 1;
        timer = setTimeout(() => begin(0, rate), (leadInMs - fromMs) / rate);
      }
    },
    pause() {
      clearTimer();
      generation += 1;
      started = false;
      player.pause();
    },
    setRate(rate) {
      player.playbackRate = rate;
    },
    dispose() {
      clearTimer();
      generation += 1;
      started = false;
      player.pause();
    },
  };
}