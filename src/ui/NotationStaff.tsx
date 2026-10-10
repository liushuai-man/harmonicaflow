import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Score } from '../core/model';
import { buildNotation, type StaffSymbol } from '../core/notation';
import { NOTATION_BEAT_WIDTH, NOTATION_HEIGHT, NOTATION_STEP, WINDOW_STEP_MS, TILE_SIZE } from '../core/visual/params';
import { LEAD_IN_MS, type TimelineInfo } from '../player/timing';
import { useTheme } from '../theme/ThemeProvider';

function Glyph({ symbol, y, stepSize, color, ppq }: {
  symbol: StaffSymbol; y: number; stepSize: number; color: string; ppq: number;
}) {
  const { denominator: denominator, dotted, accidental } = symbol;
  const flags = denominator && denominator > 4 ? Math.log2(denominator / 4) : 0;
  const bottom = y + ((symbol.step ?? 34) - 30) * stepSize;
  const ledgers: number[] = [];
  if (symbol.step !== null) {
    for (let step = 28; step >= symbol.step; step -= 2) ledgers.push(bottom + (30 - step) * stepSize);
    for (let step = 40; step <= symbol.step; step += 2) ledgers.push(bottom + (30 - step) * stepSize);
  }
  return <Svg width={56} height={NOTATION_HEIGHT}>
    {symbol.step === null ? <G>
      {denominator === 1 || denominator === 2
        ? <Rect x={16} y={bottom - (denominator === 1 ? 6 : 5) * stepSize} width={11} height={4} fill={color} />
        : denominator && denominator >= 8
          ? <G><Line x1={24} x2={19} y1={bottom - 6 * stepSize} y2={bottom - stepSize} stroke={color} strokeWidth={2} />
            {Array.from({ length: Math.max(1, flags) }, (_, i) => <Ellipse key={i} cx={19} cy={bottom - 6 * stepSize + i * 5} rx={3} ry={2} fill={color} />)}</G>
          : <Path d={`M19 ${bottom - 7 * stepSize} l7 7 -7 6 6 7 q-10 -4 -5 4`} stroke={color} strokeWidth={2.5} fill="none" />}
    </G> : <G>
      {ledgers.map(ly => <Line key={ly} x1={12} x2={32} y1={ly} y2={ly} stroke={color} />)}
      {accidental !== null ? <SvgText x={3} y={y + 4} fontSize={15} fill={color}>{accidental === 1 ? '♯' : accidental === -1 ? '♭' : '♮'}</SvgText> : null}
      <Ellipse cx={22} cy={y} rx={6} ry={3.8} rotation={-16} origin={`22, ${y}`}
        fill={denominator === 1 || denominator === 2 ? 'none' : color} stroke={color} strokeWidth={1.4} />
      {denominator !== 1 ? <Line x1={28} x2={28} y1={y} y2={y - 25} stroke={color} strokeWidth={1.4} /> : null}
      {Array.from({ length: flags }, (_, i) => <Path key={i} d={`M28 ${y - 25 + i * 5} q12 6 4 14 q5 -7 -4 -9`} fill={color} />)}
    </G>}
    {dotted ? <Ellipse cx={34} cy={y - 2} rx={1.5} ry={1.5} fill={color} /> : null}
    {denominator === null ? <SvgText x={16} y={NOTATION_HEIGHT - 5} fontSize={9} fill={color}>{`${Number((symbol.duration / ppq).toFixed(3))}拍`}</SvgText> : null}
  </Svg>;
}

function StaffNote({ symbol, bottom, stepSize, pxPerTick, color, highlight, positionMs, timeline, ppq }: {
  symbol: StaffSymbol; bottom: number; stepSize: number; pxPerTick: number; color: string; highlight: string;
  positionMs: SharedValue<number>; timeline: TimelineInfo; ppq: number;
}) {
  const style = useAnimatedStyle(() => {
    const start = symbol.start * timeline.msPerTick + LEAD_IN_MS;
    return { opacity: positionMs.value >= start && positionMs.value < start + symbol.duration * timeline.msPerTick ? 1 : 0 };
  });
  const props = { symbol, y: bottom - ((symbol.step ?? 34) - 30) * stepSize, stepSize,
    ppq };
  return <View style={{ position: 'absolute', left: symbol.start * pxPerTick - 22, top: 0 }}>
    <Glyph {...props} color={color} />
    <Animated.View style={[StyleSheet.absoluteFill, style]}><Glyph {...props} color={highlight} /></Animated.View>
  </View>;
}

