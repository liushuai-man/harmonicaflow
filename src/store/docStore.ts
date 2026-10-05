import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { simpleHashBytes } from '../core/parsers';

/**
 * 文档存储抽象（见 docs/TECH_DESIGN.md §8）
 *
 * expo-file-system 在 SDK 57 只有原生实现 —— Web 上构造 `Directory` / 访问
 * `Paths.document` 会直接抛错，导致整个路由树挂掉。所以这里做一层极薄的
 * 平台分支：**原生走 expo-file-system，Web 走 localStorage**。
 * 上层曲库逻辑（library.ts）与三个页面完全不感知差异。
 *
 * 相对路径统一用 '/' 分隔，例如 'library.json'、'scores/sabc.json'。
 */

const WEB_PREFIX = 'harmonicaflow:';
const IS_WEB = Platform.OS === 'web';

interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 走 globalThis 取浏览器 API，避免为 Web 端引入 DOM lib 类型 */
const webGlobal = globalThis as unknown as {
  localStorage?: WebStorage;
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
};

function requireStorage(): WebStorage {
  const storage = webGlobal.localStorage;
  if (!storage) throw new Error('当前环境不支持 localStorage，无法持久化曲库');
  return storage;
}

function bytesToBase64(bytes: Uint8Array): string {
  const encode = webGlobal.btoa;
  if (!encode) throw new Error('当前环境不支持 btoa');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return encode(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const decode = webGlobal.atob;
  if (!decode) throw new Error('当前环境不支持 atob');
  const binary = decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 相对路径 → expo-file-system File（仅原生调用） */
function nativeFile(relative: string): File {
  const segments = relative.split('/');
  const name = segments.pop() ?? relative;
  return new File(new Directory(Paths.document, ...segments), name);
}

export function ensureDir(relative: string): void {
  if (IS_WEB) return;
  const dir = new Directory(Paths.document, ...relative.split('/'));
  if (!dir.exists) dir.create();
}

export async function readText(relative: string): Promise<string | null> {
  if (!IS_WEB) {
    const file = nativeFile(relative);
    if (!file.exists) return null;
    return file.text();
  }
  const raw = requireStorage().getItem(WEB_PREFIX + relative);
  return raw !== null && raw.startsWith('t:') ? raw.slice(2) : null;
}

export async function writeText(relative: string, value: string): Promise<void> {
  if (!IS_WEB) {
    const file = nativeFile(relative);
    if (!file.exists) file.create();
    file.write(value);
    return;
  }
  requireStorage().setItem(WEB_PREFIX + relative, `t:${value}`);
}

export async function readBytes(relative: string): Promise<Uint8Array | null> {
  if (!IS_WEB) {
    const file = nativeFile(relative);
    if (!file.exists) return null;
    return file.bytes();
  }
  const raw = requireStorage().getItem(WEB_PREFIX + relative);
  return raw !== null && raw.startsWith('b:') ? base64ToBytes(raw.slice(2)) : null;
}

export async function writeBytes(relative: string, value: Uint8Array): Promise<void> {
  if (!IS_WEB) {
    const file = nativeFile(relative);
    if (!file.exists) file.create();
    file.write(value);
    return;
  }
  requireStorage().setItem(WEB_PREFIX + relative, `b:${bytesToBase64(value)}`);
}

export async function remove(relative: string): Promise<void> {
  if (!IS_WEB) {
    const file = nativeFile(relative);
    if (file.exists) file.delete();
    return;
  }
  requireStorage().removeItem(WEB_PREFIX + relative);
}

/** 读取用户选中的谱面文件：原生用 File，Web 用 fetch（blob:/data: URL 均可） */
export async function readPickedBytes(uri: string): Promise<Uint8Array> {
  if (!IS_WEB) return new File(uri).bytes();
  const response = await fetch(uri);
  return new Uint8Array(await response.arrayBuffer());
}

/** 选中文件的内容哈希，用于导入去重（原生优先用 md5） */
export async function hashPickedFile(uri: string, bytes: Uint8Array): Promise<string> {
  if (!IS_WEB) {
    try {
      const md5 = new File(uri).md5;
      if (md5) return md5;
    } catch {
      // 读不到 md5 时回退到内容哈希
    }
  }
  return simpleHashBytes(bytes);
}
