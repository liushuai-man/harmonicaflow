/**
 * 视觉参数与方向几何的统一出口（见 docs/TECH_DESIGN.md §7.11）
 *
 * 页面与组件一律从这里 import，不直接引具体文件，便于日后整体搬迁/复用。
 */
export * from './params';
export * from './flow';