import Phaser from 'phaser';
import { BATTLE, DEPTH, label } from '../config';
import { ITEMS } from '../data/items';
import { companionDef } from '../data/companions';
import { activeQuests, bus, countItem, hasAll } from '../state';

const W = 168;
const H = 42;

/** Always-visible card for the current quest, top-left of the battle view. Click opens the quest board. */
export class QuestTracker {
  private box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.NineSlice;
  private body: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private ready = false;

  constructor(private scene: Phaser.Scene) {
    this.box = scene.add.container(BATTLE.x + 4, BATTLE.y + 32).setDepth(DEPTH.ui + 4);
    this.bg = scene.add.nineslice(0, 0, 'panel', undefined, W, H, 8, 8, 8, 8).setOrigin(0).setAlpha(0.92);
    this.bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => bus.emit('modal', 'quests'));
    this.title = label(scene, 22, 3, '', { color: '#ffe890' });
    this.body = scene.add.container(0, 0);
    this.box.add([this.bg, scene.add.image(12, 9, 'icons', 3), this.title, this.body]);

    for (const e of ['quests', 'grid', 'storage']) bus.on(e, this.refresh, this);
    this.refresh();
  }

  private refresh() {
    const q = activeQuests()[0];
    this.body.removeAll(true);
    this.ready = hasAll(q.need);
    const reward = q.companion ? ` +${companionDef(q.companion).name}` : '';
    this.title.setText(this.ready ? '납품 가능! 눌러서 완료' : `${q.title}${reward}`);
    this.title.setColor(this.ready ? '#8ee06a' : '#ffe890');
    q.need.forEach((r, i) => {
      const x = 16 + i * 52;
      const have = countItem(r.id);
      this.body.add(this.scene.add.image(x, 29, 'items', ITEMS[r.id].frame));
      this.body.add(label(this.scene, x + 13, 23, `${Math.min(have, r.n)}/${r.n}`, { color: have >= r.n ? '#8ee06a' : '#ff9a8a', stroke: true }));
    });
  }

  update(time: number) {
    this.bg.setTint(this.ready && Math.floor(time / 300) % 2 === 0 ? 0xc8ffb0 : 0xffffff);
  }
}
