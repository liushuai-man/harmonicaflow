import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arrange } from '../../core/arrange';
import { getLayout } from '../../core/layouts';
import type { ArrangeResult, Score } from '../../core/model';
import { buildTimeline, type TimelineInfo } from '../../player/timing';
import { usePlayback } from '../../player/usePlayback';
import { NoteTimeline, type TimelineOrientation } from '../../ui/NoteTimeline';
import { TransportBar } from '../../ui/TransportBar';
import {
  DEFAULT_PREFS,
  listLibrary,
  loadPrefs,
  loadScore,
  savePrefs,
  type LibraryEntry,
  type Prefs,
} from '../../store/library';

/**
 * 跟吹页（见 docs/TECH_DESIGN.md §7）
 *
 * 数据流：曲库条目 → 解析出的 Score → arrange 编配 → buildTimeline 时序
 *        → usePlayback 驱动共享值 → NoteTimeline / TransportBar 渲染。
 * 口琴预设或音阶表在设置页被改动后，返回本页会重新读取偏好并即时重排指法。
 */
export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [result, setResult] = useState<ArrangeResult | null>(null);
  const [timeline, setTimeline] = useState<TimelineInfo | null>(null);
  const [orientation, setOrientation] = useState<TimelineOrientation>(DEFAULT_PREFS.orientation);
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

  // 每次回到本页都重新读取偏好：设置页可能改了口琴预设或音阶表
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadPrefs().then((loaded) => {
        if (!cancelled) setPrefs(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

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

  useEffect(() => {
    setOrientation(prefs.orientation);
  }, [prefs.orientation]);

  const handleSpeed = useCallback(
    (next: number) => {
      setSpeed(next);
      const updated = { ...prefs, speed: next };
      setPrefs(updated);
      savePrefs(updated);
    },
    [prefs, setSpeed],
  );

  const handleOrientation = useCallback(
    (next: TimelineOrientation) => {
      setOrientation(next);
      const updated = { ...prefs, orientation: next };
      setPrefs(updated);
      savePrefs(updated);
    },
    [prefs],
  );

  const stats = result?.stats;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: entry?.title ?? '跟吹' }} />

      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <Text style={styles.layoutName} numberOfLines={1}>
            {layout.name}
          </Text>
          <Text style={styles.layoutMeta} numberOfLines={1}>
            {stats ? `${stats.feasibleCount}/${stats.total} 个音块可吹` : '正在分析乐谱…'}
            {' · '}
            {layout.holes.length} 孔
          </Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Text style={styles.changeAction}>更换口琴</Text>
        </Pressable>
      </View>

      {stats && stats.infeasibleNotes.length > 0 ? (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            有 {stats.total - stats.feasibleCount} 个音超出现有音域：{stats.infeasibleNotes.join('、')}
            （已用最近孔位占位，可更换口琴或校音阶表）
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : result && timeline && score ? (
        <>
          <NoteTimeline
            notes={result.notes}
            timeline={timeline}
            positionMs={positionMs}
            holeCount={layout.holes.length}
            orientation={orientation}
          />
          <View style={{ paddingBottom: insets.bottom }}>
            <TransportBar
              isPlaying={isPlaying}
              speed={speed}
              orientation={orientation}
              positionMs={positionMs}
              totalMs={timeline.totalMs}
              onPlayPause={isPlaying ? pause : play}
              onRestart={restart}
              onSeek={seek}
              onSpeedChange={handleSpeed}
              onOrientationChange={handleOrientation}
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
  container: { flex: 1, backgroundColor: '#F5F6F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#EB5757', textAlign: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6EA',
  },
  topBarText: { flex: 1, marginRight: 12 },
  layoutName: { fontSize: 15, fontWeight: '600', color: '#1F2329' },
  layoutMeta: { marginTop: 2, fontSize: 12, color: '#8A8F98' },
  changeAction: { color: '#2F80ED', fontSize: 14, fontWeight: '600' },
  warning: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFF4E5',
  },
  warningText: { fontSize: 12, lineHeight: 18, color: '#8A5B00' },
});
