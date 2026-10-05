import type { HarmonicaLayout, Hole } from '../model';
import { noteNameToMidi } from '../pitch';

/**
 * 12 孔半音阶口琴（C 调）— Solo 调音
 *
 * 来源：docs/TECH_DESIGN.md §4.3
 * 推键（push）使音高 +1 半音：blowPush = blow + 1、drawPush = draw + 1。
 */
const BLOW_NOTES = ['C4', 'E4', 'G4', 'C5', 'C5', 'E5', 'G5', 'C6', 'C6', 'E6', 'G6', 'C7'];
const DRAW_NOTES = ['D4', 'F4', 'A4', 'B4', 'D5', 'F5', 'A5', 'B5', 'D6', 'F6', 'A6', 'B6'];

function buildHoles(): Hole[] {
  return BLOW_NOTES.map((blow, i) => {
    const blowMidi = noteNameToMidi(blow);
    const drawMidi = noteNameToMidi(DRAW_NOTES[i]);
    return {
      index: i + 1,
      blow: blowMidi,
      draw: drawMidi,
      blowPush: blowMidi + 1,
      drawPush: drawMidi + 1,
    };
  });
}

export const chromatic12C: HarmonicaLayout = {
  id: 'chromatic12C',
  name: '半音阶 12 孔（C 调）',
  type: 'chromatic12',
  key: 'C',
  holes: buildHoles(),
  notes: 'Solo 调音；推键升半音。',
};
