import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';

/**
 * 轻量滑杆（见 docs/TECH_DESIGN.md §7.8）
 *
 * 用 `PanResponder` + reanimated 共享值自绘，**不引入第三方滑杆库**（零新增依赖）。
 * 拖动过程中只有「滑块位置」在 UI 线程更新，数值回显按量化后的值节流到 JS；
 * **落盘只在松手时发生一次**，避免拖动时高频写 prefs。
 */

const THUMB = 22;
const TRACK_H = 4;
const ROW_H = 36;

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** 量化步长 */
  step?: number;
  onChange: (value: number) => void;
  /** 右侧数值回显的格式化 */
  formatValue?: (value: number) => string;
}

export function Slider({ value, min, max, step = 1, onChange, formatValue }: SliderProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [draft, setDraft] = useState<number | null>(null);
  const thumbX = useSharedValue(0);

  // PanResponder 只创建一次，通过 ref 读取最新的区间与回调，避免闭包过期
  const cfg = useRef({ min, max, step, onChange });
  cfg.current.min = min;
  cfg.current.max = max;
  cfg.current.step = step;
  cfg.current.onChange = onChange;

  const widthRef = useRef(0);
  const travelRef = useRef(1);
  const draftRef = useRef(value);
  const shownRef = useRef(value);

  const travel = Math.max(width - THUMB, 1);

  useEffect(() => {
    if (draft !== null) return;
    const ratio = max > min ? (value - min) / (max - min) : 0;
    thumbX.value = withTiming(ratio * travel, { duration: 140 });
  }, [value, min, max, travel, draft, thumbX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => update(event.nativeEvent.locationX),
        onPanResponderMove: (event) => update(event.nativeEvent.locationX),
        onPanResponderRelease: () => commit(),
        onPanResponderTerminate: () => commit(),
      }),
    // 所有可变输入都经 ref 读取，故只建一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function update(locationX: number) {
    const { min: lo, max: hi, step: st } = cfg.current;
    const travelPx = travelRef.current;
    const px = Math.min(Math.max(locationX - THUMB / 2, 0), travelPx);
    thumbX.value = px;
    const raw = lo + (px / travelPx) * (hi - lo);
    const snapped = Math.min(Math.max(Math.round((raw - lo) / st) * st + lo, lo), hi);
    draftRef.current = snapped;
    if (shownRef.current !== snapped) {
      shownRef.current = snapped;
      setDraft(snapped);
    }
  }

  function commit() {
    const next = draftRef.current;
    shownRef.current = next;
    setDraft(null);
    cfg.current.onChange(next);
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    travelRef.current = Math.max(next - THUMB, 1);
    setWidth(next);
  };

  const fillStyle = useAnimatedStyle(() => ({ width: thumbX.value + THUMB / 2 }), []);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value }] }), []);

  const shown = draft ?? value;

  return (
    <View style={styles.row}>
      <View style={styles.track} onLayout={onLayout} {...panResponder.panHandlers}>
        <View style={[styles.rail, { backgroundColor: colors.surfaceAlt }]} />
        <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: colors.surface, borderColor: colors.accent },
            thumbStyle,
          ]}
        />
      </View>
      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
        {formatValue ? formatValue(shown) : String(shown)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  track: {
    flex: 1,
    height: ROW_H,
    justifyContent: 'center',
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (ROW_H - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
  },
  value: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
  },
});