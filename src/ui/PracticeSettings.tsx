import { StyleSheet, Text, View } from 'react-native';
import { LAYOUTS } from '../core/layouts';
import { VIEW_ANGLE_MAX } from '../core/visual';
import type { Prefs } from '../store/library';
import { useTheme } from '../theme/ThemeProvider';
import { Button, SegmentedControl, Slider } from './components';

/** 全局页和演奏抽屉复用，预览与持久化分开。 */
export function PracticeSettings({ prefs, onChange, onPreviewAngle, includeLayout = false }: {
  prefs: Prefs; onChange: (patch: Partial<Prefs>) => void;
  onPreviewAngle?: (angle: number) => void; includeLayout?: boolean;
}) {
  const { colors } = useTheme();
  const label = (text: string) => <Text style={[styles.label, { color: colors.textMuted }]}>{text}</Text>;
  return <View style={styles.fields}>
    {label('皮肤')}
    <SegmentedControl options={[{ label: '白线', value: 'mono' }, { label: '彩色', value: 'color' }]}
      value={prefs.skin} onChange={skin => onChange({ skin })} />
    {label('透明度')}
    <SegmentedControl options={[{ label: '实心', value: 'solid' }, { label: '柔和', value: 'soft' }, { label: '玻璃', value: 'glass' }]}
      value={prefs.opacity} onChange={opacity => onChange({ opacity })} />
    {label('落块方向')}
    <SegmentedControl options={[{ label: '向下', value: 'down' }, { label: '向右', value: 'right' }, { label: '自动', value: 'auto' }]}
      value={prefs.flow} onChange={flow => onChange({ flow })} />
    {label('视角')}
    <Slider value={prefs.viewAngle} min={0} max={VIEW_ANGLE_MAX} onPreview={onPreviewAngle}
      onChange={viewAngle => onChange({ viewAngle })} formatValue={value => `${value}°`} />
    {label('简谱提示')}
    <SegmentedControl options={[{ label: '完整', value: 'full' }, { label: '精简', value: 'hint' }, { label: '关闭', value: 'off' }]}
      value={prefs.staffBar} onChange={staffBar => onChange({ staffBar })} />
    {label('同步五线谱')}
    <SegmentedControl options={[{ label: '显示', value: 'on' }, { label: '关闭', value: 'off' }]}
      value={prefs.notation ? 'on' : 'off'} onChange={value => onChange({ notation: value === 'on' })} />
    {includeLayout ? <>
      {label('口琴预设（详细校对在全局设置）')}
      {LAYOUTS.map(layout => <Button key={layout.id} label={layout.name} size="sm"
        variant={prefs.layoutId === layout.id ? 'primary' : 'secondary'} onPress={() => onChange({ layoutId: layout.id })} />)}
    </> : null}
  </View>;
}
const styles = StyleSheet.create({ fields: { gap: 8 }, label: { fontSize: 12, marginTop: 4 } });
