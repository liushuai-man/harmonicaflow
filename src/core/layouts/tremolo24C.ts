import type { HarmonicaLayout, Hole } from '../model';
import { noteNameToMidi } from '../pitch';

/**
 * 24 孔复音口琴（C 调）— 常见亚洲式排列
 *
 * 来源：docs/TECH_DESIGN.md §4.1
 * ⚠️ 复音口琴排列因品牌/地区而异（Hohner / Seydel / 国产 24 孔并不一致），
 *    本表仅为默认预设，**需用实体琴校对**，App 设置页支持逐孔修改。
 *
 * 规则：奇数孔为吹、偶数孔为吸；吹排与吸排各自独立升序
 *      （因此存在“孔号大的音反而低”的情况）。
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

export const tremolo24C: HarmonicaLayout = {
  id: 'tremolo24C',
  name: '24 孔复音（C 调）',
  type: 'tremolo24',
  key: 'C',
  holes: buildHoles(),
  notes: '亚洲式常见排列；奇数孔吹、偶数孔吸。复音琴排列品牌差异大，请对照实体琴校对。',
};
