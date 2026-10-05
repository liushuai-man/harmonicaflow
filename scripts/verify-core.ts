/**
 * 核心逻辑验证脚本（无需 UI）
 *
 *   npm run verify
 *
 * 走通 parse → arrange，把结果打印成 markdown 表格供人工核对
 * （音高、时值、孔位、吹吸是否正确）。见 docs/TECH_DESIGN.md §9。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { strToU8, zipSync } from 'fflate';

import { arrange } from '../src/core/arrange';
import { LAYOUTS } from '../src/core/layouts';
import type { Score } from '../src/core/model';
import { parse } from '../src/core/parsers';
import { midiToNoteName } from '../src/core/pitch';

const ABC_SAMPLE = `X:1
T:欢乐颂（ABC 片段）
M:4/4
L:1/4
Q:1/4=100
K:C
E E F G | G F E D | C C D E | E3/2 D/2 D2 |]
`;

const MUSICXML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <movement-title>小星星（MusicXML 片段）</movement-title>
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo="90"/></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><tie type="start"/></note>
    </measure>
    <measure number="3">
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>2</duration><tie type="stop"/></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>2</duration><chord/></note>
      <note><rest/><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>
`;

function loadSample(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** 把内联 MusicXML 样本包成 .mxl（含 META-INF/container.xml），用于验证压缩谱面导入 */
function buildMxl(withContainer: boolean): Uint8Array {
  const files: Record<string, Uint8Array> = { 'score.xml': strToU8(MUSICXML_SAMPLE) };
  if (withContainer) {
    files['META-INF/container.xml'] = strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<container><rootfiles><rootfile full-path="score.xml"' +
        ' media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>',
    );
  }
  return zipSync(files);
}

function describe(score: Score): void {
  console.log(`\n### ${score.title}（来源：${score.source}，ppq=${score.ppq}，tempo=${score.tempoBpm}）`);
  console.log(`- 音符数：${score.events.length}，拍号：${score.timeSignature.join('/')}，调号：${score.keySignature ?? '-'}`);

  for (const layout of LAYOUTS) {
    const { notes, stats } = arrange(score, layout);
    console.log(`\n**${layout.name}**：可吹 ${stats.feasibleCount}/${stats.total}` +
      (stats.infeasibleNotes.length ? `，不可吹音：${stats.infeasibleNotes.join(' ')}` : ''));
    console.log('| # | 音名 | 起始tick | 时值tick | 孔位 | 吹/吸 | 可行 |');
    console.log('|---|---|---|---|---|---|---|');
    notes.slice(0, 8).forEach((note, i) => {
      console.log(`| ${i + 1} | ${note.noteName} | ${note.startTicks} | ${note.durationTicks} | ` +
        `${note.hole} | ${note.action} | ${note.feasible ? '✓' : '✗'} |`);
    });
    if (notes.length > 8) console.log(`| … | 共 ${notes.length} 个音 | | | | | |`);
  }
}

function main(): void {
  const twinkle = parse(loadSample('assets/songs/twinkle.json'), 'twinkle.json', 'twinkle');
  describe(twinkle);

  const ode = parse(loadSample('assets/songs/ode-to-joy.json'), 'ode-to-joy.json', 'ode');
  describe(ode);

  const abc = parse(ABC_SAMPLE, 'sample.abc', 'abc');
  describe(abc);

  const musicxml = parse(MUSICXML_SAMPLE, 'sample.musicxml', 'xml');
  describe(musicxml);

  // .mxl（压缩 MusicXML）：有 / 无 META-INF/container.xml 两条路径
  const mxl = parse(buildMxl(true), 'sample.mxl', 'mxl');
  describe(mxl);
  const mxlNoContainer = parse(buildMxl(false), 'sample.mxl', 'mxl2');

  for (const [label, score] of [
    ['.mxl（container.xml 指定根文件）', mxl],
    ['.mxl（无 container，回退查找首个 xml）', mxlNoContainer],
  ] as [string, Score][]) {
    const ok =
      score.events.length === musicxml.events.length &&
      score.events.every((event, i) => {
        const ref = musicxml.events[i];
        return event.midi === ref.midi && event.startTicks === ref.startTicks && event.durationTicks === ref.durationTicks;
      });
    console.log(`${ok ? '✓' : '✗'} ${label} → ${score.events.length} 个音，与未压缩结果一致`);
    if (!ok) process.exitCode = 1;
  }

  // 音名自检
  const checks: [string, number][] = [['C4', 60], ['A4', 69], ['Bb4', 70], ['C#5', 73], ['G7', 103]];
  for (const [name, expected] of checks) {
    const actual = parse(`{"format":"harmonicaflow-score","version":1,"notes":[{"note":"${name}","start":0,"duration":480}]}`, 'x.json', 'pitch-check').events[0].midi;
    const ok = actual === expected;
    console.log(`${ok ? '✓' : '✗'} 音名 ${name} → MIDI ${actual}（期望 ${expected}）`);
    if (!ok) process.exitCode = 1;
  }

  console.log(`\n✓ 解析与编配流程跑通（MIDI 60 = ${midiToNoteName(60)}）`);
}

main();
