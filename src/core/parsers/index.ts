import type { Score, SourceFormat } from '../model';
import { decodeUtf8 } from '../text';
import { parseAbc } from './abc';
import { parseJson } from './json';
import { parseMusicXml } from './musicxml';

export { parseAbc, parseJson, parseMusicXml };
export { DEFAULT_PPQ, parseFraction } from './json';

/** 扩展名 → 来源格式；无法识别返回 null */
export function detectFormat(filename: string): SourceFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'json':
      return 'json';
    case 'abc':
    case 'txt':
      return 'abc';
    case 'musicxml':
    case 'xml':
    case 'mxl':
      return 'musicxml';
    default:
      return null;
  }
}

/** FNV-1a 32 位哈希（base36），用于曲目 id 与导入去重 */
export function simpleHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** 同上，但直接吃字节，用于二进制谱面（.mxl）去重 */
export function simpleHashBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 统一解析入口：按文件扩展名分派到对应解析器。
 *
 * @param content 文本内容，或二进制内容（仅 .mxl 需要）
 * @param filename 用于判断格式
 * @param id 曲目 id（不传则按内容哈希生成）
 */
export function parse(content: string | Uint8Array, filename: string, id?: string): Score {
  const format = detectFormat(filename);
  if (!format) {
    throw new Error(`不支持的乐谱格式：${filename}（支持 .json / .abc / .musicxml / .xml / .mxl）`);
  }

  const resolvedId = id ?? `s${simpleHash(typeof content === 'string' ? content : filename + content.length)}`;

  if (format === 'musicxml') {
    // .mxl 需要原始字节交给 fflate 解压
    if (typeof content !== 'string' && /\.mxl$/i.test(filename)) {
      return parseMusicXml(content, resolvedId);
    }
    return parseMusicXml(typeof content === 'string' ? content : decodeUtf8(content), resolvedId);
  }

  const text = typeof content === 'string' ? content : decodeUtf8(content);
  return format === 'json' ? parseJson(text, resolvedId) : parseAbc(text, resolvedId);
}
