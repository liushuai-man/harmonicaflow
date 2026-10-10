import { CULL_MARGIN_MS, TILE_SIZE, TILE_MAX_PHYSICAL_SIZE } from './params';

export function tileSize(density: number): number {
  return Math.min(TILE_SIZE, TILE_MAX_PHYSICAL_SIZE / Math.max(1, density));
}

/** 固定时间原点分片；窗口锚点只选编号，不进入分片坐标。 */
export function visibleTiles(positionMs: number, ahead: number, pxPerMs: number, size: number, totalMs: number): number[] {
  const from = Math.max(0, Math.floor((positionMs - CULL_MARGIN_MS) * pxPerMs / size));
  const to = Math.min(Math.floor(totalMs * pxPerMs / size),
    Math.ceil(((positionMs + CULL_MARGIN_MS) * pxPerMs + ahead) / size));
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

export function tileNote(startPx: number, span: number, index: number, size: number) {
  const end = (index + 1) * size;
  const along = end - startPx - span;
  return {
    along,
    visible: startPx < end && startPx + span > index * size,
    label: startPx + span / 2 >= index * size && startPx + span / 2 < end,
  };
}
