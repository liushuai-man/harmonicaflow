import type { HarmonicaLayout, Hole } from '../model';
import { keySignatureToTonicPc, transpose } from '../pitch';
import { tremolo24C } from './tremolo24C';
import { single24C } from './single24C';
import { diatonic10C } from './diatonic10C';
import { chromatic12C } from './chromatic12C';

export { tremolo24C, single24C, diatonic10C, chromatic12C };

/** 内置预设，顺序即设置页展示顺序 */
export const LAYOUTS: HarmonicaLayout[] = [tremolo24C, single24C, diatonic10C, chromatic12C];

export const DEFAULT_LAYOUT_ID = tremolo24C.id;

/** 调号可选项（口琴常见调），供设置页选择 */
export const KEY_OPTIONS = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db',
] as const;

/**
 * 取预设。`overrides` 是用户在设置页校对后的音阶表覆盖（按 layoutId 存放），
 * 有覆盖时用它替换孔位数据 —— 排列始终是纯数据，算法里没有任何硬编码。
 * `keys` 同步已保存的调号元数据；孔位已在设置保存时移调，此处不重复移调。
 */
export function getLayout(id: string, overrides?: Record<string, Hole[]>, keys?: Record<string, string>): HarmonicaLayout {
  const base = LAYOUTS.find((l) => l.id === id) ?? tremolo24C;
  const holes = overrides?.[base.id];
  const key = KEY_OPTIONS.find((value) => value === keys?.[base.id]) ?? base.key;
  const effectiveHoles = holes && holes.length > 0 ? holes : base.holes;
  return {
    ...base,
    key,
    holes: effectiveHoles,
    name: base.name.replace(/\d+ 孔/, `${effectiveHoles.length} 孔`).replace(`${base.key} 调`, `${key} 调`),
  };
}

/** 由 `baseKey` 换到 `targetKey` 需要移动的半音数，取就近方向（-6..+6） */
export function keyShift(baseKey: string, targetKey: string): number {
  const delta = ((keySignatureToTonicPc(targetKey) - keySignatureToTonicPc(baseKey)) % 12 + 12) % 12;
  return delta > 6 ? delta - 12 : delta;
}

/** 整表移调：换调号时按半音平移所有孔位（超出 MIDI 范围或空孔保持为 null） */
export function transposeHoles(holes: Hole[], semitones: number): Hole[] {
  const shift = (midi: number | null | undefined): number | null =>
    typeof midi === 'number' ? transpose(midi, semitones) : null;
  return holes.map((hole) => {
    const next: Hole = {
      index: hole.index,
      blow: shift(hole.blow),
      draw: shift(hole.draw),
    };
    if (hole.blowPush !== undefined) next.blowPush = shift(hole.blowPush);
    if (hole.drawPush !== undefined) next.drawPush = shift(hole.drawPush);
    return next;
  });
}
