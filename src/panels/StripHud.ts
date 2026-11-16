import Phaser from 'phaser';
import { DEPTH, label } from '../config';
import { isMuted, setMuted, sfx } from '../audio';
import { ITEMS } from '../data/items';
import { floorDef } from '../data/floors';
import { STRIP_H, STRIP_W, desktop, setMode } from '../display';
import { autoMergeNow, planMerges } from '../logic';
import { activeQuests, countItem, frontline, hasAll, idleCompanions, state } from '../state';
import { button, toast, type Button } from '../ui/widgets';

const BATTLE_W = 210;
const PANEL_X = BATTLE_W;
const PANEL_W = STRIP_W - BATTLE_W;

/** The mini widget: battle view on the left, a small info + button panel on the right. */
export function stripLayout() {
  return { battle: { x: 0, y: 0, w: BATTLE_W, h: STRIP_H } };
}

export class StripHud {
  private title: Phaser.GameObjects.Text;
  private progress: Phaser.GameObjects.Rectangle;
  private gold: Phaser.GameObjects.Text;
  private stock: Phaser.GameObjects.Text;
  private quest: Phaser.GameObjects.Text;
  private autoBtn: Button;
  private questBtn: Button;
  private badge: Phaser.GameObjects.Container;

  constructor(private scene: Phaser.Scene) {
    const s = scene;
    const d = DEPTH.ui + 6;
    const x = PANEL_X + 6;
    const w = PANEL_W - 12;

    s.add.nineslice(PANEL_X, 0, 'panel', undefined, PANEL_W, STRIP_H, 8, 8, 8, 8).setOrigin(0).setDepth(d);
    this.title = label(s, x, 3, '', { color: '#ffe890' }).setDepth(d);
    s.add.rectangle(x, 16, w, 3, 0x241a1c).setOrigin(0).setDepth(d);
    this.progress = s.add.rectangle(x, 16, 0, 3, 0xff8a4a).setOrigin(0).setDepth(d);
    s.add.image(x + 5, 27, 'coin').setDepth(d);
    this.gold = label(s, x + 13, 21, '', { color: '#ffd84a' }).setDepth(d);
    this.stock = label(s, x + w, 21, '', { color: '#c8b8a8', origin: [1, 0] }).setDepth(d);
    this.quest = label(s, x, 34, '', {}).setDepth(d);
    s.add.zone(x, 33, w, 13).setOrigin(0).setDepth(d).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => void setMode('full', 'quests'));

    // 2x2 buttons
    const bw = Math.floor((w - 4) / 2);
    const bh = 22;
    const col = [x, x + bw + 4];
    const row = [48, 48 + bh + 3];
    this.autoBtn = button(s, col[0], row[0], bw, bh, '자동 합성', () => this.autoMerge(), { key: 'btn_yellow' }).setDepth(d);
    button(s, col[1], row[0], bw, bh, '펼치기', () => void setMode('full')).setDepth(d);
    this.questBtn = button(s, col[0], row[1], bw, bh, '의뢰', () => void setMode('full', 'quests')).setDepth(d);
    if (desktop) {
      button(s, col[1], row[1], bw, bh, '숨기기', () => desktop?.hide(), { key: 'btn_dark' }).setDepth(d);
    } else {
      const sound = button(s, col[1], row[1], bw, bh, isMuted() ? '소리 켜기' : '소리 끄기', () => {
        setMuted(!isMuted());
        sound.setLabel(isMuted() ? '소리 켜기' : '소리 끄기');
      }, { key: 'btn_dark' }).setDepth(d);
    }
    this.badge = s.add.container(col[0] + bw - 3, row[1] + 3, [
      s.add.circle(0, 0, 6, 0x241a1c),
      s.add.circle(0, 0, 5, 0xe8504a),
      label(s, 0, 0, '!', { color: '#ffffff', origin: [0.5, 0.5] }),
    ]).setDepth(d + 1).setVisible(false);
  }

  /** Where items going into the bag fly to. */
  bagPos() {
    return { x: PANEL_X + PANEL_W / 2, y: 60 };
  }

  private autoMerge() {
    const n = autoMergeNow();
    sfx(n > 0 ? 'merge' : 'deny');
    toast(this.scene, n > 0 ? `자동 합성 ${n}회` : '합칠 수 있는 아이템이 없습니다');
  }

  update(time: number) {
    const front = frontline();
    const def = floorDef(front);
    const fighting = state.floor === front;
    this.title.setText(`F${front} ${def.name}`);
    this.progress.width = Math.round((PANEL_W - 12) * (fighting && def.kills > 0 ? Math.min(1, state.kills / def.kills) : 0));
    this.gold.setText(`${state.gold}`);
    const used = state.grid.filter((g, i) => g && state.unlocked[i]).length;
    const open = state.unlocked.filter(Boolean).length;
    this.stock.setText(`합성 ${used}/${open}`).setColor(used >= open ? '#ff9a8a' : '#c8b8a8');

    const ready = activeQuests().some((q) => hasAll(q.need));
    const q = activeQuests()[0];
    const need = q.need.find((r) => countItem(r.id) < r.n) ?? q.need[0];
    const idle = idleCompanions().length;
    if (ready) this.quest.setText('의뢰 납품 가능!').setColor('#8ee06a');
    else if (idle > 0) this.quest.setText(`놀고 있는 동료 ${idle}명`).setColor('#ffe890');
    else this.quest.setText(`의뢰: ${ITEMS[need.id].name} ${Math.min(countItem(need.id), need.n)}/${need.n}`).setColor('#f6ecd8');

    const merges = planMerges().length;
    this.autoBtn.setLabel(merges > 0 ? `자동 합성 ${merges}` : '자동 합성');
    this.autoBtn.setEnabled(merges > 0);
    this.questBtn.setLabel(ready ? '납품!' : '의뢰');
    this.badge.setVisible(ready).setScale(ready && Math.floor(time / 300) % 2 ? 1.2 : 1);
  }
}
