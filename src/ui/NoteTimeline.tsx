import { useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import type { TabAction, TabNote } from '../core/model';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';

/**
 * 音块时间轴（横向卷轴 / 纵向落块）
 *
 * 见 docs/TECH_DESIGN.md §7.3。要点：
 *   - **只有 1 个动画节点**：一个包裹 Svg 的 Animated.View 做整体平移，
 *     由 UI 线程上的共享值 positionMs 驱动，不触发 React 重渲染。
 *   - **窗口化**：每 500ms 在 JS 侧重算一次可视音块集合，只渲染该集合（< 40 个）。
 *   - 横/纵共用同一套定位计算，仅交换 X / Y 语义。
 */

export type TimelineOrientation = 'horizontal' | 'vertical';

/** 横向：每秒多少像素（方块长度 = 时值） */
const PX_PER_SEC_H = 90;
/** 纵向：每秒多少像素（方块高度 = 时值） */
const PX_PER_SEC_V = 160;
/** 可视窗口重算步长 */
const WINDOW_STEP_MS = 500;
/** 最短方块像素，避免极短音符看不见 */
const MIN_BLOCK_PX = 8;
/** 行/列内方块与边框的间距 */
const BLOCK_GAP = 3;

const COLORS: Record<TabAction, string> = {
  blow: '#F2994A',
  blowPush: '#F2C94C',
  draw: '#2F80ED',
  drawPush: '#56CCF2',
};

interface Block {
  note: TabNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NoteTimelineProps {
  notes: TabNote[];
  timeline: TimelineInfo;
  positionMs: SharedValue<number>;
  /** 口琴孔数，决定行/列数量 */
  holeCount: number;
  orientation: TimelineOrientation;
}

export function NoteTimeline({
  notes,
  timeline,
  positionMs,
  holeCount,
  orientation,
}: NoteTimelineProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [anchorMs, setAnchorMs] = useState(0);

  const isHorizontal = orientation === 'horizontal';

  // UI 线程上的播放位置 → 低频同步到 JS，用于重算可视窗口
  useAnimatedReaction(
    () => Math.floor(positionMs.value / WINDOW_STEP_MS),
    (bucket: number, previous: number | null) => {
      if (previous === null || bucket !== previous) {
        runOnJS(setAnchorMs)(bucket * WINDOW_STEP_MS);
      }
    },
    [WINDOW_STEP_MS],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width === size.width && height === size.height) return;
    setSize({ width, height });
  };

  const pxPerMs = (isHorizontal ? PX_PER_SEC_H : PX_PER_SEC_V) / 1000;

  const geometry = useMemo(() => {
    const { width, height } = size;
    if (width === 0 || height === 0) return null;
    const playhead = isHorizontal ? width * 0.28 : height * 0.82;
    const ahead = (isHorizontal ? width : height) * 1.5;
    return {
      width,
      height,
      playhead,
      ahead,
      canvasW: isHorizontal ? playhead + ahead : width,
      canvasH: isHorizontal ? height : ahead + playhead,
    };
  }, [size, isHorizontal]);

  const blocks = useMemo<Block[]>(() => {
    if (!geometry) return [];
    const rowSize = (isHorizontal ? geometry.height : geometry.width) / holeCount;
    const result: Block[] = [];
    for (const note of notes) {
      const startMs = note.startTicks * timeline.msPerTick;
      const durationMs = note.durationTicks * timeline.msPerTick;
      const lead = (startMs + LEAD_IN_MS - anchorMs) * pxPerMs;
      if (isHorizontal) {
        const x = geometry.playhead + lead;
        const w = Math.max(durationMs * pxPerMs, MIN_BLOCK_PX);
        if (x + w <= 0 || x >= geometry.canvasW) continue;
        result.push({
          note,
          x,
          y: (holeCount - note.hole) * rowSize + BLOCK_GAP / 2,
          w,
          h: Math.max(rowSize - BLOCK_GAP, 1),
        });
      } else {
        const bottom = geometry.ahead - lead;
        const h = Math.max(durationMs * pxPerMs, MIN_BLOCK_PX);
        const y = bottom - h;
        if (y >= geometry.canvasH || bottom <= 0) continue;
        result.push({
          note,
          x: (note.hole - 1) * rowSize + BLOCK_GAP / 2,
          y,
          w: Math.max(rowSize - BLOCK_GAP, 1),
          h,
        });
      }
    }
    return result;
  }, [notes, timeline.msPerTick, anchorMs, pxPerMs, holeCount, isHorizontal, geometry]);

  const animatedStyle = useAnimatedStyle(() => {
    const delta = (positionMs.value - anchorMs) * pxPerMs;
    if (isHorizontal) return { transform: [{ translateX: -delta }] };
    const base = (geometry?.playhead ?? 0) - (geometry?.ahead ?? 0);
    return { transform: [{ translateY: base + delta }] };
  }, [anchorMs, pxPerMs, isHorizontal, geometry?.playhead, geometry?.ahead]);

  // 行/列太窄时省略方块内文字，避免糊成一片
  const rowPx = geometry ? (isHorizontal ? geometry.height : geometry.width) / holeCount : 0;
  const showLabels = rowPx >= 22;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {geometry !== null ? (
        <>
          <Animated.View
            style={[
              styles.canvas,
              { width: geometry.canvasW, height: geometry.canvasH },
              animatedStyle,
            ]}
          >
            <Svg width={geometry.canvasW} height={geometry.canvasH}>
              {blocks.map((block) => {
                const { note } = block;
                const fill = note.feasible ? COLORS[note.action] : '#E6E6E6';
                return (
                  <Rect
                    key={note.id}
                    x={block.x}
                    y={block.y}
                    width={block.w}
                    height={block.h}
                    rx={3}
                    fill={fill}
                    stroke={note.feasible ? 'transparent' : '#9E9E9E'}
                    strokeWidth={note.feasible ? 0 : 1.5}
                    strokeDasharray={note.feasible ? undefined : '3 3'}
                  />
                );
              })}
              {blocks.map((block) => {
                const { note } = block;
                const labelFits = showLabels && block.w >= 26 && block.h >= 14;
                if (!labelFits) return null;
                const fill = note.feasible ? '#FFFFFF' : '#666666';
                if (isHorizontal) {
                  return (
                    <SvgText
                      key={`${note.id}-label`}
                      x={block.x + 5}
                      y={block.y + block.h / 2 + 4}
                      fontSize={11}
                      fill={fill}
                    >
                      {`${note.hole}·${note.noteName}`}
                    </SvgText>
                  );
                }
                return (
                  <SvgText
                    key={`${note.id}-label`}
                    x={block.x + block.w / 2}
                    y={block.y + 13}
                    fontSize={10}
                    fill={fill}
                    textAnchor="middle"
                  >
                    {`${note.hole}·${note.noteName}`}
                  </SvgText>
                );
              })}
            </Svg>
          </Animated.View>
          <View
            pointerEvents="none"
            style={
              isHorizontal
                ? [styles.playhead, { left: geometry.playhead, top: 0, bottom: 0, width: 2 }]
                : [styles.playhead, { top: geometry.playhead, left: 0, right: 0, height: 2 }]
            }
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  playhead: {
    position: 'absolute',
    backgroundColor: '#EB5757',
    borderRadius: 1,
  },
});
