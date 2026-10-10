import { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { SETTINGS_TRANSITION_MS } from '../core/visual/params';
import type { Prefs } from '../store/library';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './components';
import { PracticeSettings } from './PracticeSettings';

export function PracticeSettingsPanel({ open, onClose, prefs, onChange, onPreviewAngle }: {
  open: boolean; onClose: () => void; prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void; onPreviewAngle: (angle: number) => void;
}) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    width: '100%',
    height: landscape ? (open ? '100%' : 0) : withTiming(open ? Math.min(height * 0.25, 180) : 0, { duration: reduced ? 0 : SETTINGS_TRANSITION_MS }),
    opacity: withTiming(open ? 1 : 0, { duration: reduced ? 0 : SETTINGS_TRANSITION_MS }),
  }));
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [open, onClose]);
  return <Animated.View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
    importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[styles.panel, { backgroundColor: colors.surface }, style]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button label="收起设置" size="sm" variant="ghost" onPress={onClose} />
      <PracticeSettings prefs={prefs} onChange={onChange} onPreviewAngle={onPreviewAngle} includeLayout />
    </ScrollView>
  </Animated.View>;
}
const styles = StyleSheet.create({ panel: { overflow: 'hidden' }, content: { padding: 12, gap: 12 } });
