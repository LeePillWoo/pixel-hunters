import Phaser from 'phaser';
import { BATTLE, DEPTH, label, type LabelOpts } from '../config';

export interface ButtonOpts {
  key?: 'btn' | 'btn_yellow' | 'btn_dark';
  text?: LabelOpts;
  icon?: number; // frame of icons.png, drawn left of the label
}

export type Button = Phaser.GameObjects.Container & { setLabel(text: string): void; setEnabled(on: boolean): void };

/** Nine-slice button. x/y is the top-left corner. */
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, onClick: () => void, opts: ButtonOpts = {},
): Button {
  const c = scene.add.container(Math.round(x + w / 2), Math.round(y + h / 2)) as Button;
  const bg = scene.add.nineslice(0, 0, opts.key ?? 'btn', undefined, w, h, 6, 6, 6, 6);
  const dark = opts.key !== 'btn_dark';
  const t = label(scene, opts.icon === undefined ? 0 : 8, -1, text, {
    color: dark ? '#3a1e18' : '#f6ecd8', origin: [0.5, 0.5], ...opts.text,
  });
  c.add([bg, t]);
  if (opts.icon !== undefined) c.add(scene.add.image(Math.round(-t.width / 2 - 4), 0, 'icons', opts.icon));
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  let enabled = true;
  c.on('pointerdown', () => {
    if (!enabled) return;
    bg.setTint(0xcccccc);
    scene.time.delayedCall(80, () => bg.active && bg.clearTint());
    onClick();
  });
  c.setLabel = (s: string) => t.setText(s);
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.setAlpha(on ? 1 : 0.45);
  };
  return c;
}

/** Number / word that pops up and drifts away. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffffff', size: 'sm' | 'md' = 'md') {
  const t = label(scene, x, y, text, { size, color, stroke: true, origin: [0.5, 0.5] }).setDepth(DEPTH.fx);
  scene.tweens.add({ targets: t, y: y - 22, alpha: { from: 1, to: 0 }, duration: 800, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
}

let toasts = 0;

/** Banner message over the battle view. */
export function toast(scene: Phaser.Scene, text: string) {
  const y = BATTLE.y + 60 + (toasts % 3) * 16;
  toasts++;
  const t = label(scene, BATTLE.x + BATTLE.w / 2, y, text, { size: 'md', color: '#ffe890', stroke: true, origin: [0.5, 0.5] })
    .setDepth(DEPTH.toast);
  scene.tweens.add({
    targets: t, y: y - 10, alpha: { from: 1, to: 0 }, delay: 1600, duration: 500,
    onComplete: () => {
      t.destroy();
      toasts = Math.max(0, toasts - 1);
    },
  });
}

/** Little burst of square sparkles. */
export function sparkle(scene: Phaser.Scene, x: number, y: number, color = 0xffe890, count = 8) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const r = scene.add.rectangle(x, y, 2, 2, color).setDepth(DEPTH.fx);
    scene.tweens.add({
      targets: r, x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, alpha: 0, duration: 380, ease: 'Quad.easeOut',
      onComplete: () => r.destroy(),
    });
  }
}
