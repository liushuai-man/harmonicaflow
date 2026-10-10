import type { HarmonicaLayout, Score } from './model';
import { keySignatureToTonicPc, pitchClass } from './pitch';

export const EXERCISES = [
  { id: 'scale', title: '音阶上下行', subtitle: '一步一个音，认识 1 到高音 1', cue: '每音一拍，最后一个音保持两拍。先求清楚，再求连贯。' },
  { id: 'steps', title: '三音级进', subtitle: '123 · 234 · 345，练习相邻音切换', cue: '每组三个音后休息一拍。空白时放松，再开始下一组。' },
  { id: 'rhythm', title: '长短音与休止', subtitle: '同一音高，专心感受两拍、一拍与半拍', cue: '两拍音保持住；半拍音在一拍里吹两次。空白是休止，不要抢拍。' },
] as const;

export type ExerciseId = (typeof EXERCISES)[number]['id'];

/** 按当前音阶表找完整大调八度；不猜孔位，不用最近音替代缺音。 */
export function buildExercise(id: string, layout: HarmonicaLayout): Score | null {
  const definition = EXERCISES.find((item) => item.id === id);
  if (!definition) return null;
  const available = new Set<number>();
  for (const hole of layout.holes) {
    for (const midi of [hole.blow, hole.draw, hole.blowPush, hole.drawPush]) {
      if (typeof midi === 'number' && Number.isInteger(midi) && midi >= 0 && midi <= 127) available.add(midi);
    }
  }
  const tonicPc = keySignatureToTonicPc(layout.key);
  const intervals = [0, 2, 4, 5, 7, 9, 11, 12];
  const tonic = [...available].sort((a, b) => a - b).find((midi) =>
    pitchClass(midi) === tonicPc && intervals.every((offset) => available.has(midi + offset)),
  );
  if (tonic === undefined) return null;

  // null 代表休止；时值以四分音符为一拍，最后转换为领域模型的 tick。
  const pattern: { degree: number | null; beats: number }[] = [];
  if (id === 'scale') {
    for (const degree of [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]) {
      pattern.push({ degree, beats: pattern.length === 14 ? 2 : 1 });
    }
  } else if (id === 'steps') {
    for (let first = 0; first <= 5; first += 1) {
      for (const degree of [first, first + 1, first + 2, null]) pattern.push({ degree, beats: 1 });
    }
    // 以主音长音收束，让最后一组的休止也能在播放器中完整保留。
    pattern.push({ degree: 0, beats: 4 });
  } else {
    for (const beats of [2, 1, 1, 0.5, 0.5, 1, 1, 1, 4]) {
      pattern.push({ degree: pattern.length === 2 || pattern.length === 6 ? null : 0, beats });
    }
  }
  let startTicks = 0;
  const events: Score['events'] = [];
  for (const { degree, beats } of pattern) {
    const durationTicks = beats * 480;
    if (degree !== null) {
      events.push({ id: `n${events.length}`, midi: tonic + intervals[degree], startTicks, durationTicks });
    }
    startTicks += durationTicks;
  }
  return {
    id: `exercise:${id}`, title: definition.title, ppq: 480, tempoBpm: 60,
    timeSignature: [4, 4], keySignature: layout.key, events, source: 'json',
    diagnostics: { support: 'full', notes: [] },
  };
}
