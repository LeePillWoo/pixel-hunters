import Phaser from 'phaser';
import { BATTLE, DEPTH, label } from '../config';
import { sim } from '../sim';
import { sfx } from '../audio';
import { ITEMS, LINES } from '../data/items';
import { BOSS_PARTS, BREAK, DROP, FIRST_COMBAT_FLOOR, MAX_FLOOR, floorDef, type MonsterDef } from '../data/floors';
import { HUNTER, weaponDef } from '../data/weapons';
import sprites from '../data/sprites.json';
import { addGold, addStorage, attack, bus, consumeAll, countItem, frontline, maxHp, state, weaponPower } from '../state';
import { button, floatText, sparkle, toast, type Button } from '../ui/widgets';

const RETRY_SECONDS = 30;

export interface BattleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Enemy {
  def: MonsterDef;
  hp: number;
  boss: boolean;
  atkTimer: number;
  attacks: number;
  stun: number;
  telegraph: number; // > 0 while winding up a heavy attack
  bleed: number; // stacks
}

export interface BattleHooks {
  /** Screen position boss drops fly to. */
  storagePos(): { x: number; y: number };
  /** A monster dropped a material on this floor. */
  drop(id: string, x: number, y: number, floor: number, delay: number): void;
}

/** Top-right panel: auto battle, boss weak points and the BREAK button. */
export class BattlePanel {
  private bg: Phaser.GameObjects.Image;
  private hunter: Phaser.GameObjects.Sprite;
  private foe: Phaser.GameObjects.Sprite;
  private slash: Phaser.GameObjects.Sprite;
  private spark: Phaser.GameObjects.Image;
  private warn: Phaser.GameObjects.Text;

  private foeName: Phaser.GameObjects.Text;
  private foeFill: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;
  private hpText: Phaser.GameObjects.Text;
  private floorText: Phaser.GameObjects.Text;
  private retryText: Phaser.GameObjects.Text;
  private retryBtn: Button;

  private enemy: Enemy | null = null;
  private phase: 'spawning' | 'fight' | 'down' = 'spawning';
  private wait = 0.4; // spawn / down timer
  private swing = 0;
  private retry = 0;
  private potionCd = 0;
  private bleedTick = 0;
  private hammerHits = 0;

  private weakIn = 0;
  private weakLeft = 0;
  private weakTotal = 1;
  private weakPart = 0;
  private broken = new Set<string>();
  private marker: Phaser.GameObjects.Sprite;
  private marks: Phaser.GameObjects.Image[] = [];
  private partIcons: Phaser.GameObjects.Image[] = [];
  private partChecks: Phaser.GameObjects.Image[] = [];
  private breakBtn: Button;
  private breakFill: Phaser.GameObjects.Rectangle;
  private foeBarW = 198;
  private bgCrop: [number, number];

  // layout: the full screen uses the 400x180 battle panel, the taskbar strip a short wide rect
  private r: BattleRect;
  private gy: number; // ground line
  private hx: number; // hunter x
  private fx: number; // foe x