export function NotationStaff({ score, timeline, positionMs }: { score: Score; timeline: TimelineInfo; positionMs: SharedValue<number> }) {
  const { colors } = useTheme();
  const data = useMemo(() => buildNotation(score), [score]);
  const [width, setWidth] = useState(0);
  const [anchor, setAnchor] = useState(0);
  useAnimatedReaction(() => Math.floor(positionMs.value / WINDOW_STEP_MS), (bucket, previous) => {
    if (bucket !== previous) runOnJS(setAnchor)(bucket * WINDOW_STEP_MS);
  });
  const { pxPerTick, stepSize, bottom } = useMemo(() => {
    let shortest = score.ppq, min = 28, max = 40;
    for (const symbol of data.symbols) {
      shortest = Math.min(shortest, symbol.duration);
      if (symbol.step !== null) { min = Math.min(min, symbol.step); max = Math.max(max, symbol.step); }
    }
    const stepSize = Math.min(NOTATION_STEP, (NOTATION_HEIGHT - 48) / (max - min));
    return { pxPerTick: Math.max(NOTATION_BEAT_WIDTH / score.ppq, 36 / shortest), stepSize,
      bottom: 32 + (max - 30) * stepSize };
  }, [data, score.ppq]);
  const headerWidth = 47 + Math.abs(data.fifths) * 8;
  const cursorX = headerWidth + Math.max(0, width - headerWidth) * 0.35;
  const anchorTick = (anchor - LEAD_IN_MS) / timeline.msPerTick;
  const margin = WINDOW_STEP_MS * 2 / timeline.msPerTick;
  const from = anchorTick - cursorX / pxPerTick - margin;
  const to = anchorTick + (width - cursorX) / pxPerTick + margin;
  const visible = data.symbols.filter(s => s.start + s.duration >= from && s.start <= to);
  const tieTiles: number[] = [];
  for (let index = Math.max(0, Math.floor(from * pxPerTick / TILE_SIZE)); index * TILE_SIZE <= to * pxPerTick; index += 1) tieTiles.push(index);
  const bars: number[] = [];
  for (let bar = Math.max(0, Math.ceil(from / data.barTicks)); bar * data.barTicks <= to; bar += 1) bars.push(bar);
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: cursorX - (positionMs.value - LEAD_IN_MS) / timeline.msPerTick * pxPerTick }] }));
  const sharpSteps = [38, 35, 39, 36, 33, 37, 34];
  const flatSteps = [34, 37, 33, 36, 32, 35, 31];
  return <View style={{ backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
    <Text style={[styles.caption, { color: colors.textMuted }]}>五线谱 · 单旋律{data.warnings.length ? ` · ${data.warnings.join('；')}` : ''}</Text>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={styles.staff}>
      <Svg width={width} height={NOTATION_HEIGHT}>
        {Array.from({ length: 5 }, (_, i) => <Line key={i} x1={0} x2={width} y1={bottom - i * 2 * stepSize} y2={bottom - i * 2 * stepSize} stroke={colors.textMuted} strokeWidth={0.7} />)}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, strip]}>
        {bars.map(bar => <View key={`bar${bar}`} style={{ position: 'absolute', left: bar * data.barTicks * pxPerTick, top: bottom - 8 * stepSize, height: 8 * stepSize, borderLeftWidth: 1, borderColor: colors.border }} />)}
        {tieTiles.map(index => <View key={`tie${index}`} style={{ position: 'absolute', left: index * TILE_SIZE, top: 0 }}>
          <Svg width={TILE_SIZE} height={NOTATION_HEIGHT}>
            {visible.filter(symbol => symbol.tieOut).map(symbol => {
              const x = symbol.start * pxPerTick - index * TILE_SIZE + 3;
              const end = (symbol.start + symbol.duration) * pxPerTick - index * TILE_SIZE - 3;
              const y = bottom - ((symbol.step ?? 30) - 30) * stepSize + 8;
              return <Path key={symbol.id} d={`M${x} ${y} Q${(x + end) / 2} ${y + 12} ${end} ${y}`} fill="none" stroke={colors.text} />;
            })}
          </Svg>
        </View>)}
        {visible.map(symbol => <StaffNote key={symbol.id} symbol={symbol} bottom={bottom} stepSize={stepSize} pxPerTick={pxPerTick}
          color={colors.text} highlight={colors.accent} positionMs={positionMs} timeline={timeline} ppq={score.ppq} />)}
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', left: cursorX, top: 16, bottom: 10, borderLeftWidth: 1, borderColor: colors.accent }} />
      <View style={{ position: 'absolute', left: 0, top: 0, width: headerWidth, height: NOTATION_HEIGHT, backgroundColor: colors.surface }}>
        <Svg width={headerWidth} height={NOTATION_HEIGHT}>
          {Array.from({ length: 5 }, (_, i) => <Line key={i} x1={0} x2={headerWidth} y1={bottom - i * 2 * stepSize} y2={bottom - i * 2 * stepSize} stroke={colors.textMuted} strokeWidth={0.7} />)}
          <Path d={`M18 ${bottom + 8} C30 ${bottom + 20} 8 ${bottom + 23} 13 ${bottom + 10} M18 ${bottom + 13} L12 ${bottom - 48} C10 ${bottom - 62} 27 ${bottom - 51} 18 ${bottom - 39} C5 ${bottom - 26} 3 ${bottom - 14} 15 ${bottom - 9} C33 ${bottom - 3} 31 ${bottom - 31} 15 ${bottom - 25} C8 ${bottom - 22} 12 ${bottom - 14} 18 ${bottom - 16}`} fill="none" stroke={colors.text} strokeWidth={1.8} />
          {Array.from({ length: Math.abs(data.fifths) }, (_, i) => <SvgText key={i} x={30 + i * 8} y={bottom - ((data.fifths > 0 ? sharpSteps : flatSteps)[i] - 30) * stepSize + 4} fontSize={14} fill={colors.text}>{data.fifths > 0 ? '♯' : '♭'}</SvgText>)}
          <SvgText x={headerWidth - 10} y={bottom - 5 * stepSize} fontSize={13} fill={colors.text}>{score.timeSignature[0]}</SvgText>
          <SvgText x={headerWidth - 10} y={bottom - stepSize} fontSize={13} fill={colors.text}>{score.timeSignature[1]}</SvgText>
        </Svg>
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({ caption: { fontSize: 10, paddingHorizontal: 8 }, staff: { height: NOTATION_HEIGHT, overflow: 'hidden' } });
