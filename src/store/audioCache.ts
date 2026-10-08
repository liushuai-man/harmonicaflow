import {
  ensureDir,
  fileUri,
  readPickedBytes,
  remove,
  supportsBinaryCache,
  writeBytes,
} from './docStore';

/**
 * 曲目伴奏音频（见 docs/TECH_DESIGN.md §8 / §12.2）
 *
 * 用户选一个本地音频作为某首曲目的伴奏，经 docStore 复制进应用沙盒后长期可用
 * （选文件给的缓存目录会被系统回收，不能只记临时 URI）。
 *
 * - **持久引用**：原生返回相对路径（`audio/xxx.mp3`），由 library.ts 记进 `audio.json`；
 * - **Web 端无文件系统**：`localStorage` 只有 5MB 配额，存音频字节会直接撑爆，
 *   因此 Web 端不落字节，直接把选中的原始 URI 当引用保存（该 URI 会随会话失效，属已知限制）。
 */

const AUDIO_DIR = 'audio';

/**
 * 曲目 id → 安全的文件名。
 * 内置曲 id 形如 `builtin:twinkle.json`（含冒号），直接用会污染文件名 / file URI，故只保留字母数字与 `-_`。
 */
function audioFileName(id: string, name: string): string {
  const ext = (name.split('.').pop() ?? 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
  return `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
}

/**
 * 把用户选中的本地音频收进应用沙盒，返回**持久引用**。
 * 原生返回相对路径（由 docStore 解析为可播 URI）；Web 端直接返回原始 URI。
 */
export async function importLocalAudio(id: string, pickedUri: string, name: string): Promise<string> {
  if (!supportsBinaryCache) return pickedUri;
  const bytes = await readPickedBytes(pickedUri);
  ensureDir(AUDIO_DIR);
  const relative = `${AUDIO_DIR}/${audioFileName(id, name)}`;
  await writeBytes(relative, bytes);
  return relative;
}

/**
 * 持久引用 → 可播 URI。
 * 原生：文件被外部删除时返回 undefined（调用方据此提示「伴奏已失效」）；Web：直接返回引用。
 */
export function resolveAudioUri(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (!supportsBinaryCache) return ref;
  return fileUri(ref) ?? undefined;
}

/** 删除曲目 / 替换伴奏时清掉沙盒里的旧文件（Web 端无本地文件，无需处理）。 */
export async function removeLocalAudio(ref: string | undefined): Promise<void> {
  if (!ref || !supportsBinaryCache) return;
  await remove(ref);
}