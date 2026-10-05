import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LAYOUTS, getLayout } from '../core/layouts';
import type { Hole } from '../core/model';
import { midiToNoteName, tryNoteNameToMidi } from '../core/pitch';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from '../store/library';

/**
 * 设置页（见 docs/TECH_DESIGN.md §8）
 *
 *  - 切换口琴预设：立即写入偏好，跟吹页返回后自动重排指法
 *  - 音阶表校对：逐孔编辑吹/吸（半音阶另有推键列），非法音名标红且禁止保存
 *  - 覆盖数据存于 prefs.layoutOverrides[layoutId]，可一键恢复默认
 */

interface CellDraft {
  blow: string;
  draw: string;
  blowPush: string;
  drawPush: string;
}

type Draft = Record<number, CellDraft>;

type ColumnKey = keyof CellDraft;

function cellText(midi: number | null | undefined): string {
  return typeof midi === 'number' ? midiToNoteName(midi) : '';
}

function holesToDraft(holes: Hole[], chromatic: boolean): Draft {
  const draft: Draft = {};
  for (const hole of holes) {
    draft[hole.index] = {
      blow: cellText(hole.blow),
      draw: cellText(hole.draw),
      blowPush: chromatic ? cellText(hole.blowPush) : '',
      drawPush: chromatic ? cellText(hole.drawPush) : '',
    };
  }
  return draft;
}

