import type { HarmonicaLayout, Hole } from '../model';
import { noteNameToMidi } from '../pitch';

/**
 * 24 孔单音口琴（C 调）
 *
 * 来源：docs/TECH_DESIGN.md §4.4
 * 敦煌 Y2411 顺音阶版，用户确认每音区为 123456高音1、7，7 为吸音。
 * 第一孔 C4 是暂定绝对八度，需实体琴核验；不代表所有 24 孔琴。
 */
const BLOW_NOTES = ['C4', 'E4', 'G4', 'C5', 'C5', 'E5', 'G5', 'C6', 'C6', 'E6', 'G6', 'C7'];
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
  name: '敦煌 Y2411 单音 24 孔（C 调）',
  type: 'single24',
  key: 'C',
  holes: buildHoles(),
  notes: '顺音阶版，每组 123456高音1、7，奇吹偶吸。排列经用户确认；第一孔 C4 暂定，请对琴核验绝对八度。',
};
