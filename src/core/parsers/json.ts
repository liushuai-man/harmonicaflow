import type { NoteEvent, Score } from '../model';
import { tryNoteNameToMidi } from '../pitch';

/**
 * 自有 JSON 谱面解析器
 *
 * 格式见 docs/TECH_DESIGN.md §3.1：
 *   { "format": "harmonicaflow-score", "version": 1, "title": "...",
 *     "ppq": 480, "tempoBpm": 90, "timeSignature": [4,4], "keySignature": "C",
 *     "notes": [ { "note": "C5", "start": 0, "duration": 480 } ] }
 *
 * start / duration 单位：
 *   - 数字 → tick
 *   - 字符串 "1/4" → 以全音符为 1 的分数（1/4 = 四分音符 = ppq 个 tick）
 */

export const DEFAULT_PPQ = 480;

interface RawNote {
  note?: unknown;
  midi?: unknown;
  start?: unknown;
  duration?: unknown;
  lyric?: unknown;
}

/** "1/4" → 0.25（以全音符为 1）；非法输入返回 null */
export function parseFraction(value: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!den) return null;
  return num / den;
}

/** 把 tick 或 "1/4" 分数（全音符 = 1）统一换算为 tick */
function toTicks(value: unknown, ppq: number, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const fraction = parseFraction(value);
    if (fraction !== null) return fraction * 4 * ppq;
  }
  throw new Error(`JSON 谱面字段 ${field} 非法：${String(value)}`);
}

export function parseJson(content: string, id: string): Score {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (err) {
    throw new Error(`JSON 解析失败：${(err as Error).message}`);
  }
  if (!raw || typeof raw !== 'object') throw new Error('JSON 谱面内容不是对象');

  const obj = raw as Record<string, unknown>;
  if (obj.format !== 'harmonicaflow-score') {
    throw new Error('不是 harmonicaflow-score 格式的 JSON 谱面');
  }

  const ppq = typeof obj.ppq === 'number' && obj.ppq > 0 ? obj.ppq : DEFAULT_PPQ;
  const rawNotes = obj.notes;
  if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
    throw new Error('JSON 谱面缺少 notes 或 notes 为空');
  }

  const events: NoteEvent[] = rawNotes.map((item, index) => {
    const note = (item ?? {}) as RawNote;
    let midi: number | null = null;
    if (typeof note.midi === 'number') {
      midi = note.midi;
    } else if (typeof note.note === 'string') {
      midi = tryNoteNameToMidi(note.note);
    } else if (typeof note.note === 'number') {
      midi = note.note;
    }
    if (midi === null || !Number.isInteger(midi) || midi < 0 || midi > 127) {
      throw new Error(`第 ${index + 1} 个音符音高无法解析：${JSON.stringify(note.note ?? note.midi)}`);
    }
    return {
      id: `n${index}`,
      midi,
      startTicks: toTicks(note.start, ppq, 'start'),
      durationTicks: toTicks(note.duration, ppq, 'duration'),
      lyric: typeof note.lyric === 'string' ? note.lyric : undefined,
    };
  });

  const timeSignature = Array.isArray(obj.timeSignature) && obj.timeSignature.length === 2
    ? [Number(obj.timeSignature[0]) || 4, Number(obj.timeSignature[1]) || 4] as [number, number]
    : [4, 4] as [number, number];

  events.sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);

  return {
    id,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : '未命名',
    composer: typeof obj.composer === 'string' && obj.composer.trim() ? obj.composer.trim() : undefined,
    ppq,
    tempoBpm: typeof obj.tempoBpm === 'number' && obj.tempoBpm > 0 ? obj.tempoBpm : 120,
    timeSignature,
    keySignature: typeof obj.keySignature === 'string' ? obj.keySignature : undefined,
    events,
    source: 'json',
  };
}
