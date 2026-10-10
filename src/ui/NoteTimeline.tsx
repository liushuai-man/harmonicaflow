import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  G,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import type { Hole, TabAction, TabNote } from '../core/model';
import {
  BLOCK_GAP,
  LABEL_AREA_H,
  LABEL_AREA_W,
  MAX_BURST,
  SHATTER_MAX_INSTANCES,
  SETTINGS_TRANSITION_MS,
  K_DEFAULT,
  FLAT_ANGLE_DEG,
  MIN_BLOCK_PX,
  NOISE_MIN_PX,
  WINDOW_STEP_MS,
  computeViewGeometry,
  laneOffset,
  resolveFlow,
  type FlowSetting,
  type StaffBarMode,
} from '../core/visual';
import { tileNote, tileSize, visibleTiles } from '../core/visual/tiles';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';
import { withAlpha } from '../theme/color';
import { CurrentAction, LaneLabel, useActiveNote } from './PerformanceLabels';
import { useTheme } from '../theme/ThemeProvider';
import { getEffect } from './effects/registry';
import type { EffectContext } from './effects/types';
import { StaffBar } from './StaffBar';

/**
 * 音块时间轴（见 docs/TECH_DESIGN.md §7.3–§7.6）
 *
 * 要点：
 *   - **只有 1 个动画节点**：一个包裹 Svg 的 Animated.View 做整体平移，
 *     由 UI 线程上的共享值 positionMs 驱动，不触发 React 重渲染。
 *   - **全曲绝对坐标**：音块的沿时间轴坐标只与音符时刻有关，窗口锚点仅用于剔除
 *     可视集合（每 500ms 在 JS 侧重算一次，渲染坐标不变），因此滚动不会跳动。
 *   - **方向可自由定义**：`flow` 为 `down` / `right` / `auto`，几何与剔除由
 *     `core/visual/flow.ts` 的纯函数给出，两种方向共用同一套坐标公式。
 *   - **视角连续可调**：绕判定线旋转 θ 并反推透视距离（§7.4），θ = 0 走平铺分支。
 *   - **视线索令牌化**：线与音块的画法全部取自主题层的 `skin`，不硬编码色值。
 *   - **命中高亮**：音块压线时，该列光带、判定线与底部音阶标注同步脉冲（UI 线程）。
 *   - **触碰特效**：positionMs 越过接触时刻时触发一次可插拔特效（§7.5）。
 */

interface Block {
  note: TabNote;
  /** 屏幕坐标（画布内），沿时间轴 */
  x: number;
  y: number;
  w: number;
  h: number;
  label: boolean;
}

interface EffectInstance {
  id: number;
  hole: number;
  action: TabAction;
  color: string;
  startMs: number;
}

interface NoteTimelineProps {
  notes: TabNote[];
  timeline: TimelineInfo;
  positionMs: SharedValue<number>;
  revision: SharedValue<number>;
  /** 口琴孔位，决定列数与底部音阶标注 */
  holes: Hole[];
  /** 主音音级（由调号换算），用于简谱表示 */
  tonicPc: number;
  /** 落块方向：从上到下 / 从左到右 / 自动 */
  flow: FlowSetting;
  /** 视角角度（度），0 = 100% 垂直 */
  viewAngle: number;
  /** 横向琴谱条模式 */
  staffBar: StaffBarMode;
}

/**
 * 音块渐变的三档色阶（顶亮 → 主色 → 底暗）。
 * 在 `<Defs>` 里按动作类型各定义一次；渐变用 objectBoundingBox 单位，
 * 因此同一个 id 能被任意尺寸的音块复用，不随可视化窗口增加节点。
 */
/** 渐变 id 用静态字符串：`url(#…)` 引用不了含冒号的 id（如 React.useId 的输出） */
const GRAD_ID: Record<TabAction | 'infeasible', string> = {
  blow: 'tlGradBlow',
  blowPush: 'tlGradBlowPush',
  draw: 'tlGradDraw',
  drawPush: 'tlGradDrawPush',
  infeasible: 'tlGradMuted',
};

/** 顶部高光带共用的白色渐变 */
const SHEEN_ID = 'tlSheen';
/** 整屏背景渐变 */
const BG_ID = 'tlBg';
/** 判定线外发光带高度 */
const PLAYHEAD_GLOW = 22;
/** 命中时该列光带的长度（沿时间轴） */
const HIT_GLOW_LEN = 64;

