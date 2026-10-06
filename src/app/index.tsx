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
    const layout = getLayout(prefs.layoutId, prefs.layoutOverrides);

    (async () => {
      for (const entry of entries) {
        if (cancelled) return;
        try {
          const score = await loadScore(entry);
          if (cancelled) return;
          const { stats } = arrange(score, layout);
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

  const renderItem = ({ item }: { item: LibraryEntry }) => {
    const stats = statsMap[item.id];
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface },
          pressed && styles.cardPressed,
        ]}
        onPress={() => router.push({ pathname: '/practice/[id]', params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.origin === 'builtin' ? (
            <Text
              style={[
                styles.badge,
                { color: colors.accent, backgroundColor: colors.accentSoft },
              ]}
            >
              示例
            </Text>
          ) : null}
        </View>
        <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
          {SOURCE_LABEL[item.source] ?? item.source} · {stats ? stats.total : item.noteCount} 个音块
          {stats && stats.infeasible > 0 ? ` · ${stats.infeasible} 个吹不出` : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: '口琴跟吹助手',
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
              <Text style={[styles.headerAction, { color: colors.accent }]}>设置</Text>
            </Pressable>
          ),
        }}
      />

      {message ? (
        <Pressable
          style={[styles.message, { backgroundColor: colors.warningBg }]}
          onPress={() => setMessage(null)}
        >
          <Text style={[styles.messageText, { color: colors.warningText }]}>{message}</Text>
        </Pressable>
      ) : null}

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
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              曲库 · 当前口琴：{getLayout(prefs.layoutId, prefs.layoutOverrides).name}
            </Text>
          }
        />
      )}

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.importButton,
            { backgroundColor: colors.accent },
            pressed && styles.importButtonPressed,
          ]}
          onPress={handleImport}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.importButtonText, { color: colors.onAccent }]}>导入乐谱</Text>
          )}
        </Pressable>
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
  headerAction: { fontSize: 15, fontWeight: '600' },
  message: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
  },
  messageText: { fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 24 },
  sectionLabel: { fontSize: 13, marginBottom: 10 },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  badge: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardMeta: { marginTop: 6, fontSize: 13 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  importButton: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonPressed: { opacity: 0.8 },
  importButtonText: { fontSize: 16, fontWeight: '600' },
  footerHint: { marginTop: 8, fontSize: 12, textAlign: 'center' },
});