function parseCell(value: string): { midi: number | null; valid: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { midi: null, valid: true };
  const midi = tryNoteNameToMidi(trimmed);
  return midi === null ? { midi: null, valid: false } : { midi, valid: true };
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [selectedId, setSelectedId] = useState(DEFAULT_PREFS.layoutId);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadPrefs();
      if (cancelled) return;
      setPrefs(loaded);
      setSelectedId(loaded.layoutId);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const layout = useMemo(
    () => getLayout(selectedId, prefs.layoutOverrides),
    [selectedId, prefs.layoutOverrides],
  );
  const isChromatic = layout.type === 'chromatic12';

  const columns = useMemo<{ key: ColumnKey; label: string }[]>(
    () =>
      isChromatic
        ? [
            { key: 'blow', label: '吹' },
            { key: 'draw', label: '吸' },
            { key: 'blowPush', label: '吹+键' },
            { key: 'drawPush', label: '吸+键' },
          ]
        : [
            { key: 'blow', label: '吹' },
            { key: 'draw', label: '吸' },
          ],
    [isChromatic],
  );

  useEffect(() => {
    setDraft(holesToDraft(layout.holes, layout.type === 'chromatic12'));
  }, [layout]);

  const invalidCount = useMemo(() => {
    let count = 0;
    for (const hole of layout.holes) {
      const cell = draft[hole.index];
      if (!cell) continue;
      for (const column of columns) {
        if (!parseCell(cell[column.key]).valid) count += 1;
      }
    }
    return count;
  }, [draft, layout, columns]);

  const persist = useCallback(async (next: Prefs) => {
    setPrefs(next);
    await savePrefs(next);
  }, []);

  const handleSelect = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      await persist({ ...prefs, layoutId: id });
      setMessage(null);
    },
    [selectedId, prefs, persist],
  );

  const handleSave = useCallback(async () => {
    if (invalidCount > 0) return;
    const holes: Hole[] = layout.holes.map((hole) => {
      const cell = draft[hole.index];
      const next: Hole = {
        index: hole.index,
        blow: parseCell(cell?.blow ?? '').midi,
        draw: parseCell(cell?.draw ?? '').midi,
      };
      if (isChromatic) {
        next.blowPush = parseCell(cell?.blowPush ?? '').midi;
        next.drawPush = parseCell(cell?.drawPush ?? '').midi;
      }
      return next;
    });
    if (holes.every((hole) => hole.blow === null && hole.draw === null)) {
      setMessage('音阶表不能全为空，请至少保留吹或吸的孔位');
      return;
    }
    await persist({
      ...prefs,
      layoutId: selectedId,
      layoutOverrides: { ...prefs.layoutOverrides, [selectedId]: holes },
    });
    setMessage(`已保存「${layout.name}」的音阶表，跟吹页会立即按新表重排指法`);
  }, [invalidCount, layout, draft, isChromatic, prefs, selectedId, persist]);

  const handleRestore = useCallback(async () => {
    const overrides = { ...prefs.layoutOverrides };
    delete overrides[selectedId];
    await persist({ ...prefs, layoutId: selectedId, layoutOverrides: overrides });
    setMessage(`已恢复「${layout.name}」的默认音阶表`);
  }, [prefs, selectedId, persist, layout.name]);

  const updateCell = useCallback((holeIndex: number, key: ColumnKey, text: string) => {
    setDraft((prev) => ({
      ...prev,
      [holeIndex]: { ...prev[holeIndex], [key]: text },
    }));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const hasOverride = Object.prototype.hasOwnProperty.call(prefs.layoutOverrides, selectedId);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionLabel}>口琴预设</Text>
      {LAYOUTS.map((item) => {
        const active = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            onPress={() => handleSelect(item.id)}
            style={({ pressed }) => [styles.preset, active && styles.presetActive, pressed && styles.pressed]}
          >
            <View style={styles.presetText}>
              <Text style={[styles.presetName, active && styles.presetNameActive]}>{item.name}</Text>
              <Text style={styles.presetMeta}>
                {item.holes.length} 孔 · {item.key} 调
                {Object.prototype.hasOwnProperty.call(prefs.layoutOverrides, item.id) ? ' · 已校对' : ''}
              </Text>
            </View>
            {active ? <Text style={styles.check}>当前</Text> : null}
          </Pressable>
        );
      })}

      <View style={styles.tableHeader}>
        <Text style={styles.sectionLabel}>音阶表校对</Text>
        <Text style={styles.tableHint}>音名写法：C4 / A4 / Bb4 / C#5</Text>
      </View>
      {layout.notes ? <Text style={styles.layoutNotes}>{layout.notes}</Text> : null}

      <View style={styles.headerRow}>
        <Text style={[styles.holeIndex, styles.headerText]}>孔</Text>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.cell, styles.headerText]}>
            {column.label}
          </Text>
        ))}
      </View>

      {layout.holes.map((hole) => {
        const cell = draft[hole.index];
        return (
          <View key={hole.index} style={styles.row}>
            <Text style={styles.holeIndex}>{hole.index}</Text>
            {columns.map((column) => {
              const value = cell?.[column.key] ?? '';
              const invalid = !parseCell(value).valid;
              return (
                <TextInput
                  key={column.key}
                  style={[styles.cell, styles.input, invalid && styles.inputInvalid]}
                  value={value}
                  onChangeText={(text) => updateCell(hole.index, column.key, text)}
                  placeholder="—"
                  placeholderTextColor="#C4C8CE"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                />
              );
            })}
          </View>
        );
      })}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {invalidCount > 0 ? (
        <Text style={styles.error}>
          有 {invalidCount} 处音名无法识别，请修正后再保存
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.button, invalidCount > 0 && styles.buttonDisabled, pressed && styles.pressed]}
          onPress={handleSave}
          disabled={invalidCount > 0}
        >
          <Text style={styles.buttonTextPrimary}>保存音阶表</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && styles.pressed]}
          onPress={handleRestore}
          disabled={!hasOverride}
        >
          <Text style={[styles.buttonText, !hasOverride && styles.buttonTextDisabled]}>恢复默认</Text>
        </Pressable>
      </View>

      <Text style={styles.footnote}>
        音阶表默认值从常见排列整理而来，不同品牌可能存在差异。建议对照实体琴逐孔校对后保存，编配与提示会立即按校对结果生效。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16 },
  sectionLabel: { fontSize: 13, color: '#8A8F98', marginBottom: 8 },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetActive: { borderColor: '#2F80ED', backgroundColor: '#F3F8FF' },
  presetText: { flex: 1 },
  presetName: { fontSize: 15, fontWeight: '600', color: '#1F2329' },
  presetNameActive: { color: '#2F80ED' },
  presetMeta: { marginTop: 2, fontSize: 12, color: '#8A8F98' },
  check: { fontSize: 12, fontWeight: '600', color: '#2F80ED' },
  pressed: { opacity: 0.7 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  tableHint: { fontSize: 12, color: '#9AA0A6', marginBottom: 8 },
  layoutNotes: { fontSize: 12, color: '#8A8F98', lineHeight: 18, marginBottom: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  headerText: { fontSize: 12, color: '#9AA0A6', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 6,
  },
  holeIndex: { width: 32, fontSize: 13, fontWeight: '600', color: '#6B7280' },
  cell: { flex: 1, textAlign: 'center' },
  input: {
    height: 38,
    marginHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#F4F6F9',
    fontSize: 13,
    color: '#1F2329',
  },
  inputInvalid: { backgroundColor: '#FDECEC', color: '#EB5757' },
  message: { marginTop: 12, fontSize: 13, color: '#15803D' },
  error: { marginTop: 12, fontSize: 13, color: '#EB5757' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F80ED',
  },
  buttonGhost: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8DDE5' },
  buttonDisabled: { backgroundColor: '#B9D1F5' },
  buttonTextPrimary: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#3C4149' },
  buttonTextDisabled: { color: '#BFC4CC' },
  footnote: { marginTop: 16, fontSize: 12, color: '#9AA0A6', lineHeight: 18 },
});
