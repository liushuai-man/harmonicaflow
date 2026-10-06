import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { usePrefs } from '../store/prefs';
import { buildPalette, type Palette, type Scheme } from './palette';
import { buildTimelineSkin, type TimelineSkin } from './skin';

/**
 * 主题 Provider（见 docs/TECH_DESIGN.md §7.7）
 *
 * 主题模式、主色、皮肤与透明度来自用户偏好（PrefsProvider），
 * 解析出最终 scheme 后生成「语义色板 + 时间轴视觉令牌」，经 Context 下发给全部组件。
 *
 * 之所以把 `skin` 也放进主题层：时间轴的视觉令牌是「色板 × 皮肤 × 透明度」的组合，
 * 组件只按令牌取值，就无需各自拼装、也不会出现深浅/皮肤两套逻辑打架。
 */

interface ThemeValue {
  scheme: Scheme;
  colors: Palette;
  /** 时间轴视觉令牌（背景渐变 / 线条 / 音块画法 / 命中高亮） */
  skin: TimelineSkin;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const systemScheme = useColorScheme();

  const scheme: Scheme =
    prefs.themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : prefs.themeMode;

  const value = useMemo<ThemeValue>(() => {
    const colors = buildPalette(scheme, prefs.accent);
    return {
      scheme,
      colors,
      skin: buildTimelineSkin(scheme, prefs.skin, prefs.opacity, prefs.accent, colors),
    };
  }, [scheme, prefs.accent, prefs.skin, prefs.opacity]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}