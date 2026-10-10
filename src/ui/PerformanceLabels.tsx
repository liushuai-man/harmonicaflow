import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { Hole, TabAction, TabNote } from '../core/model';
import { midiToJianpuText } from '../core/pitch';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';
import type { Palette } from '../theme/palette';
import { useTheme } from '../theme/ThemeProvider';

const ACTIONS: Record<TabAction, string> = { blow: '吹', draw: '吸', blowPush: '吹·推', drawPush: '吸·推' };

/** React 只接收音符边界变化；逐帧查找与动作高亮留在 UI 线程。 */
export function useActiveNote(notes: TabNote[], timeline: TimelineInfo, positionMs: SharedValue<number>) {
  const intervals = useMemo(() => notes.map(n => ({
    start: n.startTicks * timeline.msPerTick + LEAD_IN_MS,
    end: (n.startTicks + n.durationTicks) * timeline.msPerTick + LEAD_IN_MS,
  })), [notes, timeline.msPerTick]);
  const activeIndex = useSharedValue(-1);
  const [current, setCurrent] = useState(-1);
  useAnimatedReaction(() => {
    const time = positionMs.value;
    let lo = 0, hi = intervals.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (intervals[mid].start <= time) lo = mid + 1; else hi = mid;
    }
    return lo > 0 && time < intervals[lo - 1].end ? lo - 1 : -1;
  }, (index, previous) => {
    activeIndex.value = index;
    if (index !== previous) runOnJS(setCurrent)(index);
  }, [intervals]);
  return { activeIndex, activeNote: notes[current] };
}

function ActionLabel({ midi, action, hole, tonicPc, notes, activeIndex, colors, highlight }: {
  midi: number; action: TabAction; hole: number; tonicPc: number; notes: TabNote[];
  activeIndex: SharedValue<number>; colors: Palette; highlight: string;
}) {
  const style = useAnimatedStyle(() => {
    const note = notes[activeIndex.value];
    return { backgroundColor: note?.feasible && note.hole === hole && note.action === action ? highlight : 'transparent' };
  });
  return <Animated.Text style={[styles.action, { color: colors.text }, style]} numberOfLines={1}>
    {midiToJianpuText(midi, tonicPc)}{ACTIONS[action]}
  </Animated.Text>;
}

export function LaneLabel({ hole, tonicPc, vertical, striped, divider, colors, highlight, notes, activeIndex }: {
  hole: Hole; tonicPc: number; vertical: boolean; striped: boolean; divider: boolean;
  colors: Palette; highlight: string; notes: TabNote[]; activeIndex: SharedValue<number>;
}) {
  return <View accessibilityLabel={`第${hole.index}孔`} style={[styles.cell,
    striped && { backgroundColor: colors.surfaceAlt },
    divider && { borderColor: colors.border, borderLeftWidth: vertical ? 0 : StyleSheet.hairlineWidth,
      borderTopWidth: vertical ? StyleSheet.hairlineWidth : 0 },
  ]}>
    {(['blow', 'draw', 'blowPush', 'drawPush'] as const).map(action => {
      const midi = hole[action];
      return typeof midi === 'number' ? <ActionLabel key={action} midi={midi} action={action} hole={hole.index}
        tonicPc={tonicPc} notes={notes} activeIndex={activeIndex} colors={colors} highlight={highlight} /> : null;
    })}
    <Text style={[styles.hole, { color: colors.textMuted }]}>{hole.index}</Text>
  </View>;
}

export function CurrentAction({ note, tonicPc }: { note?: TabNote; tonicPc: number }) {
  const { colors } = useTheme();
  const text = note ? `${midiToJianpuText(note.midi, tonicPc)}  ·  ${note.feasible ? `${note.hole} 孔 · ${ACTIONS[note.action]}` : '超出音域'}` : '准备 / 休止';
  return <View style={[styles.current, { backgroundColor: colors.surface }]}>
    <Text style={[styles.currentText, { color: note && !note.feasible ? colors.danger : colors.text }]}>{text}</Text>
  </View>;
}

const styles = StyleSheet.create({
  cell: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  action: { fontSize: 9, lineHeight: 13, borderRadius: 2 },
  hole: { fontSize: 8, lineHeight: 10 },
  current: { paddingVertical: 4, alignItems: 'center' },
  currentText: { fontSize: 16, fontWeight: '700' },
});
