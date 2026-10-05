import type { HarmonicaLayout, Hole } from '../model';
import { tremolo24C } from './tremolo24C';
import { diatonic10C } from './diatonic10C';
import { chromatic12C } from './chromatic12C';

export { tremolo24C, diatonic10C, chromatic12C };

/** 内置预设，顺序即设置页展示顺序 */
export const LAYOUTS: HarmonicaLayout[] = [tremolo24C, diatonic10C, chromatic12C];

export const DEFAULT_LAYOUT_ID = tremolo24C.id;

/**
 * 取预设。`overrides` 是用户在设置页校对后的音阶表覆盖（按 layoutId 存放），
 * 有覆盖时用它替换孔位数据 —— 排列始终是纯数据，算法里没有任何硬编码。
 */
export function getLayout(id: string, overrides?: Record<string, Hole[]>): HarmonicaLayout {
  const base = LAYOUTS.find((l) => l.id === id) ?? tremolo24C;
  const holes = overrides?.[base.id];
  return holes && holes.length > 0 ? { ...base, holes } : base;
}
