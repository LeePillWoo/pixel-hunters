import Phaser from 'phaser';
import galmuri9 from 'galmuri/dist/Galmuri9.woff2?url';
import galmuri11 from 'galmuri/dist/Galmuri11.woff2?url';
import { FONT_MD, FONT_SM } from './config';
import { initDisplay, mode, sizeFor } from './display';
import { claimInstance, showTakenOver } from './instance';
import { MainScene } from './scenes/MainScene';
import * as gameState from './state';

let game: Phaser.Game | null = null;
let takenOver = false;

// announce early, so an older window saves before this one loads the save
claimInstance(() => {
  takenOver = true;
  game?.loop.sleep();
  showTakenOver();
});

async function boot() {
  // canvas text needs the fonts ready before the first label is drawn
  const fonts = [new FontFace(FONT_SM, `url(${galmuri9})`), new FontFace(FONT_MD, `url(${galmuri11})`)];
  await Promise.all(fonts.map((f) => f.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined)));

  if (takenOver) return;

  const { w, h, zoom } = sizeFor(mode);
  const g = (game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: w,
    height: h,
    backgroundColor: '#14101c',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, zoom },
    scene: [MainScene],
  }));
  initDisplay(g);
  // dev console handle: __ph.state, __ph.bus
  if (import.meta.env.DEV) Object.assign(window, { __ph: gameState, __game: g });
}

void boot();
