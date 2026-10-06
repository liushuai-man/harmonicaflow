import type { Hole, Score, SourceFormat } from '../core/model';
import { DEFAULT_LAYOUT_ID } from '../core/layouts';
import { detectFormat, parse } from '../core/parsers';
import { decodeUtf8 } from '../core/text';
import {
  ensureDir,
  hashPickedFile,
  readBytes,
  readPickedBytes,
  readText,
  remove,
  writeBytes,
  writeText,
} from './docStore';

import twinkleSong from '../../assets/songs/twinkle.json';
import odeToJoySong from '../../assets/songs/ode-to-joy.json';

/**
 * 曲库与用户偏好的持久化（见 docs/TECH_DESIGN.md §8）
 *
 * 全部落在文档存储上（原生 expo-file-system / Web localStorage，见 docStore.ts），
 * 不引入 AsyncStorage：
 *   - scores/{id}.{ext}    导入的原始乐谱文件
 *   - library.json         曲库索引
 *   - prefs.json           用户偏好（口琴预设 / 倍速 / 主题 / 主色 / 透视 / 音阶表校对）
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type PerspectiveLevel = 'off' | 'weak' | 'strong';

/** 默认主色（品牌蓝），也是旧版本 prefs 缺失 accent 时的回落值 */
export const DEFAULT_ACCENT = '#2F80ED';

export interface LibraryEntry {
  id: string;
  title: string;
  source: SourceFormat;
  /** builtin = 随包内置示例曲；imported = 用户导入 */
  origin: 'builtin' | 'imported';
  /** imported：scores/ 下的文件名；builtin：BUILT_IN 的键 */
  fileName: string;
  noteCount: number;
  importedAt: number;
}

export interface Prefs {
  layoutId: string;
  speed: number;
  /** 主题模式：跟随系统 / 浅色 / 深色 */
  themeMode: ThemeMode;
  /** 主色（#RRGGBB），深浅两套色板由它派生 */
  accent: string;
  /** 纵向透视强度（近大远小） */
  perspective: PerspectiveLevel;
  /** 用户校对后的音阶表覆盖：layoutId → holes */
  layoutOverrides: Record<string, Hole[]>;
}

export const DEFAULT_PREFS: Prefs = {
  layoutId: DEFAULT_LAYOUT_ID,
  speed: 1,
  themeMode: 'system',
  accent: DEFAULT_ACCENT,
  perspective: 'weak',
  layoutOverrides: {},
};

const SCORES_DIR = 'scores';
const INDEX_PATH = 'library.json';
const PREFS_PATH = 'prefs.json';
const INDEX_VERSION = 1;

/** 内置示例曲：随包发布，无需拷贝到文件系统 */
const BUILT_IN: Record<string, unknown> = {
  'twinkle.json': twinkleSong,
  'ode-to-joy.json': odeToJoySong,
};

const scoreCache = new Map<string, Score>();

function scorePath(fileName: string): string {
  return `${SCORES_DIR}/${fileName}`;
}

// ── 曲库索引 ────────────────────────────────────────────

export function getBuiltInEntries(): LibraryEntry[] {
  return Object.entries(BUILT_IN).map(([fileName, data]) => {
    const raw = data as { title?: string; notes?: unknown[] };
    const id = `builtin:${fileName}`;
    return {
      id,
      title: typeof raw.title === 'string' && raw.title ? raw.title : fileName,
      source: 'json' as SourceFormat,
      origin: 'builtin' as const,
      fileName,
      noteCount: Array.isArray(raw.notes) ? raw.notes.length : 0,
      importedAt: 0,
    };
  });
}

async function readImportedIndex(): Promise<LibraryEntry[]> {
  const raw = await readText(INDEX_PATH);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as { entries?: LibraryEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries.filter((e) => e.origin === 'imported') : [];
  } catch {
    return [];
  }
}

