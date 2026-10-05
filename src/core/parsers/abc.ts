import type { NoteEvent, Score } from '../model';
import { DEFAULT_PPQ, parseFraction } from './json';

/**
 * ABC 记谱解析器（常用子集）
 *
 * 支持：
 *   - 头部字段 X / T / M / L / K / Q
 *   - 音名 A-G（大写 = 第 4 八度 / 小写 = 高一个八度），八度记号 ' 与 ,
 *   - 临时记号 ^ ^^ _ __ =（按小节记忆）
 *   - 时值倍数 2 / /2 / // / 3/2，默认时值来自 L:
 *   - 休止 z / x，连音 -，和弦 [CEG]（取最高音），小节线（同时清除临时记号记忆）
 *   - 装饰记号 ^"" ^!! ^{}、行内字段 [K:...]、% 注释均被跳过
 *
 * 不支持（会被安全跳过）：多声部 &、反复记号语义、装饰音实际演奏。
 */

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseAbc(content: string, id: string): Score {
  const ppq = DEFAULT_PPQ;
  const lines = content.split(/\r?\n/);

  // ── 头部 ─────────────────────────────────────────────
  const headers = new Map<string, string>();
  let bodyStart = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%')) {
      bodyStart = li + 1;
      continue;
    }
    const m = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (!m) break; // 头部结束，进入正文
    const key = m[1].toUpperCase();
    if (!headers.has(key)) headers.set(key, m[2].trim());
    bodyStart = li + 1;
    if (key === 'K') break;
  }
  const body = lines.slice(bodyStart).join('\n');

  // ── 头部字段解读 ──────────────────────────────────────
  const mValue = headers.get('M') ?? '4/4';
  let timeSignature: [number, number] = [4, 4];
  if (mValue === 'C') timeSignature = [4, 4];
  else if (mValue === 'C|') timeSignature = [2, 2];
  else {
    const p = /^(\d+)\s*\/\s*(\d+)$/.exec(mValue);
    if (p) timeSignature = [Number(p[1]), Number(p[2])];
  }

  const lFraction = parseFraction(headers.get('L') ?? '1/8') ?? 0.125;
  const defaultLenTicks = lFraction * 4 * ppq;

  let tempoBpm = 120;
  const qValue = headers.get('Q');
  if (qValue) {
    const m = /=\s*(\d+(?:\.\d+)?)/.exec(qValue) ?? /(\d+(?:\.\d+)?)/.exec(qValue);
    const parsed = m ? Number(m[1]) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) tempoBpm = parsed;
  }

  // ── 正文扫描 ─────────────────────────────────────────
  const events: NoteEvent[] = [];
  const accidentalMemory = new Map<string, number>();
  let pendingAccidental: number | null = null;
  let ticks = 0;
  let lastOpen: NoteEvent | null = null;
  let tiePending = false;
  let i = 0;
  const n = body.length;

  const readLengthMultiplier = (): number => {
    let a = '';
    while (i < n && body[i] >= '0' && body[i] <= '9') a += body[i++];
    if (body[i] === '/') {
      let slashes = 0;
      while (i < n && body[i] === '/') {
        slashes += 1;
        i += 1;
      }
      let b = '';
      while (i < n && body[i] >= '0' && body[i] <= '9') b += body[i++];
      const num = a === '' ? 1 : Number(a);
      const den = b === '' ? Math.pow(2, slashes) : Number(b);
      return den ? num / den : 1;
    }
    return a === '' ? 1 : Number(a);
  };

  const pushNote = (midi: number, duration: number): void => {
    if (tiePending && lastOpen && lastOpen.midi === midi) {
      lastOpen.durationTicks += duration;
      ticks += duration;
      tiePending = false;
      return;
    }
    tiePending = false;
    const event: NoteEvent = { id: `n${events.length}`, midi, startTicks: ticks, durationTicks: duration };
    events.push(event);
    lastOpen = event;
    ticks += duration;
  };

  const readAccidental = (): void => {
    let acc = 0;
    while (i < n && (body[i] === '^' || body[i] === '_' || body[i] === '=')) {
      const c = body[i];
      i += 1;
      if (c === '^') acc += 1;
      else if (c === '_') acc -= 1;
      else acc = 0;
    }
    pendingAccidental = acc;
  };

  /** 读和弦内部（[ 与 ] 之间）的音名，返回 MIDI 列表 */
  const readChordNotes = (inner: string): number[] => {
    const result: number[] = [];
    let j = 0;
    let acc: number | null = null;
    while (j < inner.length) {
      const c = inner[j];
      if (/\s/.test(c)) {
        j += 1;
        continue;
      }
      if (c === '^' || c === '_' || c === '=') {
        let a = 0;
        while (j < inner.length && (inner[j] === '^' || inner[j] === '_' || inner[j] === '=')) {
          const cc = inner[j];
          j += 1;
          if (cc === '^') a += 1;
          else if (cc === '_') a -= 1;
          else a = 0;
        }
        acc = a;
        continue;
      }
      if (/[A-Ga-g]/.test(c)) {
        j += 1;
        let octave = c >= 'a' ? 5 : 4;
        while (j < inner.length && (inner[j] === "'" || inner[j] === ',')) {
          octave += inner[j] === "'" ? 1 : -1;
          j += 1;
        }
        result.push((octave + 1) * 12 + LETTER_PC[c.toUpperCase()] + (acc ?? 0));
        acc = null;
        continue;
      }
      j += 1;
    }
    return result;
  };

  while (i < n) {
    const ch = body[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '%') {
      while (i < n && body[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '"' || ch === '!') {
      i += 1;
      while (i < n && body[i] !== ch) i += 1;
      i += 1;
      continue;
    }
    if (ch === '{') {
      while (i < n && body[i] !== '}') i += 1;
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = body.indexOf(']', i);
      if (end < 0) {
        i += 1;
        continue;
      }
      const inner = body.slice(i + 1, end);
      i = end + 1;
      if (/^[A-Za-z]:/.test(inner)) continue; // 行内字段 [K:...]
      const chord = readChordNotes(inner);
      const duration = defaultLenTicks * readLengthMultiplier();
      if (chord.length > 0) {
        pushNote(Math.max(...chord), duration);
      } else {
        ticks += duration;
        lastOpen = null;
      }
      continue;
    }
    if (ch === '-') {
      i += 1;
      tiePending = true;
      continue;
    }
    if (ch === '^' || ch === '_' || ch === '=') {
      readAccidental();
      continue;
    }
    if (/[A-Ga-g]/.test(ch)) {
      i += 1;
      let octave = ch >= 'a' ? 5 : 4;
      while (i < n && (body[i] === "'" || body[i] === ',')) {
        octave += body[i] === "'" ? 1 : -1;
        i += 1;
      }
      const letter = ch.toUpperCase();
      const memoryKey = `${letter}${octave}`;
      let accOffset: number;
      if (pendingAccidental !== null) {
        accOffset = pendingAccidental;
        accidentalMemory.set(memoryKey, accOffset);
        pendingAccidental = null;
      } else {
        accOffset = accidentalMemory.get(memoryKey) ?? 0;
      }
      const midi = (octave + 1) * 12 + LETTER_PC[letter] + accOffset;
      pushNote(midi, defaultLenTicks * readLengthMultiplier());
      continue;
    }
    if (ch === 'z' || ch === 'Z' || ch === 'x' || ch === 'X') {
      i += 1;
      ticks += defaultLenTicks * readLengthMultiplier();
      lastOpen = null;
      continue;
    }
    // 小节线 / 反复记号：清除小节内的临时记号记忆
    if (ch === '|' || ch === ']' || ch === ':') {
      accidentalMemory.clear();
      pendingAccidental = null;
    }
    i += 1;
  }

  if (events.length === 0) throw new Error('ABC 谱面中未解析出任何音符');

  events.sort((a, b) => a.startTicks - b.startTicks);

  return {
    id,
    title: headers.get('T') || '未命名',
    composer: headers.get('C') || undefined,
    ppq,
    tempoBpm,
    timeSignature,
    keySignature: headers.get('K') || undefined,
    events,
    source: 'abc',
  };
}
