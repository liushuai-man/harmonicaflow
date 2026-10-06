import {
  ensureDir,
  fileUri,
  readPickedBytes,
  supportsBinaryCache,
  writeBytes,
} from './docStore';

/**
 * 音乐封面（见 docs/TECH_DESIGN.md §7.10）
 *
 * 优先级：用户指定的封面 → 在线随机封面（仅在开关打开时）→ 占位图（由 UI 负责）。
 *
 * - **本地优先、离线可用**：在线图拉取成功后落到本地，下次直接读本地，不再联网；
 * - **Web 端只记 URL、不缓存字节**：`localStorage` 只有 5MB 配额，存图片会直接撑爆，
 *   因此 Web 端把远程 URL 记进 coverUri 即可（`supportsBinaryCache === false`）。
 */

const COVERS_DIR = 'covers';

/**
 * 曲目 id → 安全的文件名。
 * 内置曲的 id 形如 `builtin:twinkle.json`（含冒号），直接用会污染文件名 / file URI，故只保留字母数字与 `-_`。
 */
function coverFileName(id: string): string {
  return `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;
}

/** 在线随机封面地址：用 id 做种子，同一首曲每次拿到同一张图 */
export function onlineCoverUrl(id: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(id)}/400/400`;
}

/**
 * 把用户选中的本地图片收进应用沙盒，返回可长期使用的 URI。
 * 原生端拷字节（选图给的缓存目录会被系统回收）；Web 端没有文件系统，直接用原 URI。
 */
export async function importLocalCover(id: string, pickedUri: string): Promise<string> {
  if (!supportsBinaryCache) return pickedUri;
  try {
    const bytes = await readPickedBytes(pickedUri);
    ensureDir(COVERS_DIR);
    const relative = `${COVERS_DIR}/${coverFileName(id)}`;
    await writeBytes(relative, bytes);
    return fileUri(relative) ?? pickedUri;
  } catch {
    return pickedUri;
  }
}

/**
 * 拉取并缓存在线封面，返回可直接显示的 URI；失败返回 null（调用方回退占位图）。
 * 调用方负责把返回值写进 `setCoverUri`，避免每次渲染都重复请求。
 */
export async function fetchOnlineCover(id: string): Promise<string | null> {
  const url = onlineCoverUrl(id);
  if (!supportsBinaryCache) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    ensureDir(COVERS_DIR);
    const relative = `${COVERS_DIR}/${coverFileName(id)}`;
    await writeBytes(relative, bytes);
    return fileUri(relative) ?? url;
  } catch {
    return null;
  }
}