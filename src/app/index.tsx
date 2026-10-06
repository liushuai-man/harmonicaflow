import * as DocumentPicker from 'expo-document-picker';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arrange } from '../core/arrange';
import { getLayout } from '../core/layouts';
import { importScore, listLibrary, loadScore, type LibraryEntry } from '../store/library';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { elevation, radius, spacing } from '../theme/tokens';
import { Badge, Button, Card, HarmonicaMark, Icon, SongCover } from '../ui/components';

interface EntryStats {
  total: number;
  infeasible: number;
}

const SOURCE_LABEL: Record<string, string> = {
  json: 'JSON',
  abc: 'ABC',
  musicxml: 'MusicXML',
};

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { prefs } = usePrefs();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, EntryStats>>({});

  const layout = getLayout(prefs.layoutId, prefs.layoutOverrides);

  const refresh = useCallback(async () => {
    const list = await listLibrary();
    setEntries(list);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // 后台逐首计算“不可吹音数”，分帧执行避免阻塞列表
  useEffect(() => {
    let cancelled = false;
    const activeLayout = getLayout(prefs.layoutId, prefs.layoutOverrides);

    (async () => {
      for (const entry of entries) {
        if (cancelled) return;
        try {
          const score = await loadScore(entry);
          if (cancelled) return;
          const { stats } = arrange(score, activeLayout);
          setStatsMap((prev) => ({
            ...prev,
            [entry.id]: { total: stats.total, infeasible: stats.total - stats.feasibleCount },
          }));
        } catch {
          // 单首曲目失败不影响列表
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entries, prefs.layoutId, prefs.layoutOverrides]);

  const handleImport = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const { entry, duplicated } = await importScore(asset.uri, asset.name);
      await refresh();
      if (duplicated) setMessage(`《${entry.title}》已在曲库中，直接打开`);
      router.push({ pathname: '/practice/[id]', params: { id: entry.id } });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setImporting(false);
    }
  }, [importing, refresh]);

  const openEntry = useCallback((id: string) => {
    router.push({ pathname: '/practice/[id]', params: { id } });
  }, []);

  const renderItem = ({ item }: { item: LibraryEntry }) => {
    const stats = statsMap[item.id];
    const builtin = item.origin === 'builtin';
    const playable = stats ? stats.total - stats.infeasible : null;

    return (
      <Card onPress={() => openEntry(item.id)} style={styles.card} accessibilityLabel={item.title}>
        <View style={styles.cardRow}>
          <SongCover uri={item.coverUri} title={item.title} size={44} />
          <View style={styles.cardBody}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              {builtin ? <Badge label="示例" tone="accent" /> : null}
            </View>

            <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {SOURCE_LABEL[item.source] ?? item.source} · {stats ? stats.total : item.noteCount} 个音块
            </Text>

            {stats && playable !== null ? (
              <View style={styles.cardChips}>
                <Badge
                  icon="target"
                  tone={stats.infeasible > 0 ? 'warning' : 'success'}
                  label={`可吹 ${playable}/${stats.total}`}
                />
                {stats.infeasible > 0 ? (
                  <Badge tone="danger" label={`${stats.infeasible} 个吹不出`} />
                ) : null}
              </View>
            ) : null}
          </View>
          <Icon name="chevronRight" size={18} color={colors.placeholder} />
        </View>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: '口琴跟吹助手',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="设置"
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Icon name="settings" size={21} color={colors.accent} />
            </Pressable>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              {message ? (
                <Pressable
                  onPress={() => setMessage(null)}
                  style={[
                    styles.message,
                    { backgroundColor: colors.warningBg, borderColor: colors.warningText },
                  ]}
                >
                  <Icon name="info" size={16} color={colors.warningText} />
                  <Text style={[styles.messageText, { color: colors.warningText }]}>{message}</Text>
                </Pressable>
              ) : null}

              <Card
                elevated={false}
                highlighted
                style={[styles.hero, { backgroundColor: colors.accentSoft }]}
              >
                <View style={styles.heroRow}>
                  <View style={styles.heroText}>
                    <Text style={[styles.heroTitle, { color: colors.text }]}>
                      跟着音块吹口琴
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
                      导入乐谱 → 自动编配孔位 → 音块压线即该吹
                    </Text>
                  </View>
                  <HarmonicaMark size={112} />
                </View>

                <View style={styles.heroChips}>
                  <Badge icon="harp" tone="accent" label={layout.name} />
                  <Badge icon="target" tone="neutral" label={`${layout.holes.length} 孔`} />
                  <Badge icon="music" tone="neutral" label={`${entries.length} 首曲目`} />
                </View>
              </Card>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>曲库</Text>
            </View>
          }
        />
      )}

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + spacing.md,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          elevation(2, colors.shadow),
        ]}
      >
        <Button
          label="导入乐谱"
          icon="upload"
          size="lg"
          fullWidth
          loading={importing}
          onPress={handleImport}
        />
        <Text style={[styles.footerHint, { color: colors.textMuted }]}>
          支持 MusicXML / ABC / JSON，导入后自动分析并直接开始跟吹
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerButton: { padding: spacing.xs },
  pressed: { opacity: 0.6 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  messageText: { flex: 1, fontSize: 13, lineHeight: 18 },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: spacing.xs + 2 },
  heroTitle: { fontSize: 19, fontWeight: '700', letterSpacing: 0.2 },
  heroSubtitle: { fontSize: 12.5, lineHeight: 18 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionLabel: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  card: { marginBottom: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flexShrink: 1, fontSize: 16, fontWeight: '600' },
  cardMeta: { fontSize: 12.5 },
  cardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: 2 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerHint: { marginTop: spacing.sm, fontSize: 12, textAlign: 'center' },
});