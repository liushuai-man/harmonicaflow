import type { HarmonicaLayout, Hole } from '../model';
import { noteNameToMidi } from '../pitch';

/**
 * 24 孔单音口琴（C 调）
 *
 * 来源：docs/TECH_DESIGN.md §4.4
 * ⚠️「单音」指每个音孔单簧发声（复音为双簧微失谐）；**音位排列与 24 孔复音一致**：
 *    1/3/5 吹、2/4/6/7 吸，吹排与吸排各自独立升序。排列因品牌而异，请对照实体琴在设置页逐孔校对。
 */
const BLOW_NOTES = ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7', 'E7', 'G7'];
const DRAW_NOTES = ['D4', 'F4', 'A4', 'B4', 'D5', 'F5', 'A5', 'B5', 'D6', 'F6', 'A6', 'B6'];

function buildHoles(): Hole[] {
  const holes: Hole[] = [];
  for (let i = 0; i < BLOW_NOTES.length; i += 1) {
    holes.push({ index: i * 2 + 1, blow: noteNameToMidi(BLOW_NOTES[i]), draw: null });
    holes.push({ index: i * 2 + 2, blow: null, draw: noteNameToMidi(DRAW_NOTES[i]) });
  }
  return holes;
}

export const single24C: HarmonicaLayout = {
  id: 'single24C',
  name: '单音 24 孔（C 调）',
  type: 'single24',
  key: 'C',
  holes: buildHoles(),
  notes: '单簧，音位与 24 孔复音一致（奇吹偶吸）。请对照实体琴校对。',
};