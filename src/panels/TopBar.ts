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

    const refresh = () => this.refresh();
    ['gold', 'hunter', 'grid', 'storage', 'quests'].forEach((e) => bus.on(e, refresh));
    this.refresh();
  }

  private refresh() {
    this.gold.setText(`${state.gold}`);
    this.stats.setText(`공격력 ${attack()} · 체력 ${maxHp()} · ${weaponDef(state.weapon).name}`);
    const ready = activeQuests().some((q) => hasAll(q.need));
    this.questBtn.setLabel(ready ? '의뢰 !' : '의뢰');
  }
}
