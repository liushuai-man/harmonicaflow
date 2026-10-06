import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import type { Hole, TabAction, TabNote } from '../core/model';
import { midiToJianpuText } from '../core/pitch';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';
import type { PerspectiveLevel } from '../store/library';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/palette';
import { getEffect } from './effects/registry';
import type { EffectContext } from './effects/types';

/**
 * 音块时间轴（纵向落块，见 docs/TECH_DESIGN.md §7.3–§7.6）
 *
 * 要点：
 *   - **只有 1 个动画节点**：一个包裹 Svg 的 Animated.View 做整体平移，
 *     由 UI 线程上的共享值 positionMs 驱动，不触发 React 重渲染。
 *   - **窗口化**：每 500ms 在 JS 侧重算一次可视音块集合，只渲染该集合（< 40 个）。
 *   - **透视**：包裹容器以判定线为原点做 rotateX，形成近大远小（§7.4）。
 *   - **简谱**：判定线下方按孔列标注该孔吹/吸的简谱度数（§7.6）。
 *   - **触碰特效**：positionMs 越过音符接触时刻时触发一次特效（§7.5）。
 */

/** 纵向：每秒多少像素（方块高度 = 时值） */
const PX_PER_SEC_V = 160;
/** 可视窗口重算步长 */
const WINDOW_STEP_MS = 500;
/** 最短方块像素，避免极短音符看不见 */
const MIN_BLOCK_PX = 8;
/** 列内方块与边框的间距 */
const BLOCK_GAP = 3;
/** 判定线下方简谱标注区高度 */
const LABEL_AREA_H = 42;
/** 一次前进跨越的音符数超过该值视为拖动进度，不补发特效 */
const MAX_BURST = 8;

/** 透视强度 → 参数；`perspective` 越小、角度越大，透视越强 */
const PERSPECTIVE_PARAMS: Record<
  PerspectiveLevel,
  { perspective: number; rotateX: `${number}deg` } | null
> = {
  off: null,
  weak: { perspective: 1200, rotateX: '14deg' },
  strong: { perspective: 700, rotateX: '26deg' },
};

