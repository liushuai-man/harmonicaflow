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
import { LAYOUTS, keyShift, single24C, transposeHoles } from '../src/core/layouts';
import type { Score } from '../src/core/model';
import { parse } from '../src/core/parsers';
import {
  formatJianpu,
  keySignatureToTonicPc,
  midiToJianpu,
  midiToNoteName,
} from '../src/core/pitch';
import {
  AHEAD_RATIO_MAX,
  K_MIN,
  LABEL_AREA_H,
  LABEL_AREA_W,
  PX_PER_SEC,
  VIEW_ANGLE_MAX,
  computeViewGeometry,
  laneOffset,
  resolveFlow,
  timeOffset,
  type FlowDirection,
  type FlowSetting,
  type Viewport,
} from '../src/core/visual';

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

// ── T0 语义回归样本（见 docs/PLAN.md T0 / ACCEPTANCE.md §3.0）──

/** ABC：G 调 F 应升为 F#，显式 =F 还原；Q:1/8=120 折算为 60 BPM */
const ABC_KEY_SAMPLE = `X:1
T:G 调与节拍单位
M:4/4
L:1/4
Q:1/8=120
K:G
F2 =F2 |
`;

/** ABC：反复记号应被提示为「可用但简化」 */
const ABC_REPEAT_SAMPLE = `X:1
T:带反复
M:4/4
L:1/4
K:C
|: C D E F :|
`;

/** MusicXML：和弦只保留最高音（含游标不推进），后续音起始正确 */
const MUSICXML_CHORD_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration></note>
      <note><chord/><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration></note>
    </measure>
  </part>
</score-partwise>
`;

/** MusicXML：同 part 两个 voice（backup 回退），归并为主声部且不产生重叠 */
const MUSICXML_VOICE_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>2</voice></note>
    </measure>
  </part>
</score-partwise>
`;

/** MusicXML：第二个 part 应被忽略并提示 */
const MUSICXML_MULTIPART_SAMPLE = MUSICXML_CHORD_SAMPLE.replace(
  '</score-partwise>',
  `<part id="P2"><measure number="1">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure></part>
</score-partwise>`,
);

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
  console.log(`- 诊断：${score.diagnostics.support}${score.diagnostics.notes.length ? `（${score.diagnostics.notes.map((n) => n.message).join('；')}）` : ''}`);

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

