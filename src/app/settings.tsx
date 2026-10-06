import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { readableOn } from '../theme/color';
import { ACCENT_PRESETS } from '../theme/palette';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/tokens';
import {
  Badge,
  Button,
  Card,
  Icon,
  IconTile,
  Row,
  SegmentedControl,
  type IconName,
} from '../ui/components';

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

const THEME_OPTIONS: { label: string; value: ThemeMode; icon: IconName }[] = [
  { label: '跟随系统', value: 'system', icon: 'auto' },
  { label: '浅色', value: 'light', icon: 'sun' },
  { label: '深色', value: 'dark', icon: 'moon' },
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
  icon: IconName;
  title: string;
  hint?: string;
  children: ReactNode;
}

/** 分组：图标 + 标题 + 说明，内容装在统一表面的卡片里 */
function Section({ icon, title, hint, children }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon name={icon} size={17} color={colors.accent} strokeWidth={2} />
        <View style={styles.sectionHeaderText}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {hint ? (
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>{hint}</Text>
          ) : null}
        </View>
      </View>
      <Card>{children}</Card>
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
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Section icon="palette" title="外观" hint="深浅两套配色与强调色由主色自动派生">
        <SegmentedControl
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
                accessibilityRole="button"
                accessibilityLabel={`主色 ${preset.name}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.swatchWrap,
                  { borderColor: active ? colors.text : 'transparent' },
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: preset.value }]}>
                  {active ? (
                    <Icon
                      name="check"
                      size={16}
                      color={readableOn(preset.value)}
                      strokeWidth={3}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section icon="target" title="跟吹视图" hint="以判定线为基准，远端收窄形成近大远小">
        <SegmentedControl
          options={PERSPECTIVE_OPTIONS}
          value={prefs.perspective}
          onChange={(value) => updatePrefs({ perspective: value })}
        />
      </Section>

      <Section icon="harp" title="口琴预设" hint="切换后跟吹页立即按新琴重排指法">
        <View style={styles.presetList}>
          {LAYOUTS.map((item) => {
            const active = item.id === selectedId;
            const corrected = Object.prototype.hasOwnProperty.call(prefs.layoutOverrides, item.id);
            return (
              <Row
                key={item.id}
                title={item.name}
                subtitle={`${item.holes.length} 孔 · ${item.key} 调${corrected ? ' · 已校对' : ''}`}
                leading={<IconTile name="harp" size={36} tone={active ? 'accent' : 'neutral'} />}
                selected={active}
                onPress={() => handleSelect(item.id)}
                accessibilityLabel={`口琴预设 ${item.name}`}
              />
            );
          })}
        </View>
      </Section>

      <Section icon="pencil" title="音阶表校对" hint="音名写法：C4 / A4 / Bb4 / C#5">
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
                      {
                        backgroundColor: colors.surfaceAlt,
                        borderColor: invalid ? colors.danger : colors.border,
                        color: colors.text,
                      },
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
          <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}>
            <Icon name="info" size={15} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.accent }]}>{message}</Text>
          </View>
        ) : null}
        {invalidCount > 0 ? (
          <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
            <Icon name="alert" size={15} color={colors.danger} />
            <Text style={[styles.noticeText, { color: colors.danger }]}>
              有 {invalidCount} 处音名无法识别，请修正后再保存
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="保存音阶表"
            icon="check"
            fullWidth
            onPress={handleSave}
            disabled={invalidCount > 0}
          />
          {hasOverride ? (
            <Button label="恢复默认" variant="ghost" fullWidth onPress={handleRestore} />
          ) : null}
        </View>
      </Section>

      <View style={styles.footer}>
        <Badge icon="alert" tone="warning" label="默认音阶排列因品牌而异，建议用实体琴逐孔核对" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm + 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionHeaderText: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  sectionHint: { fontSize: 12, lineHeight: 17 },
  swatchRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  swatchWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetList: { gap: spacing.sm },
  layoutNotes: { fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  headerText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  holeIndex: { width: 34, fontSize: 12, textAlign: 'center' },
  cell: { flex: 1, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs + 2 },
  input: {
    marginHorizontal: 2,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 0,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  footer: { alignItems: 'center' },
});