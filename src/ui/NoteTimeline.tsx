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
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import type { Hole, TabAction, TabNote } from '../core/model';
import { midiToJianpuText } from '../core/pitch';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';
import type { PerspectiveLevel } from '../store/library';
import { useTheme } from '../theme/ThemeProvider';
import { adjustLightness, withAlpha } from '../theme/color';
import type { Palette } from '../theme/palette';
import { getEffect } from './effects/registry';
import type { EffectContext } from './effects/types';

/**
 * 音块时间轴（纵向落块，见 docs/TECH_DESIGN.md §7.3–§7.6）
 *
 * 要点：
 *   - **只有 1 个动画节点**：一个包裹 Svg 的 Animated.View 做整体平移，
 *     由 UI 线程上的共享值 positionMs 驱动，不触发 React 重渲染。
 *   - **全曲绝对坐标**：音块 y 只与音符时刻有关，锚点仅用于剔除可视集合
 *     （每 500ms 在 JS 侧重算一次，渲染坐标不变），因此滚动不会跳动。
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

/**
 * 透视强度 → 倾斜角度与压缩强度（见 docs/TECH_DESIGN.md §7.4）
 *
 * 以判定线为底边做 rotateX，形成「人眼看向远路」的近大远小：`rotateX` 越大越像
 * 俯视向前的路面，`k` 越小前缩越剧烈（远端更快收拢到一点）。
 *
 * 几何约束：绕底边旋转 θ、透视距离 P 时，平面的投影高度被裁剪在 `P / tanθ`；
 * 若 `P < playhead·tanθ`，可视区上半部就没有内容（露出空白）。因此 P 不写死，
 * 而是按可视高度反推 `P = k · playhead · tanθ`（要求 `k > 1`），各机型都能填满。
 */
const PERSPECTIVE_PARAMS: Record<PerspectiveLevel, { rotateX: number; k: number } | null> = {
  off: null,
  weak: { rotateX: 38, k: 1.8 },
  strong: { rotateX: 52, k: 1.45 },
};

/** 无透视时判定线上方预排的屏数 */
const AHEAD_RATIO_FLAT = 1.2;
/** 剔除余量：锚点最多滞后一个重算步长，远端多留一屏步长避免边缘闪入 */
const CULL_MARGIN_PX = WINDOW_STEP_MS * (PX_PER_SEC_V / 1000);

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

/**
 * 音块渐变的三档色阶（顶亮 → 主色 → 底暗）。
 * 只在 `<Defs>` 里按动作类型各定义一次；渐变默认用 objectBoundingBox 单位，
 * 因此同一个 id 能被任意尺寸的音块复用，不会随窗口化增加节点。
 */
interface BlockTone {
  id: string;
  top: string;
  mid: string;
  bottom: string;
}

function makeTone(id: string, base: string): BlockTone {
  return {
    id,
    top: adjustLightness(base, 0.15),
    mid: base,
    bottom: adjustLightness(base, -0.13),
  };
}

/** 推键动作：用更亮的渐变 + 内侧高光描边区分，替代易出兼容问题的 SVG pattern */
function isPushAction(action: TabAction): boolean {
  return action === 'blowPush' || action === 'drawPush';
}

/** 渐变 id 用静态字符串：`url(#…)` 引用不了含冒号的 id（如 React.useId 的输出） */
const GRAD_ID: Record<TabAction | 'infeasible', string> = {
  blow: 'tlGradBlow',
  blowPush: 'tlGradBlowPush',
  draw: 'tlGradDraw',
  drawPush: 'tlGradDrawPush',
  infeasible: 'tlGradMuted',
};