  constructor(private scene: Phaser.Scene, private hooks: BattleHooks, rect: BattleRect = BATTLE, compact = false) {
    const s = scene;
    const r = (this.r = rect);
    this.gy = compact ? r.y + r.h - 4 : r.y + 150;
    this.hx = compact ? r.x + Math.round(r.w * 0.3) : r.x + 130;
    this.fx = compact ? r.x + Math.round(r.w * 0.75) : r.x + 292;
    // the background art is 400x180 with the ground at y=150; crop it to the rect around the ground line
    const bgX = r.x - Math.round((400 - r.w) / 2);
    const bgY = this.gy - 150;
    this.bgCrop = [r.x - bgX, r.y - bgY];
    this.bg = s.add.image(bgX, bgY, 'bg_forest').setOrigin(0).setDepth(DEPTH.bg).setCrop(this.bgCrop[0], this.bgCrop[1], r.w, r.h);

    const a = s.anims;
    const anim = (key: string, sheet: string, frames: number[], frameRate: number, repeat = 0) => {
      if (!a.exists(key)) a.create({ key, frames: a.generateFrameNumbers(sheet, { frames }), frameRate, repeat });
    };
    anim('hunter-idle', 'hunter', [0, 1], 2, -1);
    anim('hunter-attack', 'hunter', [2, 3, 4, 4], 16);
    anim('dragon-idle', 'dragon', [0, 1], 2, -1);
    anim('slime-idle', 'slime', [0, 1], 3, -1);
    anim('slash-go', 'slash', [0, 1, 2, 3], 22);

    this.foe = s.add.sprite(this.fx, this.gy, 'slime').setOrigin(0.5, 1).setDepth(DEPTH.ui).setVisible(false);
    this.hunter = s.add.sprite(this.hx, this.gy, 'hunter').setOrigin(sprites.hunter.originX, sprites.hunter.originY).setDepth(DEPTH.ui + 1);
    this.hunter.play('hunter-idle');
    this.hunter.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'hunter-attack', () => this.hunter.play('hunter-idle'));

