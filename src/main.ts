import Phaser from 'phaser';
import galmuri9 from 'galmuri/dist/Galmuri9.woff2?url';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import { FONT_MD, FONT_SM, GAME_H, GAME_W } from './config';
import { MainScene } from './scenes/MainScene';
import * as gameState from './state';

/** Largest whole-number zoom that fits the window (pixel art must not be scaled by fractions). */
function fitZoom() {
  const z = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
  return z >= 1 ? Math.floor(z) : z;
}

async function boot() {
  // canvas text needs the fonts ready before the first label is drawn
  const fonts = [new FontFace(FONT_SM, `url(${galmuri9})`), new FontFace(FONT_MD, `url(${galmuri11})`)];
  await Promise.all(fonts.map((f) => f.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined)));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#14101c',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, zoom: fitZoom() },
    scene: [MainScene],
  });
  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
  // dev console handle: __ph.state, __ph.bus
  if (import.meta.env.DEV) Object.assign(window, { __ph: gameState, __game: game });
}

void boot();
