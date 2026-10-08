/**
 * 核心数据模型（与 docs/TECH_DESIGN.md 第 3 节保持一致）
 *
 * 本目录（src/core）为纯 TypeScript，零 UI / React / Expo 依赖，
 * 因此可以直接用 Node 脚本（tsx）验证解析与编配的正确性。
 */

export type SourceFormat = 'json' | 'abc' | 'musicxml';

/** 与来源格式、口琴型号解耦的音符事件 */
export interface NoteEvent {
  id: string;
  /** MIDI 音高，C4 = 60 */
  midi: number;
  /** 起始 tick */
  startTicks: number;
  /** 时值 tick */
  durationTicks: number;
  lyric?: string;
}

/**
 * 解析诊断：区分「完全支持」与「可用但简化」（见 docs/TECH_DESIGN.md §5.1）。
 * 「无法练习」不产出 Score —— 解析器直接抛错，故不在此枚举内。
 */
export type ParseSupport = 'full' | 'simplified';

export interface ScoreDiagnostic {
  /** 稳定代码，便于断言与去重，如 'abc.repeat' */
  code: string;
  /** 面向用户的简短说明 */
  message: string;
}

export interface ParseDiagnostics {
  support: ParseSupport;
  /** 被忽略 / 简化的内容；support === 'full' 时为空 */
  notes: ScoreDiagnostic[];
}

/** 由诊断条目构造报告：按 code 去重，有条目即为「可用但简化」 */
export function makeDiagnostics(notes: ScoreDiagnostic[]): ParseDiagnostics {
  const seen = new Set<string>();
  const unique = notes.filter((note) => {
    if (seen.has(note.code)) return false;
    seen.add(note.code);
    return true;
  });
  return { support: unique.length > 0 ? 'simplified' : 'full', notes: unique };
}

/** 统一中间表示：任何来源的乐谱都被解析成它 */
export interface Score {
  id: string;
  title: string;
  composer?: string;
  /** 每四分音符 tick 数 */
  ppq: number;
  tempoBpm: number;
  timeSignature: [number, number];
  /** 如 "C" / "G" */
  keySignature?: string;
  events: NoteEvent[];
  source: SourceFormat;
  /** 解析诊断：语义简化 / 被忽略的内容（见 docs/TECH_DESIGN.md §5.1） */
  diagnostics: ParseDiagnostics;
}

/** 口琴上的一对孔位（复音/布鲁斯：blow+draw；半音阶：再含推键） */
export interface Hole {
  /** 1 起 */
  index: number;
  /** MIDI，null = 该孔无此吹法 */
  blow: number | null;
  draw: number | null;
  /** 半音阶推键 */
  blowPush?: number | null;
  drawPush?: number | null;
}

export type HarmonicaType = 'tremolo24' | 'single24' | 'diatonic10' | 'chromatic12';

export interface HarmonicaLayout {
  id: string;
  name: string;
  type: HarmonicaType;
  key: string;
  holes: Hole[];
  /** 排列来源 / 待校对说明 */
  notes?: string;
}

export type TabAction = 'blow' | 'draw' | 'blowPush' | 'drawPush';

/** 编配结果，渲染层直接消费 */
export interface TabNote extends NoteEvent {
  hole: number;
  action: TabAction;
  /** 如 "C5" */
  noteName: string;
  /** false = 所选口琴吹不出 */
  feasible: boolean;
}

/** arrange 的统计信息，供跟吹页顶部提示条使用 */
export interface ArrangeStats {
  total: number;
  feasibleCount: number;
  /** 不可吹音的音名（去重后仍按出现顺序，最多保留前若干条） */
  infeasibleNotes: string[];
}

export interface ArrangeResult {
  notes: TabNote[];
  stats: ArrangeStats;
}
