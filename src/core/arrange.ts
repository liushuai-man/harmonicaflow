import type {
  ArrangeResult,
  ArrangeStats,
  HarmonicaLayout,
  NoteEvent,
  Score,
  TabAction,
  TabNote,
} from './model';
import { midiToNoteName } from './pitch';

/**
 * 自动编配：Score 的音符事件 → 口琴孔位/吹吸（TabNote[]）
 *
 * 见 docs/TECH_DESIGN.md §6：
 *   1. 建索引 midi → 候选 {hole, action}[]（复音/半音阶存在同音多孔）
 *   2. 用「最小换孔移动代价」在候选中选优；为避免贪心陷入局部最优，
 *      这里用**束搜索（beam search）**在整条旋律上做近似全局最优
 *   3. 候选为空 → feasible = false，取音高最接近的孔位用于展示
 */

/** 移动一个孔位的代价 */
const HOLE_WEIGHT = 1;
/** 吹法变化（吹↔吸↔推键）的代价，避免频繁换气方向 / 频繁按推键 */
const ACTION_CHANGE_PENALTY = 0.6;
/** 偏好靠近音域中部的孔位（仅用于打破平局） */
const OCTAVE_WEIGHT = 0.03;
/** 束宽：越大越接近全局最优，代价是计算量 */
const BEAM_WIDTH = 12;

export interface ArrangeOptions {
  holeWeight?: number;
  actionChangePenalty?: number;
  octaveWeight?: number;
  beamWidth?: number;
}

interface Candidate {
  hole: number;
  action: TabAction;
  midi: number;
  feasible: boolean;
}

interface BeamState {
  candidate: Candidate;
  cost: number;
  prev: number;
}

/** 建立 midi → 候选孔位索引 */
function buildIndex(layout: HarmonicaLayout): Map<number, { hole: number; action: TabAction }[]> {
  const index = new Map<number, { hole: number; action: TabAction }[]>();
  const add = (midi: number | null | undefined, hole: number, action: TabAction) => {
    if (midi === null || midi === undefined) return;
    const list = index.get(midi);
    if (list) list.push({ hole, action });
    else index.set(midi, [{ hole, action }]);
  };
  for (const hole of layout.holes) {
    add(hole.blow, hole.index, 'blow');
    add(hole.draw, hole.index, 'draw');
    add(hole.blowPush, hole.index, 'blowPush');
    add(hole.drawPush, hole.index, 'drawPush');
  }
  return index;
}

/** 所有 (midi, hole, action) 组合，用于为不可吹音找最接近的孔位 */
function buildAllNotes(layout: HarmonicaLayout): Candidate[] {
  const all: Candidate[] = [];
  const push = (midi: number | null | undefined, hole: number, action: TabAction) => {
    if (midi === null || midi === undefined) return;
    all.push({ hole, action, midi, feasible: true });
  };
  for (const hole of layout.holes) {
    push(hole.blow, hole.index, 'blow');
    push(hole.draw, hole.index, 'draw');
    push(hole.blowPush, hole.index, 'blowPush');
    push(hole.drawPush, hole.index, 'drawPush');
  }
  return all;
}

function nearestCandidate(all: Candidate[], midi: number): Candidate {
  let best = all[0];
  let bestDistance = Math.abs(best.midi - midi);
  for (const candidate of all) {
    const distance = Math.abs(candidate.midi - midi);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { ...best, feasible: false };
}

export function arrange(score: Score, layout: HarmonicaLayout, options: ArrangeOptions = {}): ArrangeResult {
  const holeWeight = options.holeWeight ?? HOLE_WEIGHT;
  const actionChangePenalty = options.actionChangePenalty ?? ACTION_CHANGE_PENALTY;
  const octaveWeight = options.octaveWeight ?? OCTAVE_WEIGHT;
  const beamWidth = options.beamWidth ?? BEAM_WIDTH;

  const index = buildIndex(layout);
  const all = buildAllNotes(layout);
  if (all.length === 0) throw new Error('所选口琴预设没有任何可用孔位');

  const center = (layout.holes.length + 1) / 2;

  const events: NoteEvent[] = [...score.events].sort(
    (a, b) => a.startTicks - b.startTicks || a.midi - b.midi,
  );

  const baseCost = (candidate: Candidate): number =>
    Math.abs(candidate.hole - center) * octaveWeight + (candidate.feasible ? 0 : 1000);

  const transitionCost = (prev: Candidate, next: Candidate): number =>
    Math.abs(next.hole - prev.hole) * holeWeight +
    (prev.action === next.action ? 0 : actionChangePenalty);

  // ── 束搜索 ────────────────────────────────────────────
  const history: BeamState[][] = [];
  let previous: BeamState[] = [];

  for (let i = 0; i < events.length; i += 1) {
    const target = events[i].midi;
    const found = index.get(target);
    const candidates: Candidate[] = found && found.length > 0
      ? found.map((c) => ({ ...c, midi: target, feasible: true }))
      : [nearestCandidate(all, target)];

    const states: BeamState[] = candidates.map((candidate) => {
      if (previous.length === 0) {
        return { candidate, cost: baseCost(candidate), prev: -1 };
      }
      let bestCost = Infinity;
      let bestPrev = 0;
      for (let p = 0; p < previous.length; p += 1) {
        const cost = previous[p].cost + transitionCost(previous[p].candidate, candidate);
        if (cost < bestCost) {
          bestCost = cost;
          bestPrev = p;
        }
      }
      return { candidate, cost: bestCost + baseCost(candidate), prev: bestPrev };
    });

    states.sort((a, b) => a.cost - b.cost);
    const pruned = states.slice(0, beamWidth);
    history.push(pruned);
    previous = pruned;
  }

  // ── 回溯 ─────────────────────────────────────────────
  const notes: TabNote[] = new Array(events.length);
  if (events.length > 0) {
    let bestState = 0;
    for (let s = 1; s < previous.length; s += 1) {
      if (previous[s].cost < previous[bestState].cost) bestState = s;
    }
    let stateIndex = bestState;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const state = history[i][stateIndex];
      const event = events[i];
      notes[i] = {
        ...event,
        hole: state.candidate.hole,
        action: state.candidate.action,
        noteName: midiToNoteName(event.midi),
        feasible: state.candidate.feasible,
      };
      stateIndex = state.prev;
      if (stateIndex < 0) stateIndex = 0;
    }
  }

  const infeasibleNotes: string[] = [];
  for (const note of notes) {
    if (!note.feasible && !infeasibleNotes.includes(note.noteName)) {
      infeasibleNotes.push(note.noteName);
    }
  }

  const stats: ArrangeStats = {
    total: notes.length,
    feasibleCount: notes.filter((n) => n.feasible).length,
    infeasibleNotes,
  };

  return { notes, stats };
}
