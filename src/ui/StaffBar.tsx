import { useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import type { TabNote } from '../core/model';
import { midiToJianpuText } from '../core/pitch';
import {
  STAFF_BAR_H,
  STAFF_BAR_PX_PER_SEC,
  WINDOW_STEP_MS,
  type StaffBarMode,
} from '../core/visual';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';
import { withAlpha } from '../theme/color';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 横向琴谱条（见 docs/TECH_DESIGN.md §7.9 / PRD §5.1）
 *
 * 与音块时间轴正交的一条「谱面」视图，位置固定在跟吹页底部：
 *   - `full`  完整谱面：全部音符按时间横排，随播放滚动，当前音对齐中央光标；
 *   - `hint`  精简提示条：只给"当前音 + 接下来 3 个音"的简谱数字，抬头即见。
 *
 * 两种模式都只消费 `notes / timeline`，与落块方向无关（横向琴谱始终横向），
 * 因此 `right` 方向下也能当"额外一条谱面"用。
 */

interface StaffBarProps {
  notes: TabNote[];
  timeline: TimelineInfo;
  positionMs: SharedValue<number>;
  tonicPc: number;
  mode: Exclude<StaffBarMode, 'off'>;
}

/** `hint` 模式一次展示的音符数（当前 + 后续） */
const HINT_COUNT = 4;

export function StaffBar({ notes, timeline, positionMs, tonicPc, mode }: StaffBarProps) {
  const { colors, skin } = useTheme();
  const [width, setWidth] = useState(0);

  const pxPerMs = STAFF_BAR_PX_PER_SEC / 1000;

  // 低频锚点：只在 JS 侧用来重新圈定可视音符集合，不参与渲染坐标
  const [anchorMs, setAnchorMs] = useState(0);
  useAnimatedReaction(
    () => Math.floor(positionMs.value / WINDOW_STEP_MS),
    (bucket: number, previous: number | null) => {
      if (previous === null || bucket !== previous) {
        runOnJS(setAnchorMs)(bucket * WINDOW_STEP_MS);
      }
    },
    [],
  );

  const hitTimes = useMemo(
    () => notes.map((note) => note.startTicks * timeline.msPerTick + LEAD_IN_MS),
    [notes, timeline.msPerTick],
  );

  /** 已经越过的音符数（= 下一个待吹音符的下标） */
  const cursor = useMemo(() => {
    let i = 0;
    while (i < hitTimes.length && hitTimes[i] <= anchorMs) i += 1;
    return i;
  }, [hitTimes, anchorMs]);

  /** `full`：只渲染当前可视横向范围内（含余量）的音符，长曲也不全量上屏 */
  const halfMs = width > 0 ? width / 2 / pxPerMs : 0;
  const visibleIndices = useMemo(() => {
    if (mode !== 'full') return [];
    const margin = WINDOW_STEP_MS * 2;
    const from = anchorMs - halfMs - margin;
    const to = anchorMs + halfMs + margin;
    const indices: number[] = [];
    for (let i = 0; i < hitTimes.length; i += 1) {
      if (hitTimes[i] >= from && hitTimes[i] <= to) indices.push(i);
    }
    return indices;
  }, [mode, hitTimes, anchorMs, halfMs]);

  const stripWidth = Math.max(timeline.totalMs * pxPerMs, 1);
  const stripStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: width / 2 - positionMs.value * pxPerMs }] }),
    [width, pxPerMs],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const hintIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = cursor; i < Math.min(cursor + HINT_COUNT, notes.length); i += 1) indices.push(i);
    return indices;
  }, [cursor, notes.length]);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderTopColor: colors.border },
      ]}
    >
      {mode === 'full' ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 0, top: 0, width: stripWidth, height: STAFF_BAR_H }, stripStyle]}
          >
            {visibleIndices.map((index) => {
              const note = notes[index];
              const start = hitTimes[index] * pxPerMs;
              const span = Math.max(note.durationTicks * timeline.msPerTick * pxPerMs, 22);
              const passed = index < cursor;
              const current = index === cursor - 1;
              return (
                <View key={note.id} style={[styles.cell, { left: start, width: span }]}>
                  <Text
                    style={[
                      styles.digit,
                      { color: passed ? colors.placeholder : colors.text },
                      current && { color: skin.highlight, fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    {midiToJianpuText(note.midi, tonicPc)}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
          {/* 中央光标：与判定线同一视觉语言，标出"现在" */}
          <View
            pointerEvents="none"
            style={[styles.cursor, { left: width / 2 - 1, backgroundColor: skin.highlight }]}
          />
        </>
      ) : null}

      {mode === 'hint' ? (
        <View style={styles.hintRow}>
          {hintIndices.length === 0 ? (
            <Text style={[styles.hintEmpty, { color: colors.textMuted }]}>— 已到曲末 —</Text>
          ) : (
            hintIndices.map((index, order) => {
              const note = notes[index];
              const active = order === 0;
              return (
                <View
                  key={note.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? withAlpha(skin.highlight, 0.18) : colors.surfaceAlt,
                      borderColor: active ? skin.highlight : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.chipDigit, { color: active ? skin.highlight : colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {midiToJianpuText(note.midi, tonicPc)}
                  </Text>
                  <Text style={[styles.chipHole, { color: colors.textMuted }]} numberOfLines={1}>
                    {note.hole}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: STAFF_BAR_H,
    justifyContent: 'center',
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontSize: 13,
    fontWeight: '600',
  },
  cursor: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  hintEmpty: {
    fontSize: 12,
  },
  chip: {
    minWidth: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDigit: {
    fontSize: 14,
    fontWeight: '700',
  },
  chipHole: {
    fontSize: 10,
  },
});