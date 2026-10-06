import type { ReactNode } from 'react';

import type { TabAction } from '../../core/model';

/**
 * 音块触碰判定线的特效接口（见 docs/TECH_DESIGN.md §7.5）
 *
 * 设计为可插拔：新增特效只需实现 `TimelineEffect` 并注册到 registry，
 * 无需改动 NoteTimeline。以后可在此扩展"按音高/连击变化"的多种特效。
 */

export interface EffectContext {
  /** 特效实例唯一 id（用于 key 与移除） */
  instanceId: number;
  /** 触发列的水平中心（容器坐标） */
  x: number;
  /** 判定线的纵向位置（容器坐标） */
  y: number;
  /** 该列可用宽度，特效尺寸参考它做自适应 */
  columnWidth: number;
  /** 该音所在吹法对应的主题色 */
  color: string;
  action: TabAction;
  /** 特效播放完毕回调，负责把实例从时间轴移除 */
  onDone: (instanceId: number) => void;
}

export interface TimelineEffect {
  name: string;
  /** 单次特效持续时长（ms） */
  durationMs: number;
  render(ctx: EffectContext): ReactNode;
}
