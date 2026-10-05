import type { HarmonicaLayout, Hole } from '../model';
import { noteNameToMidi } from '../pitch';

/**
 * 10 孔布鲁斯口琴（C 调）— Richter 标准调音
 *
 * 来源：docs/TECH_DESIGN.md §4.2（Richter 调音为业内标准，可靠）
 * 本版**不实现压音（bending）**，因此低音区缺失音与 F/A 等音会被标记为不可吹。
 */
const BLOW_NOTES = ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'];
const DRAW_NOTES = ['D4', 'G4', 'B4', 'D5', 'F5', 'A5', 'B5', 'D6', 'F6', 'A6'];

function buildHoles(): Hole[] {
  return BLOW_NOTES.map((blow, i) => ({
    index: i + 1,
    blow: noteNameToMidi(blow),
    draw: noteNameToMidi(DRAW_NOTES[i]),
  }));
}

export const diatonic10C: HarmonicaLayout = {
  id: 'diatonic10C',
  name: '10 孔布鲁斯（C 调）',
  type: 'diatonic10',
  key: 'C',
  holes: buildHoles(),
  notes: 'Richter 标准调音。不支持压音，缺失音会被标记为不可吹。',
};
