import type { Hole, Score, SourceFormat } from '../core/model';
import { DEFAULT_LAYOUT_ID } from '../core/layouts';
import { detectFormat, parse } from '../core/parsers';
import { decodeUtf8 } from '../core/text';
import {
  DEFAULT_FLOW,
  DEFAULT_ONLINE_COVER,
  DEFAULT_OPACITY,
  DEFAULT_SKIN,
  DEFAULT_STAFF_BAR,
  DEFAULT_VIEW_ANGLE,
  type FlowSetting,
  type OpacityMode,
  type SkinMode,
  type StaffBarMode,
} from '../core/visual';
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
 *   - prefs.json           用户偏好
 *
 * 偏好里的**产品行为项**（落块方向 / 视角 / 皮肤 / 透明度 / 琴谱条 / 封面开关）
 * 一律是"可自由定义 + 顺手默认值"，不设互斥硬约束（见 docs/PRD.md §6.4）。
 */

export type ThemeMode = 'system' | 'light' | 'dark';

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
  /** 用户为这首曲目选的封面（本地图片 URI 或（开启开关后）缓存的远程 URL） */
  coverUri?: string;
}

export interface Prefs {
  layoutId: string;
  speed: number;
  /** 主题模式：跟随系统 / 浅色 / 深色 */
  themeMode: ThemeMode;
  /** 主色（#RRGGBB），深浅两套色板由它派生 */
  accent: string;
  /** 皮肤：白线（默认）/ 彩色 */
  skin: SkinMode;
  /** 透明度档位 */
  opacity: OpacityMode;
  /** 落块方向：从上到下 / 从左到右 / 自动（默认） */
  flow: FlowSetting;
  /** 视角角度（度）：0 = 100% 垂直，连续可调至 VIEW_ANGLE_MAX */
  viewAngle: number;
  /** 横向琴谱条：完整谱面 / 判定线附近精简提示 / 关闭 */
  staffBar: StaffBarMode;
  /** 是否允许拉取在线随机封面（默认关；离线优先） */
  onlineCover: boolean;
  /** 用户校对后的音阶表覆盖：layoutId → holes */
  layoutOverrides: Record<string, Hole[]>;
  /** 用户为该琴选择的调号：layoutId → 调号（如 'G'）；缺省时用预设自带调号 */
  layoutKeys: Record<string, string>;
}

export const DEFAULT_PREFS: Prefs = {
  layoutId: DEFAULT_LAYOUT_ID,
  speed: 1,
  themeMode: 'system',
  accent: DEFAULT_ACCENT,
  skin: DEFAULT_SKIN,
  opacity: DEFAULT_OPACITY,
  flow: DEFAULT_FLOW,
  viewAngle: DEFAULT_VIEW_ANGLE,
  staffBar: DEFAULT_STAFF_BAR,
  onlineCover: DEFAULT_ONLINE_COVER,
  layoutOverrides: {},
  layoutKeys: {},
};

const SCORES_DIR = 'scores';
const INDEX_PATH = 'library.json';
const PREFS_PATH = 'prefs.json';
/** 封面单独存：内置曲目不在 library.json 索引里，用 id → uri 映射才能一并覆盖 */
const COVERS_PATH = 'covers.json';
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

async function readCovers(): Promise<Record<string, string>> {
  const raw = await readText(COVERS_PATH);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const [imported, covers] = await Promise.all([readImportedIndex(), readCovers()]);
  return [...getBuiltInEntries(), ...imported].map((entry) =>
    covers[entry.id] ? { ...entry, coverUri: covers[entry.id] } : entry,
  );
}

/**
 * 记录某首曲目的封面（本地图片 URI，或开启在线开关后缓存的远程 URL）。
 * 传 `null` 清除。封面与曲库索引解耦，内置示例曲也能设封面。
 */
export async function setCoverUri(id: string, uri: string | null): Promise<void> {
  const covers = await readCovers();
  if (uri) covers[id] = uri;
  else delete covers[id];
  await writeText(COVERS_PATH, JSON.stringify(covers));
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
  await setCoverUri(id, null);
  await writeImportedIndex(entries.filter((e) => e.id !== id));
}

// ── 用户偏好 ────────────────────────────────────────────

/** 旧版本 `perspective` 枚举 → 角度（off→0 / weak→22 / strong→34） */
const LEGACY_PERSPECTIVE_ANGLE: Record<string, number> = { off: 0, weak: 22, strong: 34 };

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export async function loadPrefs(): Promise<Prefs> {
  const raw = await readText(PREFS_PATH);
  if (raw === null) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Partial<Prefs> & { perspective?: unknown };
    // 旧字段 `perspective`（枚举）升级为 `viewAngle`（数值）：读到时迁移，写回由下一次 savePrefs 完成
    const legacyAngle = LEGACY_PERSPECTIVE_ANGLE[String(parsed.perspective)];
    const viewAngle =
      typeof parsed.viewAngle === 'number' && parsed.viewAngle >= 0
        ? parsed.viewAngle
        : (legacyAngle ?? DEFAULT_PREFS.viewAngle);
    return {
      layoutId: parsed.layoutId ?? DEFAULT_PREFS.layoutId,
      speed: typeof parsed.speed === 'number' && parsed.speed > 0 ? parsed.speed : DEFAULT_PREFS.speed,
      themeMode: pickEnum(parsed.themeMode, ['system', 'light', 'dark'] as const, DEFAULT_PREFS.themeMode),
      accent:
        typeof parsed.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accent)
          ? parsed.accent
          : DEFAULT_PREFS.accent,
      skin: pickEnum(parsed.skin, ['mono', 'color'] as const, DEFAULT_PREFS.skin),
      opacity: pickEnum(parsed.opacity, ['solid', 'soft', 'glass'] as const, DEFAULT_PREFS.opacity),
      flow: pickEnum(parsed.flow, ['down', 'right', 'auto'] as const, DEFAULT_PREFS.flow),
      viewAngle,
      staffBar: pickEnum(parsed.staffBar, ['full', 'hint', 'off'] as const, DEFAULT_PREFS.staffBar),
      onlineCover: parsed.onlineCover === true,
      layoutOverrides: parsed.layoutOverrides ?? {},
      layoutKeys: parsed.layoutKeys ?? {},
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await writeText(PREFS_PATH, JSON.stringify(prefs));
}
