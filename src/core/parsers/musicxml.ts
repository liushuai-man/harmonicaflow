import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import type { NoteEvent, Score, ScoreDiagnostic } from '../model';
import { makeDiagnostics } from '../model';
import { decodeUtf8 } from '../text';
import { DEFAULT_PPQ } from './json';

/**
 * MusicXML 解析器
 *
 * 目标：**只提取音符事件**（音高 + 起始 + 时值），不做记谱排版渲染。
 * 用 fast-xml-parser 的 preserveOrder 模式，保留 measure 内元素顺序，
 * 以便正确处理 backup / forward / chord / tie。
 *
 * 范围（见 docs/TECH_DESIGN.md §5 / §5.1）：
 *   - 只取第一个 part；part 内多声部归一化为单旋律（选音数最多的声部）
 *   - 同一 start 上的和弦只保留最高音（口琴单音吹奏），不再让游标先推进
 *   - 延音线按声部合并，避免跨声部串接
 *   - .mxl（压缩包）先用 fflate 解压，再按 META-INF/container.xml 找到根 XML
 */

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const FIFTHS_TO_KEY: Record<string, string> = {
  '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
  '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
};

type XNode = Record<string, any>;

function tagOf(node: XNode): string {
  return Object.keys(node).find((k) => k !== ':@') ?? '';
}

function kidsOf(node: XNode): XNode[] {
  const tag = tagOf(node);
  const value = node[tag];
  return Array.isArray(value) ? value : [];
}

function attrOf(node: XNode, name: string): string | undefined {
  const attrs = node[':@'];
  if (!attrs) return undefined;
  const value = attrs[`@_${name}`];
  return value === undefined ? undefined : String(value);
}

function textOf(node: XNode | undefined): string | undefined {
  if (!node) return undefined;
  const tag = tagOf(node);
  if (tag === '#text') return String(node['#text']);
  const value = node[tag];
  if (!Array.isArray(value)) return undefined;
  const textNode = value.find((c) => tagOf(c) === '#text');
  return textNode ? String(textNode['#text']) : undefined;
}

function firstChild(node: XNode, tag: string): XNode | undefined {
  return kidsOf(node).find((c) => tagOf(c) === tag);
}

function allChildren(node: XNode, tag: string): XNode[] {
  return kidsOf(node).filter((c) => tagOf(c) === tag);
}

/** 收集全树中所有 <sound tempo>（用于判断是否存在变速） */
function collectTempos(nodes: XNode[], out: number[] = []): number[] {
  for (const node of nodes) {
    if (tagOf(node) === 'sound') {
      const raw = attrOf(node, 'tempo');
      const value = raw ? Number(raw) : NaN;
      if (Number.isFinite(value) && value > 0) out.push(value);
    }
    const kids = kidsOf(node);
    if (kids.length > 0) collectTempos(kids, out);
  }
  return out;
}

/** 全树中是否存在某标签（如 repeat） */
function hasTag(nodes: XNode[], tag: string): boolean {
  for (const node of nodes) {
    if (tagOf(node) === tag) return true;
    const kids = kidsOf(node);
    if (kids.length > 0 && hasTag(kids, tag)) return true;
  }
  return false;
}

/** 解压 .mxl，返回内部根 XML 文本 */
function unzipMxl(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  let rootPath: string | undefined;
  const container = files['META-INF/container.xml'];
  if (container) {
    const match = /full-path="([^"]+)"/.exec(decodeUtf8(container));
    if (match) rootPath = match[1];
  }
  if (!rootPath || !files[rootPath]) {
    rootPath = Object.keys(files).find(
      (name) => name.toLowerCase().endsWith('.xml') && !name.startsWith('META-INF'),
    );
  }
  if (!rootPath || !files[rootPath]) throw new Error('.mxl 压缩包中未找到乐谱 XML');
  return decodeUtf8(files[rootPath]);
}

