import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arrange } from '../core/arrange';
import { buildExercise, EXERCISES } from '../core/learning';
import type { HarmonicaLayout } from '../core/model';
import { keySignatureToTonicPc } from '../core/pitch';
import { buildTimeline } from '../player/timing';
import { usePlayback } from '../player/usePlayback';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/tokens';
import { Button } from './components';
import { NoteTimeline } from './NoteTimeline';
import { TransportBar } from './TransportBar';

export function ExercisePlayer({ id, layout }: { id: string; layout: HarmonicaLayout }) {
  const { colors } = useTheme();
  const { prefs } = usePrefs();
  const insets = useSafeAreaInsets();
  const definition = EXERCISES.find((exercise) => exercise.id === id);
  const data = useMemo(() => {
    const score = buildExercise(id, layout);
    return score ? { timeline: buildTimeline(score), result: arrange(score, layout) } : null;
  }, [id, layout]);
  const playback = usePlayback(data?.timeline.totalMs ?? 0, 1);
  const { pause } = playback;
  useFocusEffect(useCallback(() => () => pause(), [pause]));

  if (!data || !definition) return <View style={styles.message}>
    <Text style={[styles.hint, { color: colors.text }]}>{definition ? '当前音阶表没有完整的大调八度，请核对琴型、调号和孔位。' : '没有这项练习，请返回入门练习选择。'}</Text>
    <Button label={definition ? '核对口琴设置' : '返回入门练习'} onPress={() => router.replace(definition ? '/settings' : '/learn')} />
  </View>;

  return <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ title: definition.title }} />
    <View style={styles.instructions}>
      <Text style={[styles.caption, { color: colors.accent }]}>{layout.key} 大调 · 4/4 · 基础速度 60 BPM</Text>
      <Text style={[styles.hint, { color: colors.text }]}>{definition.cue}</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>看底部孔位与吹吸，压线时演奏。无示范音或听音评分。</Text>
    </View>
    <View style={styles.container}>
      <NoteTimeline notes={data.result.notes} timeline={data.timeline} positionMs={playback.positionMs}
        holes={layout.holes} tonicPc={keySignatureToTonicPc(layout.key)} flow={prefs.flow}
        viewAngle={prefs.viewAngle} staffBar={prefs.staffBar} />
    </View>
    <TransportBar isPlaying={playback.isPlaying} speed={playback.speed} positionMs={playback.positionMs}
      totalMs={data.timeline.totalMs} onPlayPause={playback.isPlaying ? playback.pause : playback.play}
      onRestart={playback.restart} onSeek={playback.seek} onSpeedChange={playback.setSpeed} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  instructions: { padding: spacing.md, gap: spacing.xs },
  hint: { fontSize: 14, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 19 },
  message: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
});