interface Block {
  note: TabNote;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EffectInstance {
  id: number;
  hole: number;
  action: TabAction;
  color: string;
}

interface NoteTimelineProps {
  notes: TabNote[];
  timeline: TimelineInfo;
  positionMs: SharedValue<number>;
  /** 口琴孔位，决定列数与底部简谱标注 */
  holes: Hole[];
  /** 主音音级（由调号换算），用于简谱表示 */
  tonicPc: number;
  /** 透视强度 */
  perspective: PerspectiveLevel;
}

function blockColor(colors: Palette, action: TabAction): string {
  switch (action) {
    case 'blow':
      return colors.blow;
    case 'blowPush':
      return colors.blowPush;
    case 'draw':
      return colors.draw;
    case 'drawPush':
      return colors.drawPush;
  }
}

export function NoteTimeline({
  notes,
  timeline,
  positionMs,
  holes,
  tonicPc,
  perspective,
}: NoteTimelineProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [anchorMs, setAnchorMs] = useState(0);
  const [effects, setEffects] = useState<EffectInstance[]>([]);

  const holeCount = holes.length;
  const effect = getEffect();

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

  const pxPerMs = PX_PER_SEC_V / 1000;

  const geometry = useMemo(() => {
    const { width, height } = size;
    if (width === 0 || height === 0) return null;
    const playhead = Math.max(height - LABEL_AREA_H, 1);
    const ahead = playhead * 1.2;
    return {
      width,
      height,
      playhead,
      ahead,
      canvasW: width,
      canvasH: ahead + playhead,
      rowSize: width / holeCount,
    };
  }, [size, holeCount]);

  const blocks = useMemo<Block[]>(() => {
    if (!geometry) return [];
    const { rowSize } = geometry;
    const result: Block[] = [];
    for (const note of notes) {
      const startMs = note.startTicks * timeline.msPerTick;
      const durationMs = note.durationTicks * timeline.msPerTick;
      const lead = (startMs + LEAD_IN_MS - anchorMs) * pxPerMs;
      const bottom = geometry.ahead - lead;
      const h = Math.max(durationMs * pxPerMs, MIN_BLOCK_PX);
      const y = bottom - h;
      if (bottom <= 0 || y >= geometry.canvasH) continue;
      result.push({
        note,
        x: (note.hole - 1) * rowSize + BLOCK_GAP / 2,
        y,
        w: Math.max(rowSize - BLOCK_GAP, 1),
        h,
      });
    }
    return result;
  }, [notes, timeline.msPerTick, anchorMs, pxPerMs, geometry]);

  const animatedStyle = useAnimatedStyle(() => {
    const delta = (positionMs.value - anchorMs) * pxPerMs;
    const base = (geometry?.playhead ?? 0) - (geometry?.ahead ?? 0);
    return { transform: [{ translateY: base + delta }] };
  }, [anchorMs, pxPerMs, geometry?.playhead, geometry?.ahead]);

  // ── 触碰特效触发 ──────────────────────────────────────

  // 每个音符"底沿压到判定线"的时刻（ms）
  const hitTimes = useMemo(
    () => notes.map((note) => note.startTicks * timeline.msPerTick + LEAD_IN_MS),
    [notes, timeline.msPerTick],
  );

  const hitCursor = useSharedValue(0);
  const lastPos = useSharedValue(-1);
  const nextEffectId = useRef(0);

  const removeEffect = useCallback((id: number) => {
    setEffects((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const triggerHits = useCallback(
    (indices: number[]) => {
      const created: EffectInstance[] = [];
      for (const index of indices) {
        const note = notes[index];
        if (!note) continue;
        nextEffectId.current += 1;
        created.push({
          id: nextEffectId.current,
          hole: note.hole,
          action: note.action,
          color: note.feasible ? blockColor(colors, note.action) : colors.infeasibleBorder,
        });
      }
      if (created.length > 0) setEffects((prev) => [...prev, ...created]);
    },
    [notes, colors],
  );

  useAnimatedReaction(
    () => positionMs.value,
    (value: number) => {
      const last = lastPos.value;
      lastPos.value = value;

      if (hitTimes.length === 0) return;

      // 回退（重播 / 向前拖动）：重新定位游标，不补发特效
      if (value < last) {
        let lo = 0;
        while (lo < hitTimes.length && hitTimes[lo] <= value) lo += 1;
        hitCursor.value = lo;
        return;
      }

      let i = hitCursor.value;
      const crossed: number[] = [];
      while (i < hitTimes.length && hitTimes[i] <= value) {
        crossed.push(i);
        i += 1;
      }
      hitCursor.value = i;
      // 一次跨越过多说明是拖动进度，跳过补发避免"特效轰炸"
      if (crossed.length > 0 && crossed.length <= MAX_BURST) {
        runOnJS(triggerHits)(crossed);
      }
    },
    [hitTimes, triggerHits],
  );

  useEffect(() => {
    // 换曲或重排指法后重算游标
    hitCursor.value = 0;
    lastPos.value = -1;
    setEffects([]);
  }, [hitTimes, hitCursor, lastPos]);

  const perspectiveStyle = PERSPECTIVE_PARAMS[perspective];
  const showScaleLabels = geometry !== null && geometry.rowSize >= 12;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} onLayout={onLayout}>
      {geometry !== null ? (
        <>
          <View style={[styles.region, { height: geometry.playhead }]}>
            <View
              style={[
                styles.perspective,
                perspectiveStyle
                  ? {
                      transform: [
                        { perspective: perspectiveStyle.perspective },
                        { rotateX: perspectiveStyle.rotateX },
                      ],
                      transformOrigin: '50% 100%',
                    }
                  : null,
              ]}
            >
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
                    const fill = note.feasible ? blockColor(colors, note.action) : colors.infeasible;
                    return (
                      <Rect
                        key={note.id}
                        x={block.x}
                        y={block.y}
                        width={block.w}
                        height={block.h}
                        rx={3}
                        fill={fill}
                        stroke={note.feasible ? 'transparent' : colors.infeasibleBorder}
                        strokeWidth={note.feasible ? 0 : 1.5}
                        strokeDasharray={note.feasible ? undefined : '3 3'}
                      />
                    );
                  })}
                  {blocks.map((block) => {
                    const { note } = block;
                    const labelFits = block.w >= 18 && block.h >= 14;
                    if (!labelFits) return null;
                    return (
                      <SvgText
                        key={`${note.id}-label`}
                        x={block.x + block.w / 2}
                        y={block.y + 13}
                        fontSize={block.w >= 26 ? 10 : 8}
                        fill={note.feasible ? colors.onAccent : colors.infeasibleText}
                        textAnchor="middle"
                      >
                        {`${note.hole}·${note.noteName}`}
                      </SvgText>
                    );
                  })}
                </Svg>
              </Animated.View>
            </View>
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.playhead,
              { top: geometry.playhead - 1, backgroundColor: colors.playhead },
            ]}
          />

          <View pointerEvents="none" style={styles.effectLayer}>
            {effects.map((item) => {
              const ctx: EffectContext = {
                instanceId: item.id,
                x: (item.hole - 1) * geometry.rowSize + geometry.rowSize / 2,
                y: geometry.playhead,
                columnWidth: geometry.rowSize,
                color: item.color,
                action: item.action,
                onDone: removeEffect,
              };
              return effect.render(ctx);
            })}
          </View>

          {showScaleLabels ? (
            <View
              style={[
                styles.labelRow,
                { height: LABEL_AREA_H, borderTopColor: colors.border },
              ]}
            >
              {holes.map((hole) => (
                <View key={hole.index} style={styles.labelCell}>
                  <Text style={[styles.labelText, { color: colors.blow }]} numberOfLines={1}>
                    {midiToJianpuText(hole.blow, tonicPc)}
                  </Text>
                  <Text style={[styles.labelText, { color: colors.draw }]} numberOfLines={1}>
                    {midiToJianpuText(hole.draw, tonicPc)}
                  </Text>
                  <Text style={[styles.holeText, { color: colors.textMuted }]} numberOfLines={1}>
                    {hole.index}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  region: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
  },
  perspective: {
    flex: 1,
  },
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  playhead: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  effectLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  labelRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  labelCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 9,
    lineHeight: 12,
  },
  holeText: {
    fontSize: 8,
    lineHeight: 10,
  },
});
