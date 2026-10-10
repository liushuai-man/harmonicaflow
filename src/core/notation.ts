import type { Score } from './model';

export interface StaffSymbol {
  id: string;
  start: number;
  duration: number;
  /** null 为休止；E4=30，是高音谱表底线。 */
  step: number | null;
  accidental: -1 | 0 | 1 | null;
  denominator: number | null;
  dotted: boolean;
  tieIn: boolean;
  tieOut: boolean;
}

const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
  Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6, Abm: -7,
};
export function keyFifths(key = 'C'): number | null {
  return FIFTHS[key.replace(/maj(?:or)?$/i, '').replace(/min(?:or)?$/i, 'm')] ?? null;
}
export function keyAlterations(fifths: number): number[] {
  const result = Array<number>(7).fill(0);
  const order = fifths < 0 ? [6, 2, 5, 1, 4, 0, 3] : [3, 0, 4, 1, 5, 2, 6];
  for (const letter of order.slice(0, Math.abs(fifths))) result[letter] = Math.sign(fifths);
  return result;
}

/** MIDI 已失去原始等音拼写，按当前调号确定性重建。 */
export function spellPitch(midi: number, fifths: number) {
  const key = keyAlterations(fifths);
  const candidates: { step: number; alter: -1 | 0 | 1; cost: number }[] = [];
  for (let letter = 0; letter < 7; letter += 1) {
    for (const alter of [-1, 0, 1] as const) {
      const octave = (midi - NATURAL[letter] - alter) / 12 - 1;
      if (!Number.isInteger(octave)) continue;
      candidates.push({ step: octave * 7 + letter, alter,
        cost: (alter === key[letter] ? 0 : 4) + Math.abs(alter) + (alter && Math.sign(alter) !== Math.sign(fifths || 1) ? 1 : 0) });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost || a.step - b.step);
  return candidates[0];
}

/** 单旋律重建：补事件间休止，小节切分与时值切分均通过延音连接。 */
export function buildNotation(score: Score) {
  const fifths = keyFifths(score.keySignature);
  const warnings: string[] = [];
  if (fifths === null) warnings.push('未识别调号：以无调号及临时记号显示实际音高');
  const key = keyAlterations(fifths ?? 0);
  const barTicks = score.ppq * 4 * score.timeSignature[0] / score.timeSignature[1];
  const symbols: StaffSymbol[] = [];
  const values = [1, 2, 4, 8, 16, 32, 64].flatMap(denominator => [
    { denominator, dotted: true, ticks: score.ppq * 4 / denominator * 1.5 },
    { denominator, dotted: false, ticks: score.ppq * 4 / denominator },
  ]).sort((a, b) => b.ticks - a.ticks);
  const accidentals = new Map<number, number>();
  let currentBar = -1;
  const emit = (id: string, start: number, duration: number, midi: number | null) => {
    let cursor = start;
    const end = start + duration;
    const pitch = midi === null ? null : spellPitch(midi, fifths ?? 0);
    let part = 0;
    while (cursor < end - 0.000001) {
      const bar = Math.floor((cursor + 0.000001) / barTicks);
      if (bar !== currentBar) { currentBar = bar; accidentals.clear(); }
      const remaining = Math.min(end - cursor, (bar + 1) * barTicks - cursor);
      // 二进制时值不可精确表示的音符明确标为 tick 比例，不伪造三连音记谱。
      const quantum = score.ppq / 16;
      const standard = Math.abs(remaining / quantum - Math.round(remaining / quantum)) < 0.000001;
      const value = standard ? values.find(v => v.ticks <= remaining + 0.000001) : undefined;
      const ticks = value?.ticks ?? remaining;
      if (!value && !warnings.includes('含非标准时值，以拍数标注')) warnings.push('含非标准时值，以拍数标注');
      let accidental: StaffSymbol['accidental'] = null;
      if (pitch) {
        const previous = accidentals.get(pitch.step) ?? key[((pitch.step % 7) + 7) % 7];
        if (previous !== pitch.alter && part === 0) accidental = pitch.alter;
        // 跨小节延音只延续发声，不建立新小节的临时记号状态。
        if (part === 0) accidentals.set(pitch.step, pitch.alter);
      }
      symbols.push({ id: `${id}:${part}`, start: cursor, duration: ticks, step: pitch?.step ?? null,
        accidental, denominator: value?.denominator ?? null, dotted: value?.dotted ?? false,
        tieIn: pitch !== null && part > 0, tieOut: pitch !== null && cursor + ticks < end - 0.000001 });
      cursor += ticks;
      part += 1;
    }
  };
  let cursor = 0;
  for (const event of [...score.events].sort((a, b) => a.startTicks - b.startTicks)) {
    if (event.startTicks > cursor) emit(`rest-${cursor}`, cursor, event.startTicks - cursor, null);
    emit(event.id, event.startTicks, event.durationTicks, event.midi);
    cursor = Math.max(cursor, event.startTicks + event.durationTicks);
  }
  return { symbols, barTicks, fifths: fifths ?? 0, warnings };
}
