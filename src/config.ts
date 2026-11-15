import Phaser from 'phaser';

// Internal resolution; the canvas is scaled up by whole numbers only.
export const GAME_W = 640;
export const GAME_H = 360;

export const TOP_H = 20;
export const TOWER = { x: 0, y: 20, w: 240, h: 340 };
export const BATTLE = { x: 240, y: 20, w: 400, h: 180 };
export const MERGE = { x: 240, y: 200, w: 400, h: 160 };

export const CELL = 34;
export const GRID_COLS = 8;
export const GRID_ROWS = 4;
export const GRID_X = MERGE.x + 8;
export const GRID_Y = MERGE.y + 12;

export const DEPTH = { bg: 0, ui: 5, item: 10, fly: 90, drag: 100, fx: 110, modal: 200, toast: 300 };

export const FONT_SM = 'Galmuri9';
export const FONT_MD = 'Galmuri11';

export interface LabelOpts {
  size?: 'sm' | 'md';
  color?: string;
  stroke?: boolean;
  origin?: [number, number];
  wrap?: number;
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, opts: LabelOpts = {}) {
  const md = opts.size === 'md';
  const t = scene.add.text(Math.round(x), Math.round(y), text, {
    fontFamily: md ? FONT_MD : FONT_SM,
    fontSize: md ? '12px' : '10px',
    color: opts.color ?? '#f6ecd8',
    padding: { x: 1, y: 1 },
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
  });
  if (opts.stroke) t.setStroke('#241a1c', 3);
  if (opts.origin) t.setOrigin(opts.origin[0], opts.origin[1]);
  return t;
}
