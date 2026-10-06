import { pulseEffect } from './pulse';
import type { TimelineEffect } from './types';

/**
 * 特效注册表（见 docs/TECH_DESIGN.md §7.5）
 *
 * 以后新增特效（如按音高变化的粒子、连击光晕）只要实现 TimelineEffect
 * 并在这里登记，即可被时间轴按名字取用。
 */

export const EFFECTS: Record<string, TimelineEffect> = {
  [pulseEffect.name]: pulseEffect,
};

export const DEFAULT_EFFECT_NAME = pulseEffect.name;

export function getEffect(name: string = DEFAULT_EFFECT_NAME): TimelineEffect {
  return EFFECTS[name] ?? pulseEffect;
}
