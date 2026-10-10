import assert from 'node:assert/strict';
import { tileNote, tileSize, visibleTiles } from '../src/core/visual/tiles';
import { buildNotation, spellPitch } from '../src/core/notation';
import type { Score } from '../src/core/model';

const size = tileSize(3);
assert.equal(size, 512);
assert.ok(tileSize(8) * 8 <= 2048);
const first = visibleTiles(10_000, 2000, 0.16, size, 60_000);
assert.deepEqual(first, visibleTiles(10_000, 2000, 0.16, size, 3_600_000));
const long = Array.from({ length: 5 }, (_, i) => tileNote(100, 1800, i, size));
assert.equal(long.filter(p => p.label).length, 1);
assert.equal(long.filter(p => p.visible).length, 4);
assert.equal(tileNote(400, 800, 0, size).along - size,
  tileNote(400, 800, 1, size).along - 2 * size);
assert.equal(tileNote(512, 100, 0, size).visible, false);
assert.equal(tileNote(512, 100, 1, size).visible, true);
console.log('✓ 跟吹分片：有界尺寸、曲长无关、接缝连续、单一标签');

const score: Score = { id: 'notation', title: 'notation', source: 'json', ppq: 480, tempoBpm: 90,
  timeSignature: [4, 4], keySignature: 'G', diagnostics: { support: 'full', notes: [] }, events: [
    { id: 'sharp', midi: 66, startTicks: 0, durationTicks: 480 },
    { id: 'natural', midi: 65, startTicks: 480, durationTicks: 720 },
    { id: 'tied', midi: 67, startTicks: 1440, durationTicks: 960 },
  ] };
const notation = buildNotation(score);
assert.equal(notation.symbols[0].accidental, null);
assert.equal(notation.symbols[1].accidental, 0);
assert.equal(notation.symbols[1].dotted, true);
assert.ok(notation.symbols.some(s => s.step === null && s.start === 1200 && s.duration === 240));
const tied = notation.symbols.filter(s => s.id.startsWith('tied'));
assert.equal(tied.length, 2);
assert.equal(tied[0].tieOut, true);
assert.equal(tied[1].tieIn, true);
assert.equal(tied.reduce((sum, s) => sum + s.duration, 0), 960);
assert.equal(spellPitch(70, -2).alter, -1); // Bb in Bb major
assert.equal(spellPitch(60, 0).step, 28); // central C ledger line
const odd = buildNotation({ ...score, events: [{ id: 'odd', midi: 60, startTicks: 0, durationTicks: 160 }] });
assert.equal(odd.symbols[0].denominator, null);
assert.equal(odd.symbols[0].duration, 160);
assert.equal(odd.warnings.length, 1);
assert.deepEqual(buildNotation({ ...score, events: [] }).symbols, []);
console.log('✓ 五线谱：调号、还原、附点、休止、跨小节延音、非标准时值提示');