/** 顶部高光带共用的白色渐变（上亮下透明） */
const SHEEN_ID = 'tlSheen';

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

  /** 音块渐变定义（随主题色板重建），在 `<Defs>` 里各渲染一次 */
  const tones = useMemo(
    () => [
      makeTone(GRAD_ID.blow, colors.blow),
      makeTone(GRAD_ID.blowPush, colors.blowPush),
      makeTone(GRAD_ID.draw, colors.draw),
      makeTone(GRAD_ID.drawPush, colors.drawPush),
      makeTone(GRAD_ID.infeasible, colors.infeasible),
    ],
    [colors],
  );

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

  const tiltParams = PERSPECTIVE_PARAMS[perspective];

  const geometry = useMemo(() => {
    const { width, height } = size;
    if (width === 0 || height === 0) return null;
    const playhead = Math.max(height - LABEL_AREA_H, 1);

    let aheadRatio = AHEAD_RATIO_FLAT;
    let tilt: { perspective: number; rotateX: `${number}deg` } | null = null;

    if (tiltParams) {
      const rad = (tiltParams.rotateX * Math.PI) / 180;
      const tan = Math.tan(rad);
      const cos = Math.cos(rad);
      // 投影高度上限为 P / tanθ，故取 P = k·playhead·tanθ 才能填满可视区
      const perspective = Math.round(tiltParams.k * playhead * tan);
      // 可视区实际压进的屏数：uMax / playhead = k / (cosθ·(k-1))，再留 10% 余量
      aheadRatio = (tiltParams.k / (cos * (tiltParams.k - 1))) * 1.1;
      tilt = { perspective, rotateX: `${tiltParams.rotateX}deg` };
    }

    /** 判定线上方需要预排的像素（越大越能把远端填满） */
    const ahead = playhead * aheadRatio;
    /**
     * 画布用「全曲绝对坐标」：音块 y 只由音符自身时刻决定，滚动完全交给
     * UI 线程的整块平移。这样每 500ms 重算可视窗口时坐标不变，
     * 不会出现「窗口锚点跳变 + 位移补偿不同帧」造成的跳动。
     */
    const songH = (timeline.totalMs + LEAD_IN_MS) * pxPerMs + playhead;
    return { width, height, playhead, ahead, songH, rowSize: width / holeCount, tilt };
  }, [size, holeCount, tiltParams, timeline.totalMs, pxPerMs]);

  const blocks = useMemo<Block[]>(() => {
    if (!geometry) return [];
    const { rowSize, songH, playhead, ahead } = geometry;
    const result: Block[] = [];
    for (const note of notes) {
      const startMs = note.startTicks * timeline.msPerTick;
      const durationMs = note.durationTicks * timeline.msPerTick;
      const h = Math.max(durationMs * pxPerMs, MIN_BLOCK_PX);
      // 判定线处的屏幕位置（仅用于剔除，不参与渲染坐标）
      const screenBottom = playhead - (startMs + LEAD_IN_MS - anchorMs) * pxPerMs;
      if (screenBottom < -(ahead + CULL_MARGIN_PX) || screenBottom - h > playhead) continue;
      result.push({
        note,
        x: (note.hole - 1) * rowSize + BLOCK_GAP / 2,
        // 全曲绝对坐标：只与音符时刻有关，永不随窗口变化
        y: songH - (startMs + LEAD_IN_MS) * pxPerMs - h,
        w: Math.max(rowSize - BLOCK_GAP, 1),
        h,
      });
    }
    return result;
  }, [notes, timeline.msPerTick, anchorMs, pxPerMs, geometry]);

  // anchor-free：位移只由播放位置决定，窗口锚点不再参与，永不重建也永不跳变
  const animatedStyle = useAnimatedStyle(() => {
    return { transform: [{ translateY: positionMs.value * pxPerMs }] };
  }, [pxPerMs]);

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

  const showScaleLabels = geometry !== null && geometry.rowSize >= 12;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} onLayout={onLayout}>
      {geometry !== null ? (
        <>
          <View style={[styles.region, { height: geometry.playhead }]}>
            <View
              style={[
                styles.perspective,
                geometry.tilt
                  ? {
                      transform: [
                        { perspective: geometry.tilt.perspective },
                        { rotateX: geometry.tilt.rotateX },
                      ],
                      transformOrigin: '50% 100%',
                    }
                  : null,
              ]}
            >
              <Animated.View
                style={[
                  styles.canvas,
                  {
                    top: geometry.playhead - geometry.songH,
                    width: geometry.width,
                    height: geometry.songH,
                  },
                  animatedStyle,
                ]}
              >
                <Svg width={geometry.width} height={geometry.songH}>
                  {/* 音块渐变只在 Defs 里各定义一次；objectBoundingBox 单位可被任意尺寸音块复用 */}
                  <Defs>
                    {tones.map((tone) => (
                      <LinearGradient key={tone.id} id={tone.id} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={tone.top} />
                        <Stop offset="0.55" stopColor={tone.mid} />
                        <Stop offset="1" stopColor={tone.bottom} />
                      </LinearGradient>
                    ))}
                    <LinearGradient id={SHEEN_ID} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
                      <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                    </LinearGradient>
                  </Defs>

                  {/* 列轨道：偶数列淡底 + 列间分隔线，便于对准孔位 */}
                  {holes.map((hole, index) =>
                    index % 2 === 0 ? (
                      <Rect
                        key={`lane-${hole.index}`}
                        x={index * geometry.rowSize}
                        y={0}
                        width={geometry.rowSize}
                        height={geometry.songH}
                        fill={colors.surfaceAlt}
                      />
                    ) : null,
                  )}
                  {holes.map((hole, index) =>
                    index > 0 ? (
                      <Line
                        key={`sep-${hole.index}`}
                        x1={index * geometry.rowSize}
                        y1={0}
                        x2={index * geometry.rowSize}
                        y2={geometry.songH}
                        stroke={colors.border}
                        strokeWidth={StyleSheet.hairlineWidth}
                      />
                    ) : null,
                  )}

                  {/*
                    音块分层：投影 → 渐变主体 → 顶部高光 → 底部色阶（推键再加内侧描边）。
                    全部是静态元素，不引入逐块动画，符合 §7.3「只有 1 个动画节点」。
                  */}
                  {blocks.map((block) => {
                    const { note } = block;
                    const feasible = note.feasible;
                    const gid = feasible ? GRAD_ID[note.action] : GRAD_ID.infeasible;
                    // 被透视压扁的远端小块只画主体，避免出现噪点
                    const detailed = block.w >= 14 && block.h >= 14;
                    return (
                      <G key={note.id}>
                        {detailed ? (
                          <Rect
                            x={block.x}
                            y={block.y + 1.5}
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
                          fill={`url(#${gid})`}
                          stroke={feasible ? withAlpha('#FFFFFF', 0.3) : colors.infeasibleBorder}
                          strokeWidth={feasible ? 1 : 1.5}
                          strokeDasharray={feasible ? undefined : '3 3'}
                        />
                        {detailed ? (
                          <Rect
                            x={block.x + 2}
                            y={block.y + 1.5}
                            width={Math.max(block.w - 4, 1)}
                            height={Math.max(block.h * 0.4, 3)}
                            rx={3}
                            fill={`url(#${SHEEN_ID})`}
                          />
                        ) : null}
                        {detailed ? (
                          <Rect
                            x={block.x + 2}
                            y={block.y + block.h - 3}
                            width={Math.max(block.w - 4, 1)}
                            height={2}
                            rx={1}
                            fill={withAlpha('#000000', 0.16)}
                          />
                        ) : null}
                        {feasible && isPushAction(note.action) && block.w >= 20 && block.h >= 20 ? (
                          <Rect
                            x={block.x + 3}
                            y={block.y + 3}
                            width={Math.max(block.w - 6, 1)}
                            height={Math.max(block.h - 6, 1)}
                            rx={3}
                            fill="none"
                            stroke={withAlpha('#FFFFFF', 0.5)}
                            strokeWidth={1}
                          />
                        ) : null}
                      </G>
                    );
                  })}

                  {blocks.map((block) => {
                    const { note } = block;
                    const labelFits = block.w >= 18 && block.h >= 16;
                    if (!labelFits) return null;
                    return (
                      <SvgText
                        key={`${note.id}-label`}
                        x={block.x + block.w / 2}
                        // 垂直居中：避开顶部高光带，长短音块都好看
                        y={block.y + block.h / 2 + 3.5}
                        fontSize={block.w >= 26 ? 10 : 8}
                        fontWeight="600"
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

          {/* 判定线：外发光带 + 明亮实线 */}
          <View
            pointerEvents="none"
            style={[
              styles.playheadGlow,
              { top: geometry.playhead - PLAYHEAD_GLOW_H / 2, backgroundColor: colors.playhead },
            ]}
          />
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
              {holes.map((hole, index) => (
                <View
                  key={hole.index}
                  style={[
                    styles.labelCell,
                    index % 2 === 0 && { backgroundColor: colors.surfaceAlt },
                    index > 0 && {
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderLeftColor: colors.border,
                    },
                  ]}
                >
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

const PLAYHEAD_GLOW_H = 22;

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
  },
  playheadGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: PLAYHEAD_GLOW_H,
    opacity: 0.16,
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
    alignSelf: 'stretch',
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