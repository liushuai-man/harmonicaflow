/**
 * 音高工具：MIDI ↔ 音名 ↔ 频率
 *
 * 只用一张 12 半音表自行实现（不引入 @tonaljs/*），保持依赖轻量。
 * 约定：MIDI 60 = C4（中央 C）。
 */

/** 升号音名（索引 = 音级 0..11） */
export const SHARP_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/** 字母 → 音级（自然音） */
const LETTER_TO_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACCIDENTAL_OFFSET: Record<string, number> = {
  '#': 1,
  '♯': 1,
  s: 1,
  b: -1,
  '♭': -1,
  f: -1,
};

const MIN_MIDI = 0;
const MAX_MIDI = 127;

export function isValidMidi(midi: number): boolean {
  return Number.isInteger(midi) && midi >= MIN_MIDI && midi <= MAX_MIDI;
}

/** 音级（0=C … 11=B） */
export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/** 八度号（MIDI 60 → 4） */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** MIDI → 音名，如 60 → "C4"、73 → "C#5" */
export function midiToNoteName(midi: number): string {
  return `${SHARP_NAMES[pitchClass(midi)]}${octaveOf(midi)}`;
}

const NOTE_NAME_RE = /^([A-Ga-g])([#♯b♭sf]?)(-?\d+)$/;

/**
 * 音名 → MIDI，如 "C4" → 60、"Bb4" → 70。
 * 无法识别时返回 null（供解析器做容错）。
 */
export function tryNoteNameToMidi(name: string): number | null {
  const m = NOTE_NAME_RE.exec(name.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = Number(m[3]);
  const pc = LETTER_TO_PC[letter];
  if (pc === undefined) return null;
  const offset = accidental ? ACCIDENTAL_OFFSET[accidental] : 0;
  const midi = (octave + 1) * 12 + pc + offset;
  return isValidMidi(midi) ? midi : null;
}

/** 音名 → MIDI，解析失败时抛错（供校验严格的场景使用） */
export function noteNameToMidi(name: string): number {
  const midi = tryNoteNameToMidi(name);
  if (midi === null) throw new Error(`无法解析音名：${name}`);
  return midi;
}

/** MIDI → 频率（A4 = 440Hz），用于后续可能的调音/音频功能 */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 半音移调，结果超出 MIDI 范围时返回 null */
export function transpose(midi: number, semitones: number): number | null {
  const result = midi + semitones;
  return isValidMidi(result) ? result : null;
}

// ── 简谱（1234567）────────────────────────────────────

/** 大调音阶相对主音的半音偏移 */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

export interface Jianpu {
  /** 变音记号：'#' / '' */
  accidental: string;
  /** 简谱音级 1..7 */
  degree: number;
  /** 相对基准八度的偏移：>0 高八度，<0 低八度 */
  octaveShift: number;
}

/**
 * MIDI → 简谱度数（大调记谱）。
 *
 * 以主音为 `1`，非音阶级用升号表示（如 C# 在 C 调中记作 `#1`）。
 * 基准八度取中央 C 附近的主音，八度偏移交给调用方用上/下小圆点呈现。
 */
export function midiToJianpu(midi: number, tonicPc = 0): Jianpu {
  const tonic = ((tonicPc % 12) + 12) % 12;
  // 主音在中央 C 八度中的位置（C4 区），使八度偏移符合直觉
  const reference = 60 + ((((tonic - 60) % 12) + 12) % 12);
  const diff = midi - reference;
  const octaveShift = Math.floor(diff / 12);
  const pc = ((diff % 12) + 12) % 12;

  const scaleIndex = MAJOR_SCALE.indexOf(pc);
  if (scaleIndex !== -1) return { accidental: '', degree: scaleIndex + 1, octaveShift };

  // 非音阶级：一律用升号记法（每个半音都能表示为某音级的升号）
  const sharpIndex = MAJOR_SCALE.indexOf((pc + 11) % 12);
  return { accidental: '#', degree: (sharpIndex === -1 ? 0 : sharpIndex) + 1, octaveShift };
}

/** 简谱文本：高八度在数字后加点、低八度在数字前加点，如 `1·` / `·1` */
export function formatJianpu(jianpu: Jianpu): string {
  const core = `${jianpu.accidental}${jianpu.degree}`;
  const dots = '·'.repeat(Math.abs(jianpu.octaveShift));
  return jianpu.octaveShift >= 0 ? `${core}${dots}` : `${dots}${core}`;
}

/** MIDI → 简谱文本（null/undefined 返回空串，便于直接用于展示） */
export function midiToJianpuText(midi: number | null | undefined, tonicPc = 0): string {
  if (midi === null || midi === undefined) return '';
  return formatJianpu(midiToJianpu(midi, tonicPc));
}

/** 调号（如 "C" / "G" / "Bb"）→ 主音音级；无法识别时按 C 调处理 */
export function keySignatureToTonicPc(keySignature?: string): number {
  if (!keySignature) return 0;
  const m = /^([A-Ga-g])([#♯b♭]?)/.exec(keySignature.trim());
  if (!m) return 0;
  const pc = LETTER_TO_PC[m[1].toUpperCase()] ?? 0;
  const offset = m[2] ? (ACCIDENTAL_OFFSET[m[2]] ?? 0) : 0;
  return (((pc + offset) % 12) + 12) % 12;
}
