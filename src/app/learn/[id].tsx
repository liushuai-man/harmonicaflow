import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { getLayout } from '../../core/layouts';
import { usePrefs } from '../../store/prefs';
import { ExercisePlayer } from '../../ui/ExercisePlayer';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { prefs, ready } = usePrefs();
  if (!ready) return <ActivityIndicator accessibilityLabel="正在读取琴型" />;
  const layout = getLayout(prefs.layoutId, prefs.layoutOverrides, prefs.layoutKeys);
  return <ExercisePlayer key={JSON.stringify([id, layout])} id={id} layout={layout} />;
}
