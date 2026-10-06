import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arrange } from '../../core/arrange';
import { getLayout } from '../../core/layouts';
import type { ArrangeResult, Score } from '../../core/model';
import { keySignatureToTonicPc } from '../../core/pitch';
import { buildTimeline, type TimelineInfo } from '../../player/timing';
import { usePlayback } from '../../player/usePlayback';
import { usePrefs } from '../../store/prefs';
import { useTheme } from '../../theme/ThemeProvider';
import { NoteTimeline } from '../../ui/NoteTimeline';
import { TransportBar } from '../../ui/TransportBar';
import { listLibrary, loadScore, type LibraryEntry } from '../../store/library';

/**
 * 跟吹页（见 docs/TECH_DESIGN.md §7）
 *
 * 数据流：曲库条目 → 解析出的 Score → arrange 编配 → buildTimeline 时序
 *        → usePlayback 驱动共享值 → NoteTimeline / TransportBar 渲染。
 * 偏好统一由 PrefsProvider 提供，设置页改动后本页即时生效。
 */
export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { prefs, updatePrefs } = usePrefs();

  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [result, setResult] = useState<ArrangeResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 载入曲目（仅依赖 id）
  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    setScore(null);
    setResult(null);
    setTimeline(null);
    setError(null);
    (async () => {
      try {
        const list = await listLibrary();
        const found = list.find((item) => item.id === id);
        if (!found) throw new Error('曲目不存在，可能已被删除');
        const loaded = await loadScore(found);
        if (cancelled) return;
        setEntry(found);
        setScore(loaded);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const layout = useMemo(
    () => getLayout(prefs.layoutId, prefs.layoutOverrides),
    [prefs.layoutId, prefs.layoutOverrides],
  );

  useEffect(() => {
    if (!score) return;
    try {
      setResult(arrange(score, layout));
      setTimeline(buildTimeline(score));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [score, layout]);

  const { positionMs, isPlaying, speed, play, pause, restart, seek, setSpeed } = usePlayback(
    timeline?.totalMs ?? 0,
    prefs.speed,
  );

  useEffect(() => {
    setSpeed(prefs.speed);
  }, [prefs.speed, setSpeed]);

  const handleSpeed = useCallback(
    (next: number) => {
      setSpeed(next);
      updatePrefs({ speed: next });
    },
    [setSpeed, updatePrefs],
  );

  const tonicPc = useMemo(() => keySignatureToTonicPc(score?.keySignature), [score?.keySignature]);
  const stats = result?.stats;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: entry?.title ?? '跟吹' }} />

      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.topBarText}>
          <Text style={[styles.layoutName, { color: colors.text }]} numberOfLines={1}>
            {layout.name}
          </Text>
          <Text style={[styles.layoutMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {stats ? `${stats.feasibleCount}/${stats.total} 个音块可吹` : '正在分析乐谱…'}
            {' · '}
            {layout.holes.length} 孔
          </Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Text style={[styles.changeAction, { color: colors.accent }]}>更换口琴</Text>
        </Pressable>
      </View>

      {stats && stats.infeasibleNotes.length > 0 ? (
        <View style={[styles.warning, { backgroundColor: colors.warningBg }]}>
          <Text style={[styles.warningText, { color: colors.warningText }]}>
            有 {stats.total - stats.feasibleCount} 个音超出现有音域：{stats.infeasibleNotes.join('、')}
            （已用最近孔位占位，可更换口琴或校音阶表）
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : result && timeline && score ? (
        <>
          <NoteTimeline
            notes={result.notes}
            timeline={timeline}
            positionMs={positionMs}
            holes={layout.holes}
            tonicPc={tonicPc}
            perspective={prefs.perspective}
          />
          <View style={{ paddingBottom: insets.bottom }}>
            <TransportBar
              isPlaying={isPlaying}
              speed={speed}
              positionMs={positionMs}
              totalMs={timeline.totalMs}
              onPlayPause={isPlaying ? pause : play}
              onRestart={restart}
              onSeek={seek}
              onSpeedChange={handleSpeed}
            />
          </View>
        </>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 14, textAlign: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarText: { flex: 1, marginRight: 12 },
  layoutName: { fontSize: 15, fontWeight: '600' },
  layoutMeta: { marginTop: 2, fontSize: 12 },
  changeAction: { fontSize: 14, fontWeight: '600' },
  warning: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
  },
  warningText: { fontSize: 12, lineHeight: 18 },
});