export function parseMusicXml(content: string | Uint8Array, id: string): Score {
  const xml = typeof content === 'string' ? content : unzipMxl(content);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });

  let parsed: XNode[];
  try {
    parsed = parser.parse(xml) as XNode[];
  } catch (err) {
    throw new Error(`MusicXML 解析失败：${(err as Error).message}`);
  }

  const root = parsed.find((node) => tagOf(node) === 'score-partwise');
  if (!root) throw new Error('仅支持 score-partwise 格式的 MusicXML');

  const parts = kidsOf(root).filter((c) => tagOf(c) === 'part');
  const part = parts[0];
  if (!part) throw new Error('MusicXML 中没有 part（声部）');
  const measures = kidsOf(part).filter((c) => tagOf(c) === 'measure');
  if (measures.length === 0) throw new Error('MusicXML 中没有小节');

  const diagnostics: ScoreDiagnostic[] = [];
  if (parts.length > 1) {
    diagnostics.push({ code: 'musicxml.multiPart', message: `仅解析第一个声部，忽略其余 ${parts.length - 1} 个` });
  }

  const ppq = DEFAULT_PPQ;
  let divisions = 1;
  let cursor = 0;
  let beats = 4;
  let beatType = 4;
  let fifths: number | undefined;

  // 原始音符（尚未归一化）：携带声部与延音线标记，供后续单旋律归一化
  interface RawNote {
    midi: number;
    startTicks: number;
    durationTicks: number;
    voice: string;
    tieStart: boolean;
    tieStop: boolean;
    tieContinue: boolean;
  }
  const raw: RawNote[] = [];
  // 当前起始组（用于和弦合并）：groupOnset 为该组起始，groupIndex 指回组内音
  let groupIndex = -1;
  let groupOnset = -1;
  const resetGroup = (): void => {
    groupIndex = -1;
    groupOnset = -1;
  };

  const ticksOf = (durationText: string | undefined): number => {
    const value = Number(durationText ?? 0);
    if (!Number.isFinite(value) || value <= 0) return ppq;
    return Math.round((value / divisions) * ppq);
  };

  for (const measure of measures) {
    for (const child of kidsOf(measure)) {
      const tag = tagOf(child);

      if (tag === 'attributes') {
        const divisionsText = textOf(firstChild(child, 'divisions'));
        if (divisionsText) {
          const value = Number(divisionsText);
          if (Number.isFinite(value) && value > 0) divisions = value;
        }
        const time = firstChild(child, 'time');
        if (time) {
          beats = Number(textOf(firstChild(time, 'beats')) ?? beats) || beats;
          beatType = Number(textOf(firstChild(time, 'beat-type')) ?? beatType) || beatType;
        }
        const key = firstChild(child, 'key');
        if (key) {
          const fifthsText = textOf(firstChild(key, 'fifths'));
          if (fifthsText !== undefined) fifths = Number(fifthsText);
        }
        continue;
      }

      if (tag === 'backup') {
        cursor = Math.max(0, cursor - ticksOf(textOf(firstChild(child, 'duration'))));
        resetGroup();
        continue;
      }

      if (tag === 'forward') {
        cursor += ticksOf(textOf(firstChild(child, 'duration')));
        resetGroup();
        continue;
      }

      if (tag !== 'note') continue;

      if (firstChild(child, 'grace')) continue; // 装饰音不计时

      const durationTicks = ticksOf(textOf(firstChild(child, 'duration')));

      if (firstChild(child, 'rest')) {
        cursor += durationTicks;
        resetGroup();
        continue;
      }

      const pitch = firstChild(child, 'pitch');
      if (!pitch) {
        cursor += durationTicks;
        resetGroup();
        continue;
      }
      const stepText = (textOf(firstChild(pitch, 'step')) ?? 'C').toUpperCase();
      const stepPc = STEP_PC[stepText];
      if (stepPc === undefined) continue;
      const alter = Number(textOf(firstChild(pitch, 'alter')) ?? 0) || 0;
      const octave = Number(textOf(firstChild(pitch, 'octave')) ?? 4);
      const midi = (octave + 1) * 12 + stepPc + alter;
      if (midi < 0 || midi > 127) continue;

      const voice = textOf(firstChild(child, 'voice')) ?? '1';
      const tieTypes = allChildren(child, 'tie').map((t) => attrOf(t, 'type') ?? '');

      // 和弦：与当前起始组同刻，只保留最高音，且**不推进游标**
      if (firstChild(child, 'chord') && groupIndex >= 0 && raw[groupIndex].startTicks === groupOnset) {
        if (midi > raw[groupIndex].midi) {
          raw[groupIndex].midi = midi;
          raw[groupIndex].durationTicks = durationTicks;
        }
        continue;
      }

      raw.push({
        midi,
        startTicks: cursor,
        durationTicks,
        voice,
        tieStart: tieTypes.includes('start'),
        tieStop: tieTypes.includes('stop'),
        tieContinue: tieTypes.includes('continue'),
      });
      groupIndex = raw.length - 1;
      groupOnset = cursor;
      cursor += durationTicks;
    }
  }

  if (raw.length === 0) throw new Error('MusicXML 中未解析出任何音符');

  // ── 单旋律归一化：多声部时选音数最多的声部 ──────────────
  const voiceCount = new Map<string, number>();
  for (const note of raw) voiceCount.set(note.voice, (voiceCount.get(note.voice) ?? 0) + 1);
  const voices = [...voiceCount.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );
  const primaryVoice = voices[0][0];
  if (voiceCount.size > 1) {
    diagnostics.push({
      code: 'musicxml.multiVoice',
      message: `已选择主声部 ${primaryVoice}，忽略其余 ${voiceCount.size - 1} 个声部`,
    });
  }

  // 按时间排序后合并延音线（同一主声部内，不跨声部）
  const ordered = raw
    .filter((note) => note.voice === primaryVoice)
    .sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);

  const events: NoteEvent[] = [];
  let openTie: { midi: number; event: NoteEvent } | null = null;
  for (const note of ordered) {
    if (note.tieStop && openTie && openTie.midi === note.midi) {
      openTie.event.durationTicks += note.durationTicks;
      if (!(note.tieStart || note.tieContinue)) openTie = null;
      continue;
    }
    const event: NoteEvent = {
      id: `n${events.length}`,
      midi: note.midi,
      startTicks: note.startTicks,
      durationTicks: note.durationTicks,
    };
    events.push(event);
    openTie = note.tieStart || note.tieContinue ? { midi: note.midi, event } : null;
  }

  // 同起始去重：万一同声部出现同刻多音，保留最高音，保证单音吹奏不重叠
  const deduped: NoteEvent[] = [];
  for (const event of events) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.startTicks === event.startTicks) {
      if (event.midi > prev.midi) deduped[deduped.length - 1] = event;
    } else {
      deduped.push(event);
    }
  }

  // 残留重叠（同声部内时值交叠）则如实提示，不静默处理
  for (let i = 1; i < deduped.length; i += 1) {
    const prev = deduped[i - 1];
    if (deduped[i].startTicks < prev.startTicks + prev.durationTicks) {
      diagnostics.push({ code: 'musicxml.overlap', message: '同一声部内存在重叠音，已按单音处理' });
      break;
    }
  }

  if (deduped.length === 0) throw new Error('MusicXML 中未解析出任何音符');

  const tempos = collectTempos(parsed);
  if (new Set(tempos).size > 1) {
    diagnostics.push({ code: 'musicxml.tempoChange', message: '存在速度变化，当前按单一 BPM 处理' });
  }
  if (hasTag(parsed, 'repeat')) {
    diagnostics.push({ code: 'musicxml.repeat', message: '存在反复记号，当前按线性顺序演奏' });
  }

  const title =
    textOf(firstChild(root, 'movement-title')) ||
    textOf(firstChild(firstChild(root, 'work') ?? {}, 'work-title')) ||
    '未命名';

  deduped.sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);

  return {
    id,
    title,
    ppq,
    tempoBpm: tempos[0] ?? 120,
    timeSignature: [beats, beatType],
    keySignature: fifths !== undefined ? FIFTHS_TO_KEY[String(fifths)] : undefined,
    events: deduped,
    source: 'musicxml',
    diagnostics: makeDiagnostics(diagnostics),
  };
}
