import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MUSIC_BASICS } from '../../content/musicBasics';
import { getLayout } from '../../core/layouts';
import { buildExercise, EXERCISES } from '../../core/learning';
import { usePrefs } from '../../store/prefs';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH, spacing } from '../../theme/tokens';
import { Badge, Button, Card, Icon } from '../../ui/components';

export default function LearnScreen() {
  const { colors } = useTheme();
  const { prefs, ready } = usePrefs();
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState<string | null>('reading');
  const layout = getLayout(prefs.layoutId, prefs.layoutOverrides, prefs.layoutKeys);
  const playable = buildExercise('scale', layout) !== null;
  if (!ready) return <ActivityIndicator accessibilityLabel="正在读取琴型" />;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <Card highlighted>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>从第一声开始</Text>
        <Text style={[styles.title, { color: colors.text }]}>先读懂，再吹响。</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>不必先背乐理。认识一个符号，跟着音块练一次，慢慢建立自己的节奏。</Text>
        <View style={styles.badges}>
          <Badge label="离线可用" tone="accent" />
          <Badge label={`${layout.key} 大调 · ${layout.holes.length} 孔`} />
        </View>
        <Button label="核对我的口琴" variant="ghost" onPress={() => router.push('/settings')} />
      </Card>

      <Text style={[styles.heading, { color: colors.text }]}>01 / 基础练习</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>使用当前音阶表：{layout.name}。60 BPM · 4/4，可调慢速度。仅视觉跟吹，无示范音和听音评分。</Text>
      {!playable && <Text accessibilityRole="alert" style={[styles.body, { color: colors.warningText }]}>当前音阶表缺少完整的大调八度，暂不能生成练习。请到设置核对琴型、调号和孔位。</Text>}
      {EXERCISES.map((exercise) => (
        <Card key={exercise.id}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{exercise.title}</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{exercise.subtitle}</Text>
          <Button label={`开始${exercise.title}`} icon="play" disabled={!playable}
            onPress={() => router.push({ pathname: '/learn/[id]', params: { id: exercise.id } })} />
        </Card>
      ))}

      <Text style={[styles.heading, { color: colors.text }]}>02 / 读谱小课堂</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>从简谱开始，分清音高、时值和孔位。点开一节，随时查阅。</Text>
      {MUSIC_BASICS.map((lesson) => (
        <Card key={lesson.id}>
          <Pressable accessibilityRole="button" accessibilityLabel={lesson.title}
            accessibilityState={{ expanded: opened === lesson.id }}
            onPress={() => setOpened(opened === lesson.id ? null : lesson.id)} style={styles.lessonToggle}>
            <Text style={[styles.cardTitle, styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
            <Icon name={opened === lesson.id ? 'chevronDown' : 'chevronRight'} size={18} color={colors.accent} />
          </Pressable>
          {opened === lesson.id && <View style={styles.lesson}>
            <Text style={[styles.example, { color: colors.accent }]}>{lesson.example}</Text>
            {lesson.paragraphs.map((paragraph) => <Text key={paragraph} style={[styles.body, { color: colors.textMuted }]}>{paragraph}</Text>)}
          </View>}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  eyebrow: { fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '800', marginBottom: spacing.md },
  heading: { fontSize: 20, fontWeight: '700', marginTop: spacing.lg },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: spacing.sm },
  body: { fontSize: 15, lineHeight: 24, marginBottom: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  lessonToggle: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lessonTitle: { flex: 1, marginBottom: 0 },
  lesson: { gap: spacing.sm, paddingTop: spacing.md },
  example: { fontSize: 16, lineHeight: 26, fontWeight: '600' },
});
