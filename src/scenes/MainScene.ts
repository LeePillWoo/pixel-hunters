import Phaser from 'phaser';
import { unlockAudio } from '../audio';
import sprites from '../data/sprites.json';
import { BattlePanel } from '../panels/BattlePanel';
import { MergePanel } from '../panels/MergePanel';
import { QuestTracker } from '../panels/QuestTracker';
import { TopBar } from '../panels/TopBar';
import { TowerPanel } from '../panels/TowerPanel';
import { bus, chestCap, chestOf, loadState, produceOffline, resetState, saveState, state } from '../state';
import { closeModal, openCodex, openCompanions, openCraft, openMessage, openQuests, openStorage } from '../ui/modals';
import { toast } from '../ui/widgets';

const AUTOSAVE_MS = 10_000;

export class MainScene extends Phaser.Scene {
  private tower!: TowerPanel;
  private battle!: BattlePanel;
  private merge!: MergePanel;
  private tracker!: QuestTracker;
  private hiddenAt = 0;

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

  create() {
    const away = loadState();
    const gained = away > 10 ? produceOffline(away) : 0;

    const merge = (this.merge = new MergePanel(this));
    this.tower = new TowerPanel(this, { flyIn: (id, x, y, delay) => merge.flyIn(id, x, y, delay) });
    this.battle = new BattlePanel(this, {
      storagePos: () => merge.storagePos(),
      // monster drops go to the grid; when it's full they wait in that floor's chest (if the floor is conquered)
      drop: (id, x, y, floor, delay) => {
        if (merge.flyIn(id, x, y, delay)) return;
        const chest = chestOf(floor);
        if (state.cleared >= floor && chest.length < chestCap()) chest.push(id);
      },
    });
    this.tracker = new QuestTracker(this);
    new TopBar(this, () => {
      resetState();
      window.location.reload();
    });

    bus.on('toast', (text: string) => toast(this, text));
    bus.on('modal', (name: string, arg?: number) => {
      if (name === 'craft') openCraft(this);
      else if (name === 'quests') openQuests(this);
      else if (name === 'codex') openCodex(this);
      else if (name === 'storage') openStorage(this, (id) => merge.withdraw(id));
      else if (name === 'companion' && arg !== undefined) openCompanions(this, arg);
    });
    this.input.keyboard?.on('keydown-ESC', () => closeModal());
    this.input.on('pointerdown', unlockAudio);
    this.input.keyboard?.on('keydown', unlockAudio);

    this.time.addEvent({ delay: AUTOSAVE_MS, loop: true, callback: saveState });
    window.addEventListener('beforeunload', saveState);
    // a hidden tab stops ticking, so treat the gap like time spent offline
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        saveState();
      } else if (this.hiddenAt) {
        produceOffline((Date.now() - this.hiddenAt) / 1000);
        this.hiddenAt = 0;
      }
    });

    if (gained > 0) {
      const mins = Math.max(1, Math.round(away / 60));
      openMessage(this, '다녀오셨군요!', `자리를 비운 ${mins}분 동안\n동료들이 소재 ${gained}개를 상자에 모아 두었습니다.`);
    }
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 250) / 1000;
    this.tower.update(dt);
    this.battle.update(dt);
    this.merge.update(time);
    this.tracker.update(time);
  }
}
