import Phaser from 'phaser';
import { unlockAudio } from '../audio';
import { BATTLE } from '../config';
import sprites from '../data/sprites.json';
import { mode, setMode } from '../display';
import { drainChests, placeItem } from '../logic';
import { BattlePanel, type BattleHooks } from '../panels/BattlePanel';
import { MergePanel } from '../panels/MergePanel';
import { QuestTracker } from '../panels/QuestTracker';
import { StripHud, stripLayout } from '../panels/StripHud';
import { TopBar } from '../panels/TopBar';
import { TowerPanel } from '../panels/TowerPanel';
import { sim } from '../sim';
import { bus, chestCap, chestOf, loadState, produceOffline, resetState, saveState, state, tickProduction } from '../state';
import { closeModal, openCodex, openCompanions, openCraft, openMessage, openQuests, openStorage } from '../ui/modals';
import { setToastAnchor, toast } from '../ui/widgets';

const AUTOSAVE_MS = 10_000;
const STEP = 0.1; // seconds per simulation step while catching up
const MAX_CATCHUP = 30 * 60; // simulate at most this much in full; beyond it only production counts
const LIVE_MAX_DT = 0.25;

let booted = false; // the save is loaded once; mode switches restart the scene but keep the live state

/** One scene, two layouts: the full three-panel screen and the taskbar strip. */
export class MainScene extends Phaser.Scene {
  private battle!: BattlePanel;
  private tower: TowerPanel | null = null;
  private merge: MergePanel | null = null;
  private tracker: QuestTracker | null = null;
  private strip: StripHud | null = null;
  private lastWall = 0;

  constructor() {
    super('main');
  }

  preload() {
    const sheet = (key: string, w: number, h: number) => this.load.spritesheet(key, `assets/${key}.png`, { frameWidth: w, frameHeight: h });
    for (const key of ['hunter', 'dragon', 'slash', 'companions'] as const) sheet(key, sprites[key].frameWidth, sprites[key].frameHeight);
    sheet('items', 24, 24);
    sheet('slot', 34, 34);
    sheet('chest', 16, 16);
    sheet('icons', 16, 16);
    sheet('weak', 24, 24);
    sheet('slime', 32, 32);
    for (const key of ['panel', 'btn', 'btn_yellow', 'btn_dark', 'coin', 'broken', 'bg_forest', 'bg_lair', 'row_bg', 'bubble']) {
      this.load.image(key, `assets/${key}.png`);
    }
  }

  create(data: { open?: string } = {}) {
    // listeners from the previous layout must not outlive it
    bus.removeAllListeners();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => bus.removeAllListeners());
    this.tower = this.merge = this.tracker = this.strip = null;

    const first = !booted;
    const away = first ? loadState() : 0;
    if (first) {
      booted = true;
      window.addEventListener('beforeunload', saveState);
      document.addEventListener('visibilitychange', () => document.hidden && saveState());
    }

    if (mode === 'strip') this.buildStrip();
    else this.buildFull();

    bus.on('toast', (text: string) => toast(this, text));
    this.input.keyboard?.on('keydown-ESC', () => closeModal());
    this.input.on('pointerdown', unlockAudio);
    this.input.keyboard?.on('keydown', unlockAudio);
    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: saveState });

    this.lastWall = Date.now();
    if (away > 10) this.welcomeBack(away);
    if (data.open) bus.emit('modal', data.open);
  }

  private buildFull() {
    setToastAnchor(BATTLE.x + BATTLE.w / 2, BATTLE.y + 60);
    const merge = (this.merge = new MergePanel(this));
    this.tower = new TowerPanel(this, { flyIn: (id, x, y, delay) => merge.flyIn(id, x, y, delay) });
    this.battle = new BattlePanel(this, {
      storagePos: () => merge.storagePos(),
      // monster drops go to the grid; when it's full they wait in that floor's chest (if the floor is conquered)
      drop: (id, x, y, floor, delay) => {
        if (sim.fast ? placeItem(id) : merge.flyIn(id, x, y, delay)) return;
        this.toChest(id, floor);
      },
    });
    this.tracker = new QuestTracker(this);
    new TopBar(this, () => {
      resetState();
      window.location.reload();
    });

    bus.on('modal', (name: string, arg?: number) => {
      if (name === 'craft') openCraft(this);
      else if (name === 'quests') openQuests(this);
      else if (name === 'codex') openCodex(this);
      else if (name === 'storage') openStorage(this, (id) => merge.withdraw(id));
      else if (name === 'companion' && arg !== undefined) openCompanions(this, arg);
    });
  }

  private buildStrip() {
    const layout = stripLayout();
    const strip = (this.strip = new StripHud(this));
    setToastAnchor(layout.battle.x + layout.battle.w / 2, 34, 12);
    const hooks: BattleHooks = {
      storagePos: () => strip.bagPos(),
      drop: (id, _x, _y, floor) => {
        if (!placeItem(id)) this.toChest(id, floor);
      },
    };
    this.battle = new BattlePanel(this, hooks, layout.battle, true);
    // windows only exist on the full screen: open it there
    bus.on('modal', (name: string) => void setMode('full', name));
  }

  private toChest(id: string, floor: number) {
    const chest = chestOf(floor);
    if (state.cleared >= floor && chest.length < chestCap()) chest.push(id);
  }

  /** Game rules for dt seconds (no drawing needed). */
  private step(dt: number) {
    if (this.tower) this.tower.update(dt);
    else {
      tickProduction(dt);
      drainChests();
    }
    this.battle.update(dt);
  }

  /** Runs the time that passed while hidden / closed: up to MAX_CATCHUP in full, the rest as production only. */
  private catchUp(seconds: number) {
    const full = Math.min(seconds, MAX_CATCHUP);
    sim.fast = true;
    try {
      for (let t = 0; t < full; t += STEP) this.step(STEP);
    } finally {
      sim.fast = false;
    }
    if (seconds > full) produceOffline(seconds - full);
    for (const e of ['gold', 'grid', 'storage', 'tower', 'hunter', 'quests']) bus.emit(e);
  }

  private welcomeBack(away: number) {
    const gold = state.gold;
    let waiting = 0;
    for (let f = 1; f <= state.cleared; f++) waiting += chestOf(f).length;
    const floor = state.cleared;
    this.catchUp(away);
    let after = 0;
    for (let f = 1; f <= state.cleared; f++) after += chestOf(f).length;
    const mins = Math.max(1, Math.round(away / 60));
    const lines = [`자리를 비운 ${mins}분 동안`, `골드 +${state.gold - gold}`, `상자에 쌓인 재료 +${Math.max(0, after - waiting)}`];
    if (state.cleared > floor) lines.push(`F${state.cleared}까지 정복!`);
    if (mode === 'full') openMessage(this, '다녀오셨군요!', lines.join('\n'));
    else toast(this, `${mins}분 동안 골드 +${state.gold - gold}`);
  }

  update(time: number) {
    // wall-clock time, so a hidden window / tab catches up when it comes back
    const now = Date.now();
    const elapsed = (now - this.lastWall) / 1000;
    this.lastWall = now;
    if (elapsed > 1) this.catchUp(elapsed);
    else this.step(Math.min(elapsed, LIVE_MAX_DT));

    this.merge?.update(time);
    this.tracker?.update(time);
    this.strip?.update(time);
  }
}