    this.slash = s.add.sprite(this.hx + 62, this.gy - 26, 'slash').setDepth(DEPTH.ui + 2).setVisible(false);
    this.slash.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.slash.setVisible(false));
    this.spark = s.add.image(this.fx, this.gy - 24, 'slash', 4).setDepth(DEPTH.ui + 3).setVisible(false);
    this.warn = label(s, this.fx, Math.max(r.y + 12, this.gy - 100), '!', { size: 'md', color: '#ff5a3a', stroke: true, origin: [0.5, 0.5] })
      .setDepth(DEPTH.ui + 3).setVisible(false).setScale(2);

    // HUD
    this.floorText = label(s, r.x + 6, r.y + 4, '', { stroke: true }).setDepth(DEPTH.ui + 4).setVisible(!compact);
    const barW = compact ? Math.min(160, r.w - 60) : 200;
    const barX = r.x + Math.round((r.w - barW) / 2);
    this.foeName = label(s, r.x + r.w / 2, r.y + (compact ? 7 : 10), '', { size: compact ? 'sm' : 'md', color: '#ffe890', stroke: true, origin: [0.5, 0.5] }).setDepth(DEPTH.ui + 4);
    const barY = r.y + (compact ? 14 : 20);
    s.add.rectangle(barX, barY, barW, 8, 0x241a1c).setOrigin(0).setDepth(DEPTH.ui + 4);
    this.foeFill = s.add.rectangle(barX + 1, barY + 1, barW - 2, 6, 0xe8504a).setOrigin(0).setDepth(DEPTH.ui + 4);
    this.foeBarW = barW - 2;

    this.hpText = label(s, r.x + 6, r.y + r.h - (compact ? 23 : 27), '', { stroke: true }).setDepth(DEPTH.ui + 4);
    s.add.rectangle(r.x + 6, r.y + r.h - (compact ? 10 : 13), 110, 8, 0x241a1c).setOrigin(0).setDepth(DEPTH.ui + 4);
    this.hpFill = s.add.rectangle(r.x + 7, r.y + r.h - (compact ? 9 : 12), 108, 6, 0x6cc257).setOrigin(0).setDepth(DEPTH.ui + 4);

    // part status under the boss HP bar: lit once broken this fight
    BOSS_PARTS.forEach((part, i) => {
      const x = compact ? r.x + r.w / 2 - 22 + i * 22 : r.x + r.w / 2 + i * 24;
      const y = compact ? barY + 18 : r.y + 40;
      this.partIcons.push(s.add.image(x, y, 'items', ITEMS[part.drop].frame).setDepth(DEPTH.ui + 4).setVisible(false));
      this.partChecks.push(s.add.image(x + 7, y + 6, 'icons', 8).setDepth(DEPTH.ui + 4).setVisible(false));
    });

    this.retryText = label(s, r.x + 4, r.y + (compact ? 24 : 80), '', { color: '#ffb0a0', stroke: true }).setDepth(DEPTH.ui + 4);
    this.retryBtn = button(s, r.x + 4, r.y + (compact ? 37 : 94), 64, 18, '지금 도전', () => this.goFront()).setDepth(DEPTH.ui + 4);

    // BREAK
    this.marker = s.add.sprite(0, 0, 'weak', 0).setDepth(DEPTH.ui + 5).setVisible(false).setInteractive({ useHandCursor: true });
    this.marker.on('pointerdown', () => this.tryBreak());
    this.breakBtn = button(s, r.x + r.w - 82, r.y + r.h - (compact ? 40 : 44), 76, compact ? 30 : 34, 'BREAK!', () => this.tryBreak(), {
      key: 'btn_yellow', text: { size: 'md' },
    }).setDepth(DEPTH.ui + 5).setVisible(false);
    this.breakFill = s.add.rectangle(r.x + r.w - 78, r.y + r.h - (compact ? 7 : 8), 68, 3, 0xff5a3a).setOrigin(0).setDepth(DEPTH.ui + 5).setVisible(false);
    s.input.keyboard?.on('keydown-SPACE', () => this.tryBreak());

    bus.on('hunter', this.refreshHud, this);
  }

  // ---------------------------------------------------------------- loop

  update(dt: number) {
    if (!sim.fast) this.refreshHud();
    if (this.phase !== 'fight') {
      this.wait -= dt;
      if (this.wait > 0) return;
      if (this.phase === 'down') this.recover();
      this.spawn();
      return;
    }
    const e = this.enemy!;
    const front = frontline();

    if (state.floor < front) {
      this.retry -= dt;
      if (this.retry <= 0) return this.goFront();
    }

    const weapon = weaponDef(state.weapon);
    this.swing += dt;
    if (this.swing >= weapon.interval) {
      this.swing = 0;
      this.hunterAttack(e);
    }

    if (e.bleed > 0) {
      this.bleedTick += dt;
      if (this.bleedTick >= 1) {
        this.bleedTick = 0;
        this.damageFoe(e, attack() * HUNTER.bleedPerStack * e.bleed, false, '#ff8a8a');
        if (this.enemy !== e) return;
      }
    }

    if (e.stun > 0) {
      e.stun -= dt;
    } else if (e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraph <= 0) this.foeAttack(e, BREAK.heavyMult);
    } else {
      e.atkTimer += dt;
      if (e.atkTimer >= e.def.interval) {
        e.atkTimer = 0;
        e.attacks++;
        if (e.boss && e.attacks % BREAK.heavyEvery === 0) e.telegraph = BREAK.telegraph;
        else this.foeAttack(e, 1);
      }
    }
    this.warn.setVisible(e.telegraph > 0);
    if (this.phase !== 'fight') return;

    if (e.boss) this.updateBreak(dt, e);

    this.potionCd -= dt;
    if (state.hp / maxHp() < HUNTER.potionAt && this.potionCd <= 0) this.drinkPotion();
  }

  private refreshHud() {
    const def = floorDef(state.floor);
    const front = frontline();
    this.floorText.setText(`F${state.floor} ${def.name}`);
    this.hpText.setText(`HP ${Math.max(0, Math.ceil(state.hp))}/${maxHp()}`);
    this.hpFill.width = Math.round(108 * Phaser.Math.Clamp(state.hp / maxHp(), 0, 1));
    const e = this.enemy;
    this.foeName.setText(e ? e.def.name : '');
    this.foeFill.width = e ? Math.round(this.foeBarW * Phaser.Math.Clamp(e.hp / e.def.hp, 0, 1)) : 0;
    BOSS_PARTS.forEach((part, i) => {
      const broken = this.broken.has(part.id);
      this.partIcons[i].setVisible(!!e?.boss).setAlpha(broken ? 1 : 0.6);
      if (broken) this.partIcons[i].clearTint();
      else this.partIcons[i].setTint(0x606070);
      this.partChecks[i].setVisible(!!e?.boss && broken);
    });
    const behind = state.floor < front && this.phase !== 'down';
    this.retryText.setVisible(behind).setText(`F${front} 재도전까지 ${Math.ceil(this.retry)}초`);
    this.retryBtn.setVisible(behind);
  }

  // ---------------------------------------------------------------- spawning & floors

  private spawn() {
    const def = floorDef(state.floor);
    const m = def.monster!;
    const boss = def.kind === 'boss';
    this.enemy = { def: m, hp: m.hp, boss, atkTimer: 0, attacks: 0, stun: 0, telegraph: 0, bleed: 0 };
    this.phase = 'fight';
    this.swing = 0;
    this.hammerHits = 0;
    this.bg.setTexture(boss ? 'bg_lair' : 'bg_forest').setCrop(this.bgCrop[0], this.bgCrop[1], this.r.w, this.r.h);
    this.scene.tweens.killTweensOf(this.foe);
    if (boss) {
      this.foe.setTexture('dragon').setOrigin(sprites.dragon.originX, sprites.dragon.originY).play('dragon-idle');
      this.broken.clear();
      this.weakIn = Phaser.Math.FloatBetween(3, 5);
    } else {
      this.foe.setTexture('slime').setOrigin(0.5, 1).play('slime-idle');
    }
    this.foe.setPosition(this.fx, this.gy).setScale(m.scale).setTint(m.tint).setAlpha(1).setVisible(true);
  }

  private goFront() {
    state.floor = frontline();
    state.kills = 0;
    state.hp = maxHp();
    this.clearEnemy(0.3);
  }

  private clearEnemy(wait: number) {
    this.marks.forEach((mk) => mk.destroy());
    this.marks = [];
    this.enemy = null;
    this.phase = 'spawning';
    this.wait = wait;
    this.hideWeak();
    this.warn.setVisible(false);
  }

  private onKill(e: Enemy) {
    addGold(e.def.gold);
    floatText(this.scene, this.fx, this.gy - 50, `+${e.def.gold}G`, '#ffd84a');
    sfx('coin');
    this.dropLoot(state.floor);
    state.hp = Math.min(maxHp(), state.hp + maxHp() * HUNTER.healOnKill);
    if (!sim.fast) this.scene.tweens.add({ targets: this.foe, alpha: 0, y: this.gy + 6, duration: 250 });
    this.clearEnemy(e.boss ? 2.5 : 0.5);

    const f = state.floor;
    if (f !== frontline()) return;
    const def = floorDef(f);
    state.kills++;
    if (state.kills < def.kills) return;
    state.kills = 0;
    state.hp = maxHp();
    const first = state.cleared < f;
    if (first) {
      state.cleared = f;
      toast(this.scene, `F${f} ${def.name} 정복! 주둔지가 열렸습니다`);
      bus.emit('tower');
    }
    if (def.kind === 'boss') {
      state.bossKills++;
      toast(this.scene, first ? '새끼 녹룡 토벌! 숲을 정복했습니다' : `새끼 녹룡 재토벌 (${state.bossKills}회)`);
    }
    if (f < MAX_FLOOR) state.floor = f + 1;
  }

  /** Monsters drop their floor's material; elites and the boss drop more. */
  private dropLoot(floor: number) {
    const def = floorDef(floor);
    const ids: string[] = [];
    if (def.kind === 'normal' && Math.random() < DROP.chance) ids.push(`${def.line}1`);
    if (def.kind === 'elite') for (let i = 0; i < DROP.elite.n; i++) ids.push(`${def.line}${DROP.elite.tier}`);
    if (def.kind === 'boss') for (let i = 0; i < DROP.boss.n; i++) ids.push(`${Phaser.Utils.Array.GetRandom(LINES)}${DROP.boss.tier}`);
    ids.forEach((id, i) => this.hooks.drop(id, this.fx, this.gy - 20, floor, i * 120));
  }

  private onDown() {
    this.clearEnemy(1.6);
    this.phase = 'down';
    this.hunter.stop().setFrame(5).setTint(0x888888);
    toast(this.scene, '헌터가 쓰러졌습니다… 후퇴!');
    sfx('hurt');
  }

  private recover() {
    const front = frontline();
    if (state.floor === front && front > FIRST_COMBAT_FLOOR) state.floor = front - 1;
    state.kills = 0;
    state.hp = maxHp();
    this.retry = RETRY_SECONDS;
    this.hunter.clearTint().play('hunter-idle');
    this.foe.setVisible(false);
  }

  // ---------------------------------------------------------------- attacks

  private hunterAttack(e: Enemy) {
    const weapon = weaponDef(state.weapon);
    if (!sim.fast) {
      this.hunter.play('hunter-attack');
      this.slash.setVisible(true).play('slash-go');
    }
    {
      const critChance = HUNTER.critChance + (weapon.id === 'dual' ? HUNTER.dualCrit : 0);
      const crit = Math.random() < critChance;
      this.damageFoe(e, attack() * weaponPower(weapon.id) * (crit ? HUNTER.critMult : 1), crit);
      if (this.enemy !== e) return;

      if (weapon.id === 'great' && Math.random() < HUNTER.staggerChance) {
        e.atkTimer = 0;
        e.telegraph = 0;
        floatText(this.scene, this.fx, this.gy - 70, '경직!', '#9ad0ff', 'sm');
      } else if (weapon.id === 'dual') {
        e.bleed = Math.min(HUNTER.bleedMaxStacks, e.bleed + 1);
      } else if (weapon.id === 'hammer' && ++this.hammerHits >= HUNTER.hammerStunHits) {
        this.hammerHits = 0;
        e.stun = Math.max(e.stun, HUNTER.hammerStun);
        e.telegraph = 0;
        floatText(this.scene, this.fx, this.gy - 70, '기절!', '#ffe24a', 'sm');
      }
    }
  }

  private damageFoe(e: Enemy, amount: number, crit: boolean, color = '#ffffff') {
    const dmg = Math.max(1, Math.round(amount));
    e.hp -= dmg;
    sfx(crit ? 'crit' : 'hit');
    if (e.hp <= 0) return this.onKill(e);
    if (sim.fast) return;
    const jx = Phaser.Math.Between(-14, 14);
    floatText(this.scene, this.fx + jx, this.gy - (e.boss ? 70 : 40), crit ? `${dmg}!` : `${dmg}`, crit ? '#ffe24a' : color, crit ? 'md' : 'sm');

    this.spark.setPosition(this.fx - 8 + jx / 2, this.gy - (e.boss ? 40 : 16) * e.def.scale).setVisible(true);
    this.scene.time.delayedCall(90, () => this.spark.setVisible(false));
    if (e.boss) {
      this.foe.stop().setFrame(3);
      this.scene.time.delayedCall(140, () => this.enemy === e && this.foe.play('dragon-idle'));
    } else {
      this.foe.stop().setFrame(2);
      this.scene.time.delayedCall(140, () => this.enemy === e && this.foe.play('slime-idle'));
    }
  }

  private foeAttack(e: Enemy, mult: number) {
    const heavy = mult > 1;
    const dmg = Math.max(1, Math.round(e.def.atk * mult));
    state.hp -= dmg;
    if (state.hp <= 0) return this.onDown();
    if (sim.fast) return;
    if (e.boss) {
      this.foe.stop().setFrame(2);
      this.scene.time.delayedCall(260, () => this.enemy === e && this.foe.play('dragon-idle'));
    }
    this.scene.tweens.add({ targets: this.foe, x: this.fx - (heavy ? 44 : 26), duration: 90, yoyo: true, ease: 'Quad.easeOut' });

    sfx('hurt');
    floatText(this.scene, this.hx, this.gy - 56, `-${dmg}`, heavy ? '#ff5a3a' : '#ff9a8a', heavy ? 'md' : 'sm');
    this.hunter.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.phase !== 'down' && this.hunter.clearTint());
    if (heavy) this.scene.cameras.main.shake(120, 0.004);
  }

  /** Uses a potion from the storage first, then from the merge grid. */
  private drinkPotion() {
    const id = countItem('herb4') > 0 ? 'herb4' : countItem('herb3') > 0 ? 'herb3' : null;
    if (!id || !consumeAll([{ id, n: 1 }])) return;
    sfx('up');
    this.potionCd = 3;
    const heal = maxHp() * (id === 'herb4' ? 1 : 0.5);
    state.hp = Math.min(maxHp(), state.hp + heal);
    floatText(this.scene, this.hx, this.gy - 60, `${ITEMS[id].name} +${Math.round(heal)}`, '#8ee06a', 'sm');
  }

  // ---------------------------------------------------------------- BREAK

  private updateBreak(dt: number, e: Enemy) {
    if (this.weakLeft > 0) {
      this.weakLeft -= dt;
      this.breakFill.width = Math.round(68 * Math.max(0, this.weakLeft / this.weakTotal));
      this.marker.setFrame(Math.floor(this.scene.time.now / 120) % 2);
      if (this.weakLeft <= 0) this.hideWeak();
      return;
    }
    this.weakIn -= dt;
    if (this.weakIn > 0 || e.stun > 0) return;

    // unbroken parts first; once all three are gone the weak point only deals damage
    const open = BOSS_PARTS.map((_, i) => i).filter((i) => !this.broken.has(BOSS_PARTS[i].id));
    this.weakPart = Phaser.Utils.Array.GetRandom(open.length > 0 ? open : [0, 1, 2]);
    const part = BOSS_PARTS[this.weakPart];
    this.weakTotal = BREAK.window * (state.weapon === 'hammer' ? HUNTER.hammerWindowMult : 1);
    this.weakLeft = this.weakTotal;
    this.marker.setPosition(this.fx + part.dx, this.gy + part.dy).setVisible(true);
    sfx('warn');
    this.breakBtn.setVisible(true);
    this.breakFill.setVisible(true);
  }

  private hideWeak() {
    this.weakLeft = 0;
    this.weakIn = Phaser.Math.FloatBetween(BREAK.minGap, BREAK.maxGap);
    this.marker.setVisible(false);
    this.breakBtn.setVisible(false);
    this.breakFill.setVisible(false);
  }

  private tryBreak() {
    const e = this.enemy;
    if (!e || this.weakLeft <= 0 || this.phase !== 'fight') return;
    const part = BOSS_PARTS[this.weakPart];
    const px = this.fx + part.dx;
    const py = this.gy + part.dy;
    this.hideWeak();

    e.stun = BREAK.stun;
    e.telegraph = 0;
    e.atkTimer = 0;
    this.scene.cameras.main.shake(140, 0.006);
    sfx('break');
    sparkle(this.scene, px, py, 0xffe24a, 14);
    floatText(this.scene, px, py - 14, 'BREAK!', '#ffe24a');

    if (!this.broken.has(part.id)) {
      this.broken.add(part.id);
      this.marks.push(this.scene.add.image(px, py, 'broken').setDepth(DEPTH.ui + 2));
      addStorage(part.drop);
      toast(this.scene, `${part.name} 파괴! ${ITEMS[part.drop].name} 획득`);
      const to = this.hooks.storagePos();
      const drop = this.scene.add.image(px, py, 'items', ITEMS[part.drop].frame).setDepth(DEPTH.fly);
      this.scene.tweens.add({ targets: drop, x: to.x, y: to.y, duration: 600, ease: 'Cubic.easeIn', onComplete: () => drop.destroy() });
    }
    this.damageFoe(e, attack() * BREAK.damageMult, true);
  }
}