export function NoteTimeline({
  notes,
  timeline,
  positionMs,
  revision,
  holes,
  tonicPc,
  flow,
  viewAngle,
  staffBar,
}: NoteTimelineProps) {
  const { colors, skin } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [anchorMs, setAnchorMs] = useState(0);
  const [effects, setEffects] = useState<EffectInstance[]>([]);

  const { activeIndex, activeNote } = useActiveNote(notes, timeline, positionMs);
  const reduced = useReducedMotion();
  const appearance = useSharedValue(1);
  useEffect(() => {
    appearance.value = reduced ? 1 : 0.65;
    appearance.value = withTiming(1, { duration: reduced ? 0 : SETTINGS_TRANSITION_MS });
  }, [skin, reduced, appearance]);
  const appearanceStyle = useAnimatedStyle(() => ({ opacity: appearance.value }));
  const angle = useDerivedValue(() => withTiming(viewAngle, { duration: reduced ? 0 : SETTINGS_TRANSITION_MS }));
  const holeCount = holes.length;
  const effect = getEffect();

  // ── 几何：方向 + 视角（纯函数，见 core/visual/flow.ts）────────
  const geometry = useMemo(
    () =>
      computeViewGeometry({
        direction: resolveFlow(flow, size),
        viewport: size,
        laneCount: holeCount,
        angleDeg: viewAngle,
        totalMs: timeline.totalMs,
        leadInMs: LEAD_IN_MS,
      }),
    [flow, size, holeCount, viewAngle, timeline.totalMs],
  );

  const horizontal = geometry?.axis === 'x';
  const pxPerMs = geometry?.pxPerMs ?? 0;

  // UI 线程上的播放位置 → 低频同步到 JS，用于重算可视窗口
  useAnimatedReaction(
    () => Math.floor(positionMs.value / WINDOW_STEP_MS),
    (bucket: number, previous: number | null) => {
      if (previous === null || bucket !== previous) {
        runOnJS(setAnchorMs)(bucket * WINDOW_STEP_MS);
      }
    },
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width === size.width && height === size.height) return;
    setSize({ width, height });
  };

  const chunkSize = tileSize(PixelRatio.get());
  const tiles = useMemo(() => {
    if (!geometry) return [];
    return visibleTiles(anchorMs, geometry.ahead, pxPerMs, chunkSize, timeline.totalMs).map(index => {
      const blocks: Block[] = [];
      for (const note of notes) {
        const startPx = (note.startTicks * timeline.msPerTick + LEAD_IN_MS) * pxPerMs;
        const span = Math.max(note.durationTicks * timeline.msPerTick * pxPerMs, MIN_BLOCK_PX);
        const part = tileNote(startPx, span, index, chunkSize);
        if (!part.visible) continue;
        const across = laneOffset(note.hole, geometry.rowSize);
        const breadth = Math.max(1, geometry.rowSize - BLOCK_GAP);
        blocks.push(horizontal
          ? { note, x: part.along, y: across, w: span, h: breadth, label: part.label }
          : { note, x: across, y: part.along, w: breadth, h: span, label: part.label });
      }
      return { index, blocks };
    });
  }, [geometry, anchorMs, pxPerMs, chunkSize, timeline, notes, horizontal]);

  // anchor-free：位移只由播放位置决定，窗口锚点不参与，永不重建也永不跳变
  const animatedStyle = useAnimatedStyle(
    () =>
      horizontal
        ? { transform: [{ translateX: positionMs.value * pxPerMs }] }
        : { transform: [{ translateY: positionMs.value * pxPerMs }] },
    [horizontal, pxPerMs],
  );

  // ── 命中高亮（hover 联动）────────────────────────────────
  const hitHole = useDerivedValue(() => {
    const note = notes[activeIndex.value];
    return note?.feasible ? note.hole : -1;
  });
  const hitPulse = useDerivedValue(() => hitHole.value > 0 ? 0.35 : 0);

  const rowSize = geometry?.rowSize ?? 0;
  const playhead = geometry?.playhead ?? 0;
  const tiltStyle = useAnimatedStyle(() => {
    const degree = angle.value;
    if (degree < FLAT_ANGLE_DEG) return { transform: [] };
    const perspective = Math.max(1, K_DEFAULT * playhead * Math.tan(degree * Math.PI / 180));
    return { transform: horizontal ? [{ perspective }, { rotateY: `-${degree}deg` }] : [{ perspective }, { rotateX: `${degree}deg` }] };
  });

  const laneGlowStyle = useAnimatedStyle(() => {
    const lane = hitHole.value;
    const pulse = hitPulse.value;
    if (lane < 1 || pulse <= 0.001) return { opacity: 0 };
    return {
      opacity: pulse * 0.55,
      transform: horizontal
        ? [{ translateY: (lane - 1) * rowSize }]
        : [{ translateX: (lane - 1) * rowSize }],
    };
  }, [horizontal, rowSize]);

  const playheadPulseStyle = useAnimatedStyle(() => ({ opacity: hitPulse.value * 0.9 }), []);

  // ── 触碰特效触发 ─────────────────────────────────────────
  // 每个音符"底沿压到判定线"的时刻（ms）
  const hitTimes = useMemo(
    () => notes.map((note) => note.startTicks * timeline.msPerTick + LEAD_IN_MS),
    [notes, timeline.msPerTick],
  );

  const nextEffectId = useRef(0);

  const removeEffect = useCallback((id: number) => {
    setEffects((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const triggerHits = useCallback(
    (indices: number[]) => {
      const created: EffectInstance[] = [];
      for (const index of indices) {
        const note = notes[index];
        if (!note?.feasible) continue;
        nextEffectId.current += 1;
        created.push({
          id: nextEffectId.current,
          startMs: note.startTicks * timeline.msPerTick + LEAD_IN_MS,
          hole: note.hole,
          action: note.action,
          color: note.feasible
            ? note.action === 'blow' || note.action === 'blowPush'
              ? colors.blow
              : colors.draw
            : colors.infeasibleBorder,
        });
      }
      if (created.length > 0) setEffects((prev) => [...prev, ...created].slice(-SHATTER_MAX_INSTANCES));
    },
    [notes, colors, timeline.msPerTick],
  );

  const clearEffects = useCallback(() => setEffects([]), []);
  useAnimatedReaction(
    () => ({ time: positionMs.value, revision: revision.value }),
    (value, previous) => {
      if (!previous || value.revision !== previous.revision || value.time < previous.time) {
        runOnJS(clearEffects)();
        return;
      }
      const crossed: number[] = [];
      let lo = 0, hi = hitTimes.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (hitTimes[mid] <= previous.time) lo = mid + 1; else hi = mid;
      }
      while (lo < hitTimes.length && hitTimes[lo] <= value.time && crossed.length <= MAX_BURST) crossed.push(lo++);
      if (crossed.length > 0 && crossed.length <= MAX_BURST) runOnJS(triggerHits)(crossed);
    }, [hitTimes, triggerHits, clearEffects],
  );
  useEffect(clearEffects, [notes, clearEffects]);

  // 渐变方向：down 纵向、right 横向；两端偏移字段在两种方向下复用同一组渐变定义
  const gx2 = horizontal ? '1' : '0';
  const gy2 = horizontal ? '0' : '1';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.stage} onLayout={onLayout}>
        {/* 整屏背景渐变：白线皮肤走黑白灰、彩色皮肤走色板底色 */}
        {size.width > 0 && size.height > 0 ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={size.width} height={size.height}>
              <Defs>
                <LinearGradient id={BG_ID} x1="0" y1="0" x2="0" y2="1">
                  {skin.backgroundStops.map((stop) => (
                    <Stop
                      key={stop.offset}
                      offset={stop.offset}
                      stopColor={stop.color}
                      stopOpacity={skin.backgroundOpacity}
                    />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${BG_ID})`} />
            </Svg>
          </View>
        ) : null}

        {geometry ? (
          <>
            <View
              style={[
                styles.region,
                horizontal
                  ? { left: 0, top: 0, width: playhead, height: size.height }
                  : { left: 0, top: 0, width: size.width, height: playhead },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: horizontal ? '100% 50%' : '50% 100%' }, tiltStyle, appearanceStyle]}>
                <View pointerEvents="none" style={[styles.canvas,
                  horizontal ? { left: playhead - geometry.ahead, top: 0, width: geometry.ahead, height: size.height }
                    : { left: 0, top: playhead - geometry.ahead, width: size.width, height: geometry.ahead }]}>
                  {holes.map((hole, index) => <View key={hole.index} style={{
                    position: 'absolute', backgroundColor: index % 2 === 0 ? skin.laneStripe ?? 'transparent' : 'transparent',
                    borderColor: skin.divider,
                    ...(horizontal ? { top: index * rowSize, left: 0, width: geometry.ahead, height: rowSize, borderTopWidth: skin.dividerWidth }
                      : { left: index * rowSize, top: 0, height: geometry.ahead, width: rowSize, borderLeftWidth: skin.dividerWidth }),
                  }} />)}
                </View>
                <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
                  {tiles.map(({ index, blocks }) => <View key={index} style={[styles.canvas, { overflow: 'hidden' },
                    horizontal ? { left: playhead - (index + 1) * chunkSize, top: 0, width: chunkSize, height: size.height }
                      : { left: 0, top: playhead - (index + 1) * chunkSize, width: size.width, height: chunkSize }]}>
                  <Svg width={horizontal ? chunkSize : size.width} height={horizontal ? size.height : chunkSize}>
                    {/* 渐变只在 Defs 里各定义一次；objectBoundingBox 单位可被任意尺寸音块复用 */}
                    <Defs>
                      {(Object.keys(skin.block) as (TabAction | 'infeasible')[]).map((key) => {
                        const gradient = skin.block[key].gradient;
                        if (!gradient) return null;
                        return (
                          <LinearGradient key={key} id={GRAD_ID[key]} x1="0" y1="0" x2={gx2} y2={gy2}>
                            <Stop offset="0" stopColor={gradient.top} />
                            <Stop offset="0.55" stopColor={gradient.mid} />
                            <Stop offset="1" stopColor={gradient.bottom} />
                          </LinearGradient>
                        );
                      })}
                      {skin.sheenOpacity > 0 ? (
                        <LinearGradient id={SHEEN_ID} x1="0" y1="0" x2={gx2} y2={gy2}>
                          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={skin.sheenOpacity} />
                          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                        </LinearGradient>
                      ) : null}
                    </Defs>

                    {/*
                      音块分层：投影 → 渐变主体 → 高光带 → 色阶线（推键再加内侧描边）。
                      全部静态元素，不引入逐块动画，符合 §7.3「只有 1 个动画节点」。
                    */}
                    {blocks.map((block) => {
                      const { note } = block;
                      const face = note.feasible ? skin.block[note.action] : skin.block.infeasible;
                      // 被透视压扁的远端小块只画主体，避免出现噪点
                      const detailed = Math.min(block.w, block.h) >= NOISE_MIN_PX;
                      const pad = 2;
                      const inset = 3;
                      return (
                        <G key={note.id}>
                          {detailed ? (
                            <Rect
                              x={horizontal ? block.x + 1.5 : block.x}
                              y={horizontal ? block.y : block.y + 1.5}
                              width={block.w}
                              height={block.h}
                              rx={5}
                              fill={withAlpha(colors.shadow, 0.18)}
                            />
                          ) : null}
                          <Rect
                            x={block.x}
                            y={block.y}
                            width={block.w}
                            height={block.h}
                            rx={5}
                            fill={face.gradient ? `url(#${GRAD_ID[note.feasible ? note.action : 'infeasible']})` : 'none'}
                            fillOpacity={face.gradient ? skin.fillOpacity : undefined}
                            stroke={face.stroke}
                            strokeWidth={face.strokeWidth}
                            strokeDasharray={note.feasible ? undefined : '3 3'}
                          />
                          {detailed && face.gradient && skin.sheenOpacity > 0 ? (
                            <Rect
                              x={horizontal ? block.x + 1.5 : block.x + pad}
                              y={horizontal ? block.y + pad : block.y + 1.5}
                              width={horizontal ? Math.max(block.w * 0.4, 3) : Math.max(block.w - pad * 2, 1)}
                              height={horizontal ? Math.max(block.h - pad * 2, 1) : Math.max(block.h * 0.4, 3)}
                              rx={3}
                              fill={`url(#${SHEEN_ID})`}
                            />
                          ) : null}
                          {detailed ? (
                            <Rect
                              x={horizontal ? block.x + block.w - inset : block.x + pad}
                              y={horizontal ? block.y + pad : block.y + block.h - inset}
                              width={horizontal ? 2 : Math.max(block.w - pad * 2, 1)}
                              height={horizontal ? Math.max(block.h - pad * 2, 1) : 2}
                              rx={1}
                              fill={withAlpha('#000000', 0.16)}
                            />
                          ) : null}
                          {face.innerStroke && Math.min(block.w, block.h) >= 20 ? (
                            <Rect
                              x={block.x + inset}
                              y={block.y + inset}
                              width={Math.max(block.w - inset * 2, 1)}
                              height={Math.max(block.h - inset * 2, 1)}
                              rx={3}
                              fill="none"
                              stroke={face.innerStroke}
                              strokeWidth={1}
                            />
                          ) : null}
                        </G>
                      );
                    })}

                    {blocks.map((block) => {
                      const { note } = block;
                      const face = note.feasible ? skin.block[note.action] : skin.block.infeasible;
                      const short = Math.min(block.w, block.h);
                      if (!block.label || block.w < 20 || block.h < 16) return null;
                      return (
                        <SvgText
                          key={`${note.id}-label`}
                          x={block.x + block.w / 2}
                          // 垂直居中：避开高光带，长短音块都好看
                          y={block.y + block.h / 2 + 3.5}
                          fontSize={short >= 26 ? 10 : 8}
                          fontWeight="600"
                          fill={face.labelColor}
                          textAnchor="middle"
                        >
                          {`${note.hole}·${note.noteName}`}
                        </SvgText>
                      );
                    })}
                  </Svg>
                  </View>)}
                </Animated.View>
              </Animated.View>
            </View>

            {/* 判定线：外发光带 + 明亮实线；命中时再叠一条高亮色脉冲 */}
            <View
              pointerEvents="none"
              style={[
                styles.playheadGlow,
                { backgroundColor: skin.playhead },
                horizontal
                  ? { top: 0, bottom: 0, left: playhead - PLAYHEAD_GLOW / 2, width: PLAYHEAD_GLOW }
                  : { left: 0, right: 0, top: playhead - PLAYHEAD_GLOW / 2, height: PLAYHEAD_GLOW },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.playhead,
                { backgroundColor: skin.playhead },
                horizontal
                  ? { top: 0, bottom: 0, left: playhead - skin.playheadWidth / 2, width: skin.playheadWidth }
                  : { left: 0, right: 0, top: playhead - skin.playheadWidth / 2, height: skin.playheadWidth },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.playhead,
                { backgroundColor: skin.highlight },
                horizontal
                  ? { top: 0, bottom: 0, left: playhead - skin.playheadWidth / 2, width: skin.playheadWidth }
                  : { left: 0, right: 0, top: playhead - skin.playheadWidth / 2, height: skin.playheadWidth },
                playheadPulseStyle,
              ]}
            />
            {/* 命中列光带：沿时间轴压在判定线上，随脉冲淡出 */}
            <Animated.View
              pointerEvents="none"
              style={[
                { position: 'absolute', backgroundColor: skin.highlight },
                horizontal
                  ? { left: playhead - HIT_GLOW_LEN / 2, top: 0, width: HIT_GLOW_LEN, height: rowSize }
                  : { top: playhead - HIT_GLOW_LEN / 2, left: 0, height: HIT_GLOW_LEN, width: rowSize },
                laneGlowStyle,
              ]}
            />

            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {effects.map((item) => {
                const center = (item.hole - 1) * rowSize + rowSize / 2;
                const ctx: EffectContext = {
                  instanceId: item.id,
                  positionMs, startMs: item.startMs, horizontal,
                  x: horizontal ? playhead : center,
                  y: horizontal ? center : playhead,
                  columnWidth: rowSize,
                  color: item.color,
                  action: item.action,
                  onDone: removeEffect,
                };
                return effect.render(ctx);
              })}
            </View>

            {rowSize > 0 ? (
              <View
                style={[
                  styles.labelRow,
                  horizontal
                    ? {
                        top: 0,
                        bottom: 0,
                        right: 0,
                        width: LABEL_AREA_W,
                        flexDirection: 'column',
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: colors.border,
                      }
                    : {
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: LABEL_AREA_H,
                        flexDirection: 'row',
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                ]}
              >
                {holes.map((hole, index) => (
                  <LaneLabel
                    key={hole.index}
                    hole={hole}
                    tonicPc={tonicPc}
                    vertical={horizontal}
                    striped={index % 2 === 0}
                    divider={index > 0}
                    colors={colors}
                    highlight={skin.highlight}
                    notes={notes}
                    activeIndex={activeIndex}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <CurrentAction note={activeNote} tonicPc={tonicPc} />
      {staffBar !== 'off' ? (
        <StaffBar
          notes={notes}
          timeline={timeline}
          positionMs={positionMs}
          tonicPc={tonicPc}
          mode={staffBar}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  region: {
    position: 'absolute',
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
  },
  playheadGlow: {
    position: 'absolute',
    opacity: 0.16,
  },
  playhead: {
    position: 'absolute',
    borderRadius: 1,
  },
  labelRow: {
    position: 'absolute',
    alignItems: 'center',
  },
  labelCell: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
