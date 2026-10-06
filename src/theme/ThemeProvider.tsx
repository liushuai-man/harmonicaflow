import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { usePrefs } from '../store/prefs';
import { buildPalette, type Palette, type Scheme } from './palette';

/**
 * 主题 Provider（见 docs/TECH_DESIGN.md §7.7）
 *
 * 主题模式与主色来自用户偏好（PrefsProvider），
 * 解析出最终 scheme 后生成色板，经 Context 下发给全部组件。
 */

interface ThemeValue {
  scheme: Scheme;
  colors: Palette;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const systemScheme = useColorScheme();

  const scheme: Scheme =
    prefs.themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : prefs.themeMode;

  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: buildPalette(scheme, prefs.accent) }),
    [scheme, prefs.accent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}
