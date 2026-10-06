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
import type { PerspectiveLevel, ThemeMode } from '../store/library';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { ACCENT_PRESETS } from '../theme/palette';
import { readableOn } from '../theme/color';

/**
 * 统一设置页（见 docs/TECH_DESIGN.md §8）
 *
 *  - 外观：主题模式（跟随系统/浅色/深色）+ 主色
 *  - 跟吹视图：纵向透视强度
 *  - 口琴：预设切换，改动后跟吹页即时重排指法
 *  - 音阶表校对：逐孔编辑吹/吸（半音阶另有推键列），非法音名标红且禁止保存
 *
 * 所有可配置项集中在此页；写入统一走 updatePrefs，避免与主题层互相覆盖。
 */

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
];

const PERSPECTIVE_OPTIONS: { label: string; value: PerspectiveLevel }[] = [
  { label: '关', value: 'off' },
  { label: '弱', value: 'weak' },
  { label: '强', value: 'strong' },
];

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

interface SectionProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
}

function Section({ title, hint, children }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {hint ? <Text style={[styles.sectionHint, { color: colors.textMuted }]}>{hint}</Text> : null}
      {children}
    </View>
  );
}

interface SegmentedProps<T extends string> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              active && { backgroundColor: colors.surface },
              active && styles.segmentActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? colors.accent : colors.textMuted },
                active && styles.segmentTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { prefs, ready, updatePrefs } = usePrefs();
  const [draft, setDraft] = useState<Draft>({});
  const [message, setMessage] = useState<string | null>(null);

  const selectedId = prefs.layoutId;
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

  const handleSelect = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      await updatePrefs({ layoutId: id });
      setMessage(null);
    },
    [selectedId, updatePrefs],
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
    await updatePrefs({
      layoutId: selectedId,
      layoutOverrides: { ...prefs.layoutOverrides, [selectedId]: holes },
    });
    setMessage(`已保存「${layout.name}」的音阶表，跟吹页会立即按新表重排指法`);
  }, [invalidCount, layout, draft, isChromatic, prefs.layoutOverrides, selectedId, updatePrefs]);

  const handleRestore = useCallback(async () => {
    const overrides = { ...prefs.layoutOverrides };
    delete overrides[selectedId];
    await updatePrefs({ layoutId: selectedId, layoutOverrides: overrides });
    setMessage(`已恢复「${layout.name}」的默认音阶表`);
  }, [prefs.layoutOverrides, selectedId, updatePrefs, layout.name]);

  const updateCell = useCallback((holeIndex: number, key: ColumnKey, text: string) => {
    setDraft((prev) => ({
      ...prev,
      [holeIndex]: { ...prev[holeIndex], [key]: text },
    }));
  }, []);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const hasOverride = Object.prototype.hasOwnProperty.call(prefs.layoutOverrides, selectedId);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Section title="外观" hint="深色/浅色两套配色由主色自动派生">
        <Segmented
          options={THEME_OPTIONS}
          value={prefs.themeMode}
          onChange={(value) => updatePrefs({ themeMode: value })}
        />
        <View style={styles.swatchRow}>
          {ACCENT_PRESETS.map((preset) => {
            const active = preset.value.toLowerCase() === prefs.accent.toLowerCase();
            return (
              <Pressable
                key={preset.value}
                onPress={() => updatePrefs({ accent: preset.value })}
                style={[
                  styles.swatch,
                  { backgroundColor: preset.value },
                  active && { borderColor: colors.text, borderWidth: 2 },
                ]}
                accessibilityLabel={`主色 ${preset.name}`}
              >
                {active ? (
                  <Text style={[styles.swatchCheck, { color: readableOn(preset.value) }]}>✓</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="跟吹视图" hint="以判定线为基准，远端收窄形成近大远小">
        <Segmented
          options={PERSPECTIVE_OPTIONS}
          value={prefs.perspective}
          onChange={(value) => updatePrefs({ perspective: value })}
        />
      </Section>

      <Section title="口琴预设" hint="切换后跟吹页立即按新琴重排指法">
        {LAYOUTS.map((item) => {
          const active = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              onPress={() => handleSelect(item.id)}
              style={({ pressed }) => [
                styles.preset,
                { backgroundColor: colors.surfaceAlt },
                active && { backgroundColor: colors.accentSoft },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.presetText}>
                <Text
                  style={[
                    styles.presetName,
                    { color: active ? colors.accent : colors.text },
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={[styles.presetMeta, { color: colors.textMuted }]}>
                  {item.holes.length} 孔 · {item.key} 调
                  {Object.prototype.hasOwnProperty.call(prefs.layoutOverrides, item.id)
                    ? ' · 已校对'
                    : ''}
                </Text>
              </View>
              {active ? <Text style={[styles.check, { color: colors.accent }]}>当前</Text> : null}
            </Pressable>
          );
        })}
      </Section>

      <Section title="音阶表校对" hint="音名写法：C4 / A4 / Bb4 / C#5">
        {layout.notes ? (
          <Text style={[styles.layoutNotes, { color: colors.textMuted }]}>{layout.notes}</Text>
        ) : null}

        <View style={styles.headerRow}>
          <Text style={[styles.holeIndex, styles.headerText, { color: colors.textMuted }]}>孔</Text>
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[styles.cell, styles.headerText, { color: colors.textMuted }]}
            >
              {column.label}
            </Text>
          ))}
        </View>

        {layout.holes.map((hole) => {
          const cell = draft[hole.index];
          return (
            <View key={hole.index} style={styles.row}>
              <Text style={[styles.holeIndex, { color: colors.textMuted }]}>{hole.index}</Text>
              {columns.map((column) => {
                const value = cell?.[column.key] ?? '';
                const invalid = !parseCell(value).valid;
                return (
                  <TextInput
                    key={column.key}
                    style={[
                      styles.cell,
                      styles.input,
                      { backgroundColor: colors.surfaceAlt, color: colors.text },
                      invalid && { borderColor: colors.danger, borderWidth: 1 },
                    ]}
                    value={value}
                    onChangeText={(text) => updateCell(hole.index, column.key, text)}
                    placeholder="—"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    spellCheck={false}
                  />
                );
              })}
            </View>
          );
        })}

        {message ? (
          <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text>
        ) : null}
        {invalidCount > 0 ? (
          <Text style={[styles.error, { color: colors.danger }]}>
            有 {invalidCount} 处音名无法识别，请修正后再保存
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              invalidCount > 0 && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
            disabled={invalidCount > 0}
          >
            <Text style={[styles.buttonText, { color: colors.onAccent }]}>保存音阶表</Text>
          </Pressable>
          {hasOverride ? (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.buttonGhost,
                { borderColor: colors.border },
                pressed && styles.pressed,
              ]}
              onPress={handleRestore}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>恢复默认</Text>
            </Pressable>
          ) : null}
        </View>
      </Section>

      <Text style={[styles.footer, { color: colors.textMuted }]}>
        建议用自己的琴逐孔核对音阶表；默认排列在不同品牌间可能存在差异。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14 },
  section: {
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  sectionHint: { marginTop: 4, fontSize: 12, lineHeight: 17 },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginTop: 12,
  },
  segment: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 13 },
  segmentTextActive: { fontWeight: '600' },
  swatchRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  swatchCheck: { fontSize: 16, fontWeight: '700' },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  pressed: { opacity: 0.75 },
  presetText: { flex: 1 },
  presetName: { fontSize: 14, fontWeight: '600' },
  presetMeta: { marginTop: 2, fontSize: 12 },
  check: { fontSize: 13, fontWeight: '600' },
  layoutNotes: { marginTop: 8, fontSize: 12, lineHeight: 17 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  headerText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  holeIndex: { width: 34, fontSize: 12, textAlign: 'center' },
  cell: { flex: 1, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  input: {
    marginHorizontal: 2,
    height: 34,
    borderRadius: 6,
    paddingVertical: 0,
  },
  message: { marginTop: 12, fontSize: 12, lineHeight: 17 },
  error: { marginTop: 8, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  footer: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
