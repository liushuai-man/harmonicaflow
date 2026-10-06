import { adjustLightness, readableOn, withAlpha } from './color';

/**
 * 主题色板（见 docs/TECH_DESIGN.md §7.7）
 *
 * - 语义色板：所有 UI 组件只引用这里的键，不再硬编码色值。
 * - 主色 `accent` 由用户在设置页选择；浅/深两套色板由它自动派生。
 * - 吹/吸为语义色（暖/冷），不随主色变化，保证"吹吸一眼可辨"。
 */

export type Scheme = 'light' | 'dark';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  placeholder: string;

  accent: string;
  accentSoft: string;
  onAccent: string;

  blow: string;
  blowPush: string;
  draw: string;
  drawPush: string;

  infeasible: string;
  infeasibleBorder: string;
  infeasibleText: string;

  playhead: string;
  success: string;
  danger: string;
  warningBg: string;
  warningText: string;
}

/** 语义色：吹 = 暖色，吸 = 冷色（与主色解耦，保证可辨） */
const BLOW = '#F2994A';
const BLOW_PUSH = '#F2C94C';
const DRAW = '#2F80ED';
const DRAW_PUSH = '#56CCF2';
const PLAYHEAD = '#EB5757';

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: '蓝', value: '#2F80ED' },
  { name: '靛', value: '#6C5CE7' },
  { name: '青', value: '#00B8A9' },
  { name: '绿', value: '#27AE60' },
  { name: '橙', value: '#F2994A' },
  { name: '玫红', value: '#EB5757' },
];

export function buildPalette(scheme: Scheme, accent: string): Palette {
  if (scheme === 'dark') {
    const accentDark = adjustLightness(accent, 0.12);
    return {
      background: '#101215',
      surface: '#181B20',
      surfaceAlt: '#22262C',
      text: '#ECEDEF',
      textMuted: '#9AA0A6',
      border: '#2C3138',
      placeholder: '#5A6069',

      accent: accentDark,
      accentSoft: withAlpha(accentDark, 0.22),
      onAccent: readableOn(accentDark),

      blow: BLOW,
      blowPush: BLOW_PUSH,
      draw: adjustLightness(DRAW, 0.12),
      drawPush: DRAW_PUSH,

      infeasible: '#2A2E34',
      infeasibleBorder: '#5A6069',
      infeasibleText: '#9AA0A6',

      playhead: PLAYHEAD,
      success: '#27AE60',
      danger: '#EB5757',
      warningBg: '#3A2E14',
      warningText: '#F2C94C',
    };
  }

  return {
    background: '#F5F6F8',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F3F6',
    text: '#1F2329',
    textMuted: '#8A8F98',
    border: '#E4E6EA',
    placeholder: '#C4C8CE',

    accent,
    accentSoft: withAlpha(accent, 0.12),
    onAccent: readableOn(accent),

    blow: BLOW,
    blowPush: BLOW_PUSH,
    draw: DRAW,
    drawPush: DRAW_PUSH,

    infeasible: '#E6E6E6',
    infeasibleBorder: '#9E9E9E',
    infeasibleText: '#666666',

    playhead: PLAYHEAD,
    success: '#27AE60',
    danger: '#EB5757',
    warningBg: '#FFF4E5',
    warningText: '#8A5B00',
  };
}
