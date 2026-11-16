// Screen modes: 'full' is the 640x360 three-panel screen, 'strip' a small widget meant for the
// bottom-right corner of the desktop (a Chrome popup window on the web, or the desktop app).
import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';

export type Mode = 'full' | 'strip';

export const STRIP_W = 360; // internal size of the mini widget
export const STRIP_H = 96;
const MINI_ZOOM = 2; // the mini window is drawn at 2x (720x192)
const MODE_KEY = 'pixel-hunters-mode';

/** Bridge exposed by electron/preload.cjs when running as the desktop app. */
interface DesktopApi {
  setMode(mode: Mode): Promise<void>;
  hide(): void;
  onMode(cb: (mode: Mode) => void): void;
}
export const desktop: DesktopApi | undefined = (window as unknown as { desktop?: DesktopApi }).desktop;

/** True in the small popup window opened by openMiniWindow(). */
export const isPopup = new URLSearchParams(location.search).has('mini');

function initialMode(): Mode {
  if (isPopup) return 'strip';
  if (!desktop) return 'full';
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'full' || m === 'strip') return m;
  } catch {
    // storage blocked
  }
  return 'strip';
}

export let mode: Mode = initialMode();
let game: Phaser.Game | null = null;
let layoutKey = '';
let pendingOpen: string | undefined;

/** Game size and zoom for a mode in the current window. */
export function sizeFor(m: Mode) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (m === 'strip') {
    const zoom = Math.max(1, Math.min(Math.floor(H / STRIP_H), Math.floor(W / STRIP_W)));
    return { w: STRIP_W, h: STRIP_H, zoom };
  }
  const z = Math.min(W / GAME_W, H / GAME_H);
  return { w: GAME_W, h: GAME_H, zoom: z >= 1 ? Math.floor(z) : z };
}

/** Content size of the popup window for a mode, fitted to the screen. */
function popupSize(m: Mode) {
  if (m === 'strip') return { w: STRIP_W * MINI_ZOOM, h: STRIP_H * MINI_ZOOM };
  const k = Math.max(1, Math.min(2, Math.floor((screen.availWidth - 40) / GAME_W), Math.floor((screen.availHeight - 80) / GAME_H)));
  return { w: GAME_W * k, h: GAME_H * k };
}

/** Resizes this popup and docks it to the bottom-right corner of the screen. */
function dockPopup(m: Mode) {
  const { w, h } = popupSize(m);
  const ow = w + (window.outerWidth - window.innerWidth);
  const oh = h + (window.outerHeight - window.innerHeight);
  try {
    window.resizeTo(ow, oh);
    const s = screen as Screen & { availLeft?: number; availTop?: number };
    window.moveTo((s.availLeft ?? 0) + screen.availWidth - ow, (s.availTop ?? 0) + screen.availHeight - oh);
  } catch {
    // the browser refused; the layout still adapts to whatever size the window has
  }
}

/** Resizes the canvas to the window; restarts the scene when the layout itself changed. */
function relayout() {
  if (!game) return;
  const { w, h, zoom } = sizeFor(mode);
  game.scale.setGameSize(w, h);
  game.scale.setZoom(zoom);
  const key = `${mode}:${w}x${h}`;
  if (key === layoutKey) return;
  layoutKey = key;
  const scene = game.scene.getScene('main');
  if (scene?.sys.isActive()) scene.scene.restart({ open: pendingOpen });
  pendingOpen = undefined;
}

export function initDisplay(g: Phaser.Game) {
  game = g;
  const { w, h } = sizeFor(mode);
  layoutKey = `${mode}:${w}x${h}`;
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(relayout, 60);
  });
  desktop?.onMode((m) => void setMode(m));
  void desktop?.setMode(mode); // the window opens small; match the remembered mode
  if (isPopup) dockPopup(mode);
}

/** Switch modes. `open` names a window (e.g. 'quests') to open once the new layout is up. */
export async function setMode(m: Mode, open?: string) {
  if (m === mode && !open) return;
  mode = m;
  pendingOpen = open;
  if (desktop) {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // not remembered
    }
    await desktop.setMode(m); // the window resize triggers relayout
  } else if (isPopup) dockPopup(m);
  layoutKey = '';
  relayout();
}

/**
 * Opens the game as a small window in the bottom-right corner (web). Call from a click.
 * Returns false when the browser blocked the popup.
 */
export function openMiniWindow(): boolean {
  if (isPopup || desktop) {
    void setMode('strip');
    return true;
  }
  const { w, h } = popupSize('strip');
  const s = screen as Screen & { availLeft?: number; availTop?: number };
  const left = (s.availLeft ?? 0) + screen.availWidth - w - 16;
  const top = (s.availTop ?? 0) + screen.availHeight - h - 60;
  const url = `${location.pathname}?mini`;
  const win = window.open(url, 'pixel-hunters-mini', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
  return !!win;
}
