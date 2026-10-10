import assert from 'node:assert/strict';
import { tileNote, tileSize, visibleTiles } from '../src/core/visual/tiles';

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
