import * as DocumentPicker from 'expo-document-picker';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arrange } from '../core/arrange';
import { getLayout } from '../core/layouts';
import {
  DEFAULT_PREFS,
  importScore,
  listLibrary,
  loadPrefs,
  loadScore,
  type LibraryEntry,
  type Prefs,
} from '../store/library';

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
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statsMap, setStatsMap] = useState<Record<string, EntryStats>>({});

  const refresh = useCallback(async () => {
    const [list, loadedPrefs] = await Promise.all([listLibrary(), loadPrefs()]);
    setEntries(list);
    setPrefs(loadedPrefs);
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
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push({ pathname: '/practice/[id]', params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.origin === 'builtin' ? <Text style={styles.badge}>示例</Text> : null}
        </View>
        <Text style={styles.cardMeta}>
          {SOURCE_LABEL[item.source] ?? item.source} · {stats ? stats.total : item.noteCount} 个音块
          {stats && stats.infeasible > 0 ? ` · ${stats.infeasible} 个吹不出` : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: '口琴跟吹助手',
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
              <Text style={styles.headerAction}>设置</Text>
            </Pressable>
          ),
        }}
      />

      {message ? (
        <Pressable style={styles.message} onPress={() => setMessage(null)}>
          <Text style={styles.messageText}>{message}</Text>
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
            <Text style={styles.sectionLabel}>
              曲库 · 当前口琴：{getLayout(prefs.layoutId, prefs.layoutOverrides).name}
            </Text>
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.importButton, pressed && styles.importButtonPressed]}
          onPress={handleImport}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.importButtonText}>导入乐谱</Text>
          )}
        </Pressable>
        <Text style={styles.footerHint}>支持 MusicXML / ABC / JSON，导入后自动分析并直接开始跟吹</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerAction: { color: '#2F80ED', fontSize: 15, fontWeight: '600' },
  message: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFF4E5',
  },
  messageText: { color: '#8A5B00', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 24 },
  sectionLabel: { fontSize: 13, color: '#8A8F98', marginBottom: 10 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1F2329' },
  badge: {
    fontSize: 11,
    color: '#2F80ED',
    backgroundColor: '#E8F1FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardMeta: { marginTop: 6, fontSize: 13, color: '#8A8F98' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E4E6EA',
    backgroundColor: '#FFFFFF',
  },
  importButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2F80ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  importButtonPressed: { opacity: 0.8 },
  importButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  footerHint: { marginTop: 8, fontSize: 12, color: '#9AA0A6', textAlign: 'center' },
});