// ── core/visual：边界与视角几何自检（见 docs/TECH_DESIGN.md §9.1 / §7.11）──

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` → ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

/** T0 谱面语义与诊断自检（见 docs/PLAN.md T0 / ACCEPTANCE.md §3.0） */
function verifyParsers(): void {
  console.log('\n### T0 谱面语义与诊断自检');

  // T0-1 ABC 调号与 Q 节拍单位
  const abcKey = parse(ABC_KEY_SAMPLE, 'key.abc', 'abc-key');
  check('ABC Q:1/8=120 折算为 60 BPM', abcKey.tempoBpm === 60, `${abcKey.tempoBpm}`);
  check('G 调未记号的 F 升为 F#(66)', abcKey.events[0]?.midi === 66, `${abcKey.events[0]?.midi}`);
  check('显式 =F 还原为 F(65)', abcKey.events[1]?.midi === 65, `${abcKey.events[1]?.midi}`);

  // T0-2 MusicXML 和弦与多声部
  const chord = parse(MUSICXML_CHORD_SAMPLE, 'chord.musicxml', 'xml-chord');
  check(
    '和弦只保留最高音',
    chord.events.length === 2 && chord.events[0]?.midi === 76,
    `midi=[${chord.events.map((e) => e.midi).join(',')}]`,
  );
  check('和弦不推进游标（后续音起始正确）', chord.events[1]?.startTicks === 480, `${chord.events[1]?.startTicks}`);

  const voice = parse(MUSICXML_VOICE_SAMPLE, 'voice.musicxml', 'xml-voice');
  const noOverlap = voice.events.every(
    (event, i) => i === 0 || event.startTicks >= voice.events[i - 1].startTicks + voice.events[i - 1].durationTicks,
  );
  check('多声部归并为单声部且无重叠', voice.events.length === 1 && noOverlap, `${voice.events.length} 个音`);
  check(
    '多声部有诊断提示',
    voice.diagnostics.notes.some((n) => n.code === 'musicxml.multiVoice'),
    voice.diagnostics.support,
  );

  // T0-3 支持边界与诊断契约
  const repeat = parse(ABC_REPEAT_SAMPLE, 'repeat.abc', 'abc-repeat');
  check(
    'ABC 反复记号提示为 simplified',
    repeat.diagnostics.support === 'simplified' && repeat.diagnostics.notes.some((n) => n.code === 'abc.repeat'),
  );
  const multiPart = parse(MUSICXML_MULTIPART_SAMPLE, 'multipart.musicxml', 'xml-multipart');
  check('多余 part 被忽略并提示', multiPart.diagnostics.notes.some((n) => n.code === 'musicxml.multiPart'));
  const jsonFull = parse(loadSample('assets/songs/twinkle.json'), 'twinkle.json', 'diag-json');
  check('JSON 完全支持（无诊断）', jsonFull.diagnostics.support === 'full' && jsonFull.diagnostics.notes.length === 0);
}

/** 口琴预设与调号移调自检（见 docs/TECH_DESIGN.md §4.4） */
function verifyLayouts(): void {
  console.log('\n### 口琴预设与调号移调自检');
  check('单音 24 孔共 24 孔', single24C.holes.length === 24, `${single24C.holes.length}`);
  check('单音 24 孔默认 C 调', single24C.key === 'C', single24C.key);
  check('C→G 就近移调 −5 半音', keyShift('C', 'G') === -5, `${keyShift('C', 'G')}`);
  check('C→F 就近移调 +5 半音', keyShift('C', 'F') === 5, `${keyShift('C', 'F')}`);
  const upFifth = transposeHoles(single24C.holes, 7);
  check('整体 +7：孔 1 吹 C4(60) → G4(67)', upFifth[0]?.blow === 67, `${upFifth[0]?.blow}`);
  check('整体 +7：孔 2 吸 D4(62) → A4(69)', upFifth[1]?.draw === 69, `${upFifth[1]?.draw}`);
}

function verifyCoreVisual(): void {
  // 1) 边界：视觉参数与几何必须是平台无关纯 TS，才能被 Node 直接验证、被多端复用
  for (const file of ['params.ts', 'flow.ts', 'index.ts']) {
    const source = readFileSync(resolve(process.cwd(), 'src/core/visual', file), 'utf8');
    const clean = !/from\s+['"](react|react-native|expo)/.test(source);
    check(`core/visual/${file} 不依赖 React / RN / Expo`, clean);
  }

  // 2) 方向解析：auto 依宽高比选向，视口未就绪时回落 down（不产生 0 宽布局）
  const flowChecks: [FlowSetting, Viewport, FlowDirection][] = [
    ['down', { width: 390, height: 844 }, 'down'],
    ['right', { width: 390, height: 844 }, 'right'],
    ['auto', { width: 390, height: 844 }, 'down'],
    ['auto', { width: 900, height: 500 }, 'right'],
    ['auto', { width: 0, height: 0 }, 'down'],
  ];
  for (const [setting, viewport, expected] of flowChecks) {
    const actual = resolveFlow(setting, viewport);
    check(
      `方向 ${setting} @ ${viewport.width}×${viewport.height}`,
      actual === expected,
      `${actual}（期望 ${expected}）`,
    );
  }

  const viewport: Viewport = { width: 390, height: 844 };
  const laneCount = 24;
  const totalMs = 60000;
  const leadInMs = 2000;
  const pxPerMs = PX_PER_SEC / 1000;

  // 3) 平铺（θ = 0）：不加透视
  const flat = computeViewGeometry({
    direction: 'down',
    viewport,
    laneCount,
    angleDeg: 0,
    totalMs,
    leadInMs,
  });
  check('平铺分支不加透视', flat !== null && flat.tilt === null);
  if (flat) {
    const expectedPlayhead = viewport.height - LABEL_AREA_H;
    const expectedSongLen = (totalMs + leadInMs) * pxPerMs + expectedPlayhead;
    check('down 判定线 = 高度 − 标注区', flat.playhead === expectedPlayhead, `${flat.playhead}`);
    check('down 平移轴为 y', flat.axis === 'y');
    check('画布总长 = (时长+留白)·px + 判定线', flat.songLen === expectedSongLen, `${flat.songLen}`);
    check('laneOffset(1) = BLOCK_GAP/2', laneOffset(1, flat.rowSize) === 1.5);
    check(
      'timeOffset 为绝对坐标',
      timeOffset(0, leadInMs, flat.songLen, pxPerMs) === flat.songLen - leadInMs * pxPerMs,
    );
  }

  // 4) 横向：判定线取宽度侧，平移轴为 x
  const sideways = computeViewGeometry({
    direction: 'right',
    viewport,
    laneCount,
    angleDeg: 22,
    totalMs,
    leadInMs,
  });
  check('right 判定线 = 宽度 − 标注区', sideways?.playhead === viewport.width - LABEL_AREA_W);
  check('right 平移轴为 x', sideways?.axis === 'x');
  check('right 透视轴为 Y', sideways?.tilt?.axis === 'Y');

  // 5) 极端角度 + 极小 k：aheadRatio 不发散、角度被夹在上限
  const extreme = computeViewGeometry({
    direction: 'down',
    viewport,
    laneCount,
    angleDeg: 89,
    totalMs,
    leadInMs,
    k: 1,
  });
  check('角度被夹在 VIEW_ANGLE_MAX', extreme?.tilt?.degree === VIEW_ANGLE_MAX, `${extreme?.tilt?.degree}`);
  check(
    'k 被夹到 K_MIN，ahead 有硬上限且有限',
    extreme !== null &&
      Number.isFinite(extreme.ahead) &&
      extreme.ahead <= extreme.playhead * AHEAD_RATIO_MAX &&
      K_MIN > 1,
    `ahead=${extreme?.ahead.toFixed(1)}`,
  );
  check('极端角度下透视距离仍为正', (extreme?.tilt?.perspective ?? 0) > 0);

  // 6) 视口/列数未就绪时返回 null，调用方跳过渲染
  check(
    '视口未就绪返回 null',
    computeViewGeometry({ direction: 'down', viewport: { width: 0, height: 0 }, laneCount, angleDeg: 22, totalMs, leadInMs }) === null,
  );
  check(
    '列数为 0 返回 null',
    computeViewGeometry({ direction: 'down', viewport, laneCount: 0, angleDeg: 22, totalMs, leadInMs }) === null,
  );
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

  // 简谱自检（见 docs/TECH_DESIGN.md §7.6）
  const jianpuChecks: [number, number, string][] = [
    [60, 0, '1'], // C 调 C4 → 1
    [62, 0, '2'], // C 调 D4 → 2
    [61, 0, '#1'], // C 调 C#4 → #1
    [72, 0, '1·'], // C 调高八度 C5 → 1·
    [48, 0, '·1'], // C 调低八度 C3 → ·1
    [67, 7, '1'], // G 调 G4 → 1
    [79, 7, '1·'], // G 调高八度 G5 → 1·
  ];
  for (const [midi, tonicPc, expected] of jianpuChecks) {
    const actual = formatJianpu(midiToJianpu(midi, tonicPc));
    const ok = actual === expected;
    console.log(`${ok ? '✓' : '✗'} 简谱 ${midi}(主音${tonicPc}) → ${actual}（期望 ${expected}）`);
    if (!ok) process.exitCode = 1;
  }

  // 调号 → 主音自检
  const keyChecks: [string, number][] = [['C', 0], ['G', 7], ['F', 5], ['Bb', 10], ['A', 9]];
  for (const [key, expected] of keyChecks) {
    const actual = keySignatureToTonicPc(key);
    const ok = actual === expected;
    console.log(`${ok ? '✓' : '✗'} 调号 ${key} → 主音音级 ${actual}（期望 ${expected}）`);
    if (!ok) process.exitCode = 1;
  }

  // 视觉几何自检（见 docs/TECH_DESIGN.md §7.11 / §9.1）
  verifyParsers();
  verifyLayouts();

  console.log('\n### core/visual 方向与视角几何自检');
  verifyCoreVisual();
}

main();