async function writeImportedIndex(entries: LibraryEntry[]): Promise<void> {
  await writeText(INDEX_PATH, JSON.stringify({ version: INDEX_VERSION, entries }));
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  return [...getBuiltInEntries(), ...(await readImportedIndex())];
}

// ── 读取乐谱 ────────────────────────────────────────────

export async function loadScore(entry: LibraryEntry): Promise<Score> {
  const cached = scoreCache.get(entry.id);
  if (cached) return cached;

  let content: string | Uint8Array;
  if (entry.origin === 'builtin') {
    content = JSON.stringify(BUILT_IN[entry.fileName] ?? {});
  } else if (/\.mxl$/i.test(entry.fileName)) {
    const bytes = await readBytes(scorePath(entry.fileName));
    if (bytes === null) throw new Error(`谱面文件缺失：${entry.fileName}`);
    content = bytes;
  } else {
    const text = await readText(scorePath(entry.fileName));
    if (text === null) throw new Error(`谱面文件缺失：${entry.fileName}`);
    content = text;
  }

  const score = parse(content, entry.fileName, entry.id);
  scoreCache.set(entry.id, score);
  return score;
}

// ── 导入 ────────────────────────────────────────────────

export interface ImportResult {
  entry: LibraryEntry;
  /** 内容哈希去重命中：没有重复写入文件 */
  duplicated: boolean;
}

export async function importScore(uri: string, name: string): Promise<ImportResult> {
  const format = detectFormat(name);
  if (!format) {
    throw new Error(`不支持的格式：${name}（支持 .json / .abc / .musicxml / .xml / .mxl）`);
  }

  const isZip = /\.mxl$/i.test(name);
  const bytes = await readPickedBytes(uri);
  const text = isZip ? '' : decodeUtf8(bytes);
  const id = `s${await hashPickedFile(uri, bytes)}`;

  const extension = (name.split('.').pop() ?? 'json').toLowerCase();
  const fileName = `${id}.${extension}`;
  const score = parse(isZip ? bytes : text, name, id);

  const entries = await readImportedIndex();
  const existing = entries.find((e) => e.id === id);
  if (existing) {
    scoreCache.set(id, score);
    return { entry: existing, duplicated: true };
  }

  ensureDir(SCORES_DIR);
  if (isZip) await writeBytes(scorePath(fileName), bytes);
  else await writeText(scorePath(fileName), text);

  const entry: LibraryEntry = {
    id,
    title: score.title,
    source: score.source,
    origin: 'imported',
    fileName,
    noteCount: score.events.length,
    importedAt: Date.now(),
  };
  await writeImportedIndex([...entries, entry]);
  scoreCache.set(id, score);
  return { entry, duplicated: false };
}

export async function deleteEntry(id: string): Promise<void> {
  const entries = await readImportedIndex();
  const target = entries.find((e) => e.id === id);
  if (!target) return;
  await remove(scorePath(target.fileName));
  scoreCache.delete(id);
  await writeImportedIndex(entries.filter((e) => e.id !== id));
}

// ── 用户偏好 ────────────────────────────────────────────

export async function loadPrefs(): Promise<Prefs> {
  const raw = await readText(PREFS_PATH);
  if (raw === null) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      layoutId: parsed.layoutId ?? DEFAULT_PREFS.layoutId,
      speed: typeof parsed.speed === 'number' && parsed.speed > 0 ? parsed.speed : DEFAULT_PREFS.speed,
      themeMode:
        parsed.themeMode === 'light' || parsed.themeMode === 'dark' || parsed.themeMode === 'system'
          ? parsed.themeMode
          : DEFAULT_PREFS.themeMode,
      accent:
        typeof parsed.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent)
          ? parsed.accent
          : DEFAULT_PREFS.accent,
      perspective:
        parsed.perspective === 'off' || parsed.perspective === 'strong' || parsed.perspective === 'weak'
          ? parsed.perspective
          : DEFAULT_PREFS.perspective,
      layoutOverrides: parsed.layoutOverrides ?? {},
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await writeText(PREFS_PATH, JSON.stringify(prefs));
}
