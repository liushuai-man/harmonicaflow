import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import type { NoteEvent, Score } from '../model';
import { decodeUtf8 } from '../text';
import { DEFAULT_PPQ } from './json';

/**
 * MusicXML 解析器
 *
 * 目标：**只提取音符事件**（音高 + 起始 + 时值），不做记谱排版渲染。
 * 用 fast-xml-parser 的 preserveOrder 模式，保留 measure 内元素顺序，
 * 以便正确处理 backup / forward / chord / tie。
 *
 * 范围（见 docs/TECH_DESIGN.md §5）：
 *   - 只取第一个 part、单一声部（melody）
 *   - 同一 start 上的和弦只保留最高音（口琴单音吹奏）
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

/** 在整棵树里找第一个带 tempo 属性的 <sound> */
function findTempo(nodes: XNode[]): number | null {
  for (const node of nodes) {
    if (tagOf(node) === 'sound') {
      const raw = attrOf(node, 'tempo');
      if (raw) {
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
    const kids = kidsOf(node);
    if (kids.length > 0) {
      const found = findTempo(kids);
      if (found !== null) return found;
    }
  }
  return null;
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

  const part = kidsOf(root).find((c) => tagOf(c) === 'part');
  if (!part) throw new Error('MusicXML 中没有 part（声部）');
  const measures = kidsOf(part).filter((c) => tagOf(c) === 'measure');
  if (measures.length === 0) throw new Error('MusicXML 中没有小节');

  const ppq = DEFAULT_PPQ;
  const events: NoteEvent[] = [];
  let divisions = 1;
  let positionTicks = 0;
  let beats = 4;
  let beatType = 4;
  let fifths: number | undefined;
  let lastIndex = -1;
  let openTie: { midi: number; event: NoteEvent } | null = null;

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
        positionTicks = Math.max(0, positionTicks - ticksOf(textOf(firstChild(child, 'duration'))));
        lastIndex = -1;
        continue;
      }

      if (tag === 'forward') {
        positionTicks += ticksOf(textOf(firstChild(child, 'duration')));
        lastIndex = -1;
        continue;
      }

      if (tag !== 'note') continue;

      if (firstChild(child, 'grace')) continue; // 装饰音不计时

      const durationTicks = ticksOf(textOf(firstChild(child, 'duration')));

      if (firstChild(child, 'rest')) {
        positionTicks += durationTicks;
        lastIndex = -1;
        openTie = null;
        continue;
      }

      const pitch = firstChild(child, 'pitch');
      if (!pitch) {
        positionTicks += durationTicks;
        lastIndex = -1;
        continue;
      }
      const stepText = (textOf(firstChild(pitch, 'step')) ?? 'C').toUpperCase();
      const stepPc = STEP_PC[stepText];
      if (stepPc === undefined) continue;
      const alter = Number(textOf(firstChild(pitch, 'alter')) ?? 0) || 0;
      const octave = Number(textOf(firstChild(pitch, 'octave')) ?? 4);
      const midi = (octave + 1) * 12 + stepPc + alter;
      if (midi < 0 || midi > 127) continue;

      // 和弦：与上一个音同时开始，只保留最高音
      if (firstChild(child, 'chord')) {
        const previous = events[lastIndex];
        if (previous && previous.startTicks === positionTicks && midi > previous.midi) {
          previous.midi = midi;
          previous.durationTicks = durationTicks;
        }
        continue;
      }

      const tieTypes = allChildren(child, 'tie').map((t) => attrOf(t, 'type') ?? '');
      const isTieStop = tieTypes.includes('stop');
      const keepsTie = tieTypes.includes('start') || tieTypes.includes('continue');

      if (isTieStop && openTie && openTie.midi === midi) {
        openTie.event.durationTicks += durationTicks;
        openTie = keepsTie ? openTie : null;
      } else {
        const event: NoteEvent = {
          id: `n${events.length}`,
          midi,
          startTicks: positionTicks,
          durationTicks,
        };
        events.push(event);
        lastIndex = events.length - 1;
        openTie = keepsTie ? { midi, event } : null;
      }
      positionTicks += durationTicks;
    }
  }

  if (events.length === 0) throw new Error('MusicXML 中未解析出任何音符');

  const tempo = findTempo(parsed);
  const title =
    textOf(firstChild(root, 'movement-title')) ||
    textOf(firstChild(firstChild(root, 'work') ?? {}, 'work-title')) ||
    '未命名';

  events.sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);

  return {
    id,
    title,
    ppq,
    tempoBpm: tempo ?? 120,
    timeSignature: [beats, beatType],
    keySignature: fifths !== undefined ? FIFTHS_TO_KEY[String(fifths)] : undefined,
    events,
    source: 'musicxml',
  };
}
