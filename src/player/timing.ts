import type { Score } from '../core/model';

/**
 * 时序换算：ticks / BPM → 毫秒
 *
 * 见 docs/TECH_DESIGN.md §7.1：
 *   msPerTick = 60000 / (tempoBpm * ppq)
 *   contentMs = max(startTicks + durationTicks) * msPerTick
 *   totalMs   = contentMs + LEAD_IN_MS
 */

/** 起吹留白：让第一个音块从容走到演奏线，避免“一按就开始吹” */
export const LEAD_IN_MS = 2000;

export interface TimelineInfo {
  /** 每个 tick 对应多少毫秒 */
  msPerTick: number;
  /** 谱面本身时长（不含留白） */
  contentMs: number;
  /** 播放总时长（含留白），播放头取值范围 [0, totalMs] */
  totalMs: number;
}

export function buildTimeline(score: Score): TimelineInfo {
  const msPerTick = 60000 / (score.tempoBpm * score.ppq);
  let maxTick = 0;
  for (const event of score.events) {
    maxTick = Math.max(maxTick, event.startTicks + event.durationTicks);
  }
  const contentMs = maxTick * msPerTick;
  return { msPerTick, contentMs, totalMs: contentMs + LEAD_IN_MS };
}

/** tick → 毫秒（不含留白） */
export function tickToMs(tick: number, timeline: TimelineInfo): number {
  return tick * timeline.msPerTick;
}

/** 毫秒 → 展示用 "m:ss" */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
