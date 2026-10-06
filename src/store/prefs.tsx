import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './library';

/**
 * 偏好状态的唯一来源（见 docs/TECH_DESIGN.md §8）
 *
 * 设置页与主题层共用同一份内存状态，写操作统一走 `updatePrefs(patch)`
 * 做「读-合并-写」，避免两处各自 `savePrefs` 互相覆盖。
 */

interface PrefsContextValue {
  prefs: Prefs;
  /** 首次从磁盘读取完成前为 false（此时用 DEFAULT_PREFS 兜底） */
  ready: boolean;
  updatePrefs: (patch: Partial<Prefs>) => Promise<void>;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  // 用 ref 镜像最新值，保证连续调用 updatePrefs 时不丢字段（不依赖 setState 回调时序）
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    let cancelled = false;
    loadPrefs().then((loaded) => {
      if (cancelled) return;
      prefsRef.current = loaded;
      setPrefs(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<Prefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    await savePrefs(next);
  }, []);

  return (
    <PrefsContext.Provider value={{ prefs, ready, updatePrefs }}>{children}</PrefsContext.Provider>
  );
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs 必须在 PrefsProvider 内使用');
  return ctx;
}
