import Phaser from 'phaser';
import { DEPTH, TOWER, label } from '../config';
import { LINES, LINE_NAME } from '../data/items';
import { FLOOR_EVENT, floorDef } from '../data/floors';
import { companionDef } from '../data/companions';
import sprites from '../data/sprites.json';
import { sfx } from '../audio';
import { addGold, boosts, bus, chestCap, chestOf, frontline, idleCompanions, productionRate, state, tickProduction } from '../state';
import { floatText } from '../ui/widgets';

const HEAD_H = 46;
const ROW_H = 40;
const LIST = { x: TOWER.x, y: TOWER.y + HEAD_H, w: TOWER.w, h: TOWER.h - HEAD_H };
const FLOW_EVERY = 0.3; // seconds between items leaving the chests on their own
const BAR_W = 96;

type EventKind = 'gold' | 'treasure' | 'boost';
const EVENT_ICON: Record<EventKind, [string, number]> = { gold: ['coin', 0], treasure: ['chest', 1], boost: ['icons', 10] };

interface Row {
  floor: number;
  box: Phaser.GameObjects.Container;
  bar: Phaser.GameObjects.Rectangle;
  chest: Phaser.GameObjects.Image;
  count: Phaser.GameObjects.Text;
  worker: Phaser.GameObjects.Image | null;
  plus: Phaser.GameObjects.Image | null;
  flame: Phaser.GameObjects.Image;
}

export interface TowerHooks {
  flyIn(id: string, x: number, y: number, delay?: number): boolean;
}

/** Left panel: frontline summary on top, then one row per conquered floor. */
export class TowerPanel {
  private list: Phaser.GameObjects.Container;
  private rows: Row[] = [];
  private headTitle: Phaser.GameObjects.Text;
  private headSub: Phaser.GameObjects.Text;
  private headFill: Phaser.GameObjects.Rectangle;
  private scroll = 0;
  private flowTimer = 0;
  private flowFrom = 0;
  private dragY: number | null = null;
  private dragged = false;
  private events = new Map<number, { kind: EventKind; until: number }>();
  private nextEvent = FLOOR_EVENT.firstGap;

