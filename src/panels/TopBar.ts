import Phaser from 'phaser';
import { DEPTH, GAME_W, TOP_H, label } from '../config';
import { weaponDef } from '../data/weapons';
import { isMuted, setMuted } from '../audio';
import { activeQuests, attack, bus, hasAll, maxHp, state } from '../state';
import { button, type Button } from '../ui/widgets';

/** Thin strip on top: gold, hunter stats, quest board. */
export class TopBar {
  private gold: Phaser.GameObjects.Text;
  private stats: Phaser.GameObjects.Text;
  private questBtn: Button;
  private badge: Phaser.GameObjects.Container;
  private badgeText: Phaser.GameObjects.Text;
  private bounce: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, onReset: () => void) {
    scene.add.rectangle(0, 0, GAME_W, TOP_H, 0x241a1c).setOrigin(0).setDepth(DEPTH.ui);
    scene.add.image(10, 10, 'coin').setDepth(DEPTH.ui);
    this.gold = label(scene, 20, 4, '', { color: '#ffd84a' }).setDepth(DEPTH.ui);
    this.stats = label(scene, 92, 4, '', { color: '#c8b8a8' }).setDepth(DEPTH.ui);
    const sound = scene.add.image(GAME_W - 186, 10, 'icons', isMuted() ? 13 : 12).setDepth(DEPTH.ui).setInteractive({ useHandCursor: true });
    sound.on('pointerdown', () => {
      setMuted(!isMuted());
      sound.setFrame(isMuted() ? 13 : 12);
    });
    button(scene, GAME_W - 172, 1, 54, 18, '도감', () => bus.emit('modal', 'codex'), { icon: 9 }).setDepth(DEPTH.ui);
    this.questBtn = button(scene, GAME_W - 116, 1, 62, 18, '의뢰', () => bus.emit('modal', 'quests')).setDepth(DEPTH.ui);
    button(scene, GAME_W - 50, 1, 48, 18, '초기화', onReset, { key: 'btn_dark' }).setDepth(DEPTH.ui);

    // red badge with the number of quests ready to hand in; the button bounces while there are any
    this.badgeText = label(scene, 0, 0, '', { color: '#ffffff', origin: [0.5, 0.5] });
    this.badge = scene.add.container(GAME_W - 58, 4, [
      scene.add.circle(0, 0, 7, 0x241a1c),
      scene.add.circle(0, 0, 6, 0xe8504a),
      this.badgeText,
    ]).setDepth(DEPTH.ui + 1).setVisible(false);
    this.bounce = scene.tweens.add({ targets: [this.questBtn, this.badge], y: '-=2', duration: 260, yoyo: true, repeat: -1, paused: true });

    const refresh = () => this.refresh();
    ['gold', 'hunter', 'grid', 'storage', 'quests'].forEach((e) => bus.on(e, refresh));
    this.refresh();
  }

  private refresh() {
    this.gold.setText(`${state.gold}`);
    this.stats.setText(`공격력 ${attack()} · 체력 ${maxHp()} · ${weaponDef(state.weapon).name}`);
    const ready = activeQuests().filter((q) => hasAll(q.need)).length;
    this.questBtn.setLabel(ready ? '의뢰 납품' : '의뢰');
    this.badgeText.setText(`${ready}`);
    this.badge.setVisible(ready > 0);
    if (ready > 0 && !this.bounce.isPlaying()) this.bounce.resume();
    if (ready === 0 && this.bounce.isPlaying()) {
      this.bounce.pause();
      this.questBtn.y = 10;
      this.badge.y = 4;
    }
  }
}