  constructor(private scene: Phaser.Scene, private hooks: TowerHooks) {
    scene.add.rectangle(TOWER.x, TOWER.y, TOWER.w, TOWER.h, 0x2a2630).setOrigin(0).setDepth(DEPTH.bg);

    this.list = scene.add.container(LIST.x, LIST.y).setDepth(DEPTH.ui);
    const maskShape = scene.make.graphics();
    maskShape.fillRect(LIST.x, LIST.y, LIST.w, LIST.h);
    this.list.setMask(maskShape.createGeometryMask());

    scene.add.nineslice(TOWER.x, TOWER.y, 'panel', undefined, TOWER.w, HEAD_H, 8, 8, 8, 8).setOrigin(0).setDepth(DEPTH.ui + 1);
    this.headTitle = label(scene, TOWER.x + 8, TOWER.y + 5, '', { size: 'md', color: '#ffe890' }).setDepth(DEPTH.ui + 2);
    this.headSub = label(scene, TOWER.x + 8, TOWER.y + 21, '').setDepth(DEPTH.ui + 2);
    scene.add.rectangle(TOWER.x + 8, TOWER.y + 36, TOWER.w - 16, 4, 0x241a1c).setOrigin(0).setDepth(DEPTH.ui + 2);
    this.headFill = scene.add.rectangle(TOWER.x + 8, TOWER.y + 36, TOWER.w - 16, 4, 0xff8a4a).setOrigin(0).setDepth(DEPTH.ui + 2);

    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inList(p)) this.setScroll(this.scroll + dy * 0.5);
    });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragY = this.inList(p) ? p.y : null;
      this.dragged = false;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragY === null || !p.isDown) return;
      if (!this.dragged && Math.abs(p.y - this.dragY) < 5) return;
      this.dragged = true;
      this.setScroll(this.scroll - (p.y - this.dragY));
      this.dragY = p.y;
    });
    scene.input.on('pointerup', () => (this.dragY = null));

    bus.on('tower', this.rebuild, this);
    this.rebuild();
  }

  private inList(p: Phaser.Input.Pointer) {
    return p.x >= LIST.x && p.x < LIST.x + LIST.w && p.y >= LIST.y && p.y < LIST.y + LIST.h;
  }

  private setScroll(v: number) {
    const max = Math.max(0, this.rows.length * ROW_H - LIST.h);
    this.scroll = Phaser.Math.Clamp(Math.round(v), 0, max);
    this.list.y = LIST.y - this.scroll;
  }

  private rebuild() {
    this.list.removeAll(true);
    this.rows = [];
    for (let f = state.cleared; f >= 1; f--) this.rows.push(this.makeRow(f, this.rows.length * ROW_H));
    this.setScroll(this.scroll);
  }

  private makeRow(floor: number, y: number): Row {
    const s = this.scene;
    const def = floorDef(floor);
    const box = s.add.container(4, y + 1);
    box.add(s.add.image(0, 0, 'row_bg').setOrigin(0));
    box.add(label(s, 40, -2, `F${floor} ${def.name}`, { stroke: true }));

    const who = state.stationed[floor];
    let worker: Phaser.GameObjects.Image | null = null;
    let plus: Phaser.GameObjects.Image | null = null;
    if (who) {
      worker = s.add.image(20, 36, 'companions', companionDef(who).sprite * 2)
        .setOrigin(sprites.companions.originX, sprites.companions.originY);
      box.add(worker);
    } else {
      plus = s.add.image(20, 18, 'icons', 4);
      box.add(plus);
    }
    const hit = s.add.zone(0, 0, 38, 38).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.inList(p) || this.dragged) return;
      if (this.events.has(floor)) this.claim(floor);
      else bus.emit('modal', 'companion', floor);
    });
    box.add(hit);

    box.add(label(s, 41, 12, who ? `${LINE_NAME[def.line]} 채집 중` : '동료 배치 필요', { color: who ? '#cfe8c0' : '#c0a8a0' }));
    box.add(s.add.rectangle(40, 27, BAR_W + 2, 5, 0x241a1c).setOrigin(0));
    const bar = s.add.rectangle(41, 28, BAR_W, 3, 0x8ee06a).setOrigin(0);
    box.add(bar);
    const flame = s.add.image(146, 29, 'icons', 10).setVisible(false);
    box.add(flame);
    box.add(s.add.image(166, 18, 'items', LINES.indexOf(def.line) * 4));

    const chest = s.add.image(206, 13, 'chest', 0).setInteractive({ useHandCursor: true });
    chest.on('pointerup', (p: Phaser.Input.Pointer) => this.inList(p) && !this.dragged && this.dump(floor));
    box.add(chest);
    const count = label(s, 206, 21, '', { origin: [0.5, 0], stroke: true });
    box.add(count);

    const ev = this.events.get(floor);
    if (ev) {
      const [key, frame] = EVENT_ICON[ev.kind];
      const bubble = s.add.container(26, 10);
      // tapping the companion's spot (the zone above) claims it
      bubble.add([s.add.image(0, 0, 'bubble'), s.add.image(0, -2, key, frame)]);
      s.tweens.add({ targets: bubble, y: 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      box.add(bubble);
    }

    this.list.add(box);
    return { floor, box, bar, chest, count, worker, plus, flame };
  }

  // ---------------------------------------------------------------- floor events

  private spawnEvent() {
    const open = Object.keys(state.stationed).map(Number).filter((f) => f <= state.cleared && !this.events.has(f));
    if (open.length === 0) return;
    const floor = Phaser.Utils.Array.GetRandom(open);
    const r = Math.random();
    const kind: EventKind = r < 0.5 ? 'gold' : r < 0.8 ? 'treasure' : 'boost';
    this.events.set(floor, { kind, until: this.scene.time.now + FLOOR_EVENT.life * 1000 });
    sfx('event');
    this.rebuild();
  }

  private claim(floor: number) {
    const ev = this.events.get(floor);
    const row = this.rows.find((r) => r.floor === floor);
    if (!ev || !row) return;
    this.events.delete(floor);
    sfx(ev.kind === 'gold' ? 'coin' : 'up');
    const pos = this.chestPos(row);
    const who = companionDef(state.stationed[floor] ?? 'apprentice').name;
    if (ev.kind === 'gold') {
      const g = FLOOR_EVENT.gold(state.cleared);
      addGold(g);
      floatText(this.scene, pos.x - 180, pos.y - 6, `+${g}G`, '#ffd84a');
      bus.emit('toast', `${who}: 길에서 금화를 주웠어요!`);
    } else if (ev.kind === 'treasure') {
      const id = `${floorDef(floor).line}2`;
      for (let i = 0; i < FLOOR_EVENT.treasure; i++) chestOf(floor).push(id);
      bus.emit('toast', `${who}: 좋은 재료를 찾았어요! (상자에 넣음)`);
    } else {
      boosts[floor] = Date.now() + FLOOR_EVENT.boostSeconds * 1000;
      bus.emit('toast', `${who}: 의욕 폭발! ${FLOOR_EVENT.boostSeconds}초간 생산 x${FLOOR_EVENT.boostMult}`);
    }
    this.rebuild();
  }

  /** Screen position of a floor's chest, clamped to the visible list. */
  private chestPos(row: Row) {
    return {
      x: this.list.x + row.box.x + row.chest.x,
      y: Phaser.Math.Clamp(this.list.y + row.box.y + row.chest.y, LIST.y + 8, LIST.y + LIST.h - 8),
    };
  }

  /** Click on a chest: pour out as much as the grid can take. */
  private dump(floor: number) {
    const row = this.rows.find((r) => r.floor === floor);
    if (!row) return;
    const chest = chestOf(floor);
    const pos = this.chestPos(row);
    let n = 0;
    while (chest.length > 0 && this.hooks.flyIn(chest[0], pos.x, pos.y, n * 50)) {
      chest.shift();
      n++;
    }
    if (n === 0 && chest.length > 0) bus.emit('toast', '합성판이 가득 찼습니다');
  }

  update(dt: number) {
    tickProduction(dt);

    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = Phaser.Math.Between(FLOOR_EVENT.minGap, FLOOR_EVENT.maxGap);
      this.spawnEvent();
    }
    let expired = false;
    for (const [f, ev] of this.events) {
      if (ev.until < this.scene.time.now || !state.stationed[f]) {
        this.events.delete(f);
        expired = true;
      }
    }
    if (expired) this.rebuild();

    // one item at a time trickles from the chests into free grid cells
    this.flowTimer += dt;
    if (this.flowTimer >= FLOW_EVERY) {
      this.flowTimer = 0;
      for (let k = 0; k < this.rows.length; k++) {
        const row = this.rows[(this.flowFrom + k) % this.rows.length];
        const chest = chestOf(row.floor);
        if (chest.length === 0) continue;
        const pos = this.chestPos(row);
        if (this.hooks.flyIn(chest[0], pos.x, pos.y)) chest.shift();
        this.flowFrom = (this.flowFrom + k + 1) % this.rows.length;
        break;
      }
    }

    const blink = Math.floor(this.scene.time.now / 400) % 2;
    const waiting = idleCompanions().length > 0; // someone could be put to work
    for (const row of this.rows) {
      const n = chestOf(row.floor).length;
      const cap = chestCap();
      const full = n >= cap;
      const working = productionRate(row.floor) > 0 && !full;
      const boosted = (boosts[row.floor] ?? 0) > Date.now();
      row.bar.width = Math.round(BAR_W * (full ? 1 : Math.min(1, state.prog[row.floor] ?? 0)));
      row.bar.fillColor = full ? 0xe8504a : boosted ? 0xffb03a : 0x8ee06a;
      row.flame.setVisible(boosted && !full);
      row.count.setText(`${Math.min(n, 99)}/${cap}`);
      row.chest.setFrame(n > 0 ? 1 : 0);
      row.chest.x = 206 + (full ? blink * 2 - 1 : 0);
      row.plus?.setAlpha(waiting && blink ? 1 : 0.45).setScale(waiting && blink ? 1.25 : 1);
      const who = state.stationed[row.floor];
      if (row.worker && who) {
        const base = companionDef(who).sprite * 2;
        row.worker.setFrame(base + (working ? blink : 0));
      }
    }

    const front = frontline();
    const def = floorDef(front);
    const fighting = state.floor === front;
    this.headTitle.setText(`최전선 F${front} ${def.name}`);
    this.headSub.setText(
      fighting
        ? def.kind === 'boss' ? `보스 도전 중 (토벌 ${state.bossKills}회)` : `처치 ${state.kills}/${def.kills}`
        : `F${state.floor}에서 재정비 중`,
    );
    this.headFill.width = Math.round((TOWER.w - 16) * (fighting && def.kills > 0 ? Math.min(1, state.kills / def.kills) : 0));
  }
}
