import Phaser from 'phaser';
import { CELL, DEPTH, GRID_COLS, GRID_ROWS, GRID_X, GRID_Y, MERGE, label } from '../config';
import { sfx } from '../audio';
import { ITEMS, fusionOf, nextTier } from '../data/items';
import { isBagItem, isMaxTier, itemUses } from '../data/uses';
import { HUNTER, WEAPONS } from '../data/weapons';
import {
  CELLS, addGold, addStorage, bus, discover, emptyCell, hasAll, questNeeds, reservedCells, spendGold, state, storageTotal,
  unlockCost,
} from '../state';
import { planMerges } from '../logic';
import { floatText, sparkle, toast } from '../ui/widgets';

const SIDE = { x: GRID_X + GRID_COLS * CELL + 6, w: 106, h: 31, gap: 4 };
const sideRect = (i: number) => new Phaser.Geom.Rectangle(SIDE.x, GRID_Y + i * (SIDE.h + SIDE.gap), SIDE.w, SIDE.h);
const AUTO_RECT = sideRect(0);
const STORAGE_RECT = sideRect(1); // the bag
const CRAFT_RECT = sideRect(2);
const SELL_RECT = sideRect(3);
const AUTO_STEP_MS = 90; // delay between merges during auto-merge

const QUEST_COLOR = 0xffd84a;
const MERGE_COLOR = 0x8ee06a;
const FUSION_COLOR = 0xff9ad8;
const COMBO_WINDOW = 2500; // ms between merges to keep a combo going
const HINT_IDLE = 10_000; // ms without touching the grid before a merge hint shows

/** Bottom-right panel: the merge grid plus storage / craft / sell. */
export class MergePanel {
  private slots: Phaser.GameObjects.Image[] = [];
  private locks: (Phaser.GameObjects.Image | null)[] = [];
  private sprites: (Phaser.GameObjects.Image | null)[] = new Array(CELLS).fill(null);
  private questGlow: Phaser.GameObjects.Rectangle[] = [];
  private targetGlow: Phaser.GameObjects.Rectangle[] = [];
  private badges: Phaser.GameObjects.Image[] = [];
  private tip: Phaser.GameObjects.Text;
  private storageLabel: Phaser.GameObjects.Text;
  private craftLabel: Phaser.GameObjects.Text;
  private autoLabel: Phaser.GameObjects.Text;
  private autoBusy = false;
  private pendingUnlock = { cell: -1, until: 0 };
  private dragging = -1;

  private combo = 0;
  private lastMerge = 0;
  private lastTouch = 0;
  private lastHint = 0;
  private hintToasted = false; // the text only shows once per session; later hints just wiggle
  private hand: Phaser.GameObjects.Image;
  private handTween: Phaser.Tweens.Tween | null = null;
  private handPair = '';
  private guide: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene) {
    scene.add.nineslice(MERGE.x, MERGE.y, 'panel', undefined, MERGE.w, MERGE.h, 8, 8, 8, 8).setOrigin(0).setDepth(DEPTH.bg);

    for (let i = 0; i < CELLS; i++) {
      const { x, y } = this.cellPos(i);
      const slot = scene.add.image(x, y, 'slot', 0).setDepth(DEPTH.ui).setInteractive();
      slot.on('pointerdown', () => this.clickSlot(i));
      this.slots.push(slot);
      this.locks.push(null);
      this.questGlow.push(scene.add.rectangle(x, y, CELL - 4, CELL - 4).setStrokeStyle(2, QUEST_COLOR).setDepth(DEPTH.ui + 1).setVisible(false));
      this.targetGlow.push(scene.add.rectangle(x, y, CELL - 2, CELL - 2).setStrokeStyle(2, MERGE_COLOR).setDepth(DEPTH.ui + 2).setVisible(false));
      this.badges.push(scene.add.image(x + 10, y - 10, 'icons', 3).setDepth(DEPTH.item + 1).setVisible(false));
    }

    this.autoLabel = this.sideButton(AUTO_RECT, 6, '자동 합성', () => this.autoMerge());
    this.storageLabel = this.sideButton(STORAGE_RECT, 0, '가방', () => bus.emit('modal', 'storage'));
    this.craftLabel = this.sideButton(CRAFT_RECT, 1, '제작 · 단련', () => bus.emit('modal', 'craft'));
    this.sideButton(SELL_RECT, 2, '판매', () => toast(scene, '아이템을 끌어다 놓으면 팔립니다'));

    this.tip = label(scene, 0, 0, '', { stroke: true, origin: [0.5, 1], wrap: 200 }).setDepth(DEPTH.drag + 1).setVisible(false);
    this.hand = scene.add.image(0, 0, 'icons', 11).setDepth(DEPTH.fx).setVisible(false);
    this.guide = label(scene, GRID_X + (GRID_COLS * CELL) / 2, MERGE.y + 6, '같은 아이템끼리 끌어다 겹치면 합쳐집니다!', {
      color: '#ffe890', stroke: true, origin: [0.5, 0.5],
    }).setDepth(DEPTH.fx).setVisible(false);

    bus.on('grid', this.sync, this);
    bus.on('quests', this.sync, this);
    bus.on('storage', this.sync, this);
    bus.on('storage', this.syncStorage, this);
    for (const e of ['gold', 'storage', 'grid', 'hunter']) bus.on(e, this.syncCraft, this);
    this.sync();
    this.syncStorage();
    this.syncCraft();
  }

  private sideButton(r: Phaser.Geom.Rectangle, icon: number, text: string, onClick: () => void) {
    const bg = this.scene.add.nineslice(r.x, r.y, 'btn', undefined, r.width, r.height, 6, 6, 6, 6).setOrigin(0).setDepth(DEPTH.ui);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    this.scene.add.image(r.x + 16, r.centerY, 'icons', icon).setDepth(DEPTH.ui);
    return label(this.scene, r.x + 30, r.centerY - 1, text, { color: '#3a1e18', origin: [0, 0.5] }).setDepth(DEPTH.ui);
  }

  cellPos(i: number) {
    return {
      x: GRID_X + (i % GRID_COLS) * CELL + CELL / 2,
      y: GRID_Y + Math.floor(i / GRID_COLS) * CELL + CELL / 2,
    };
  }

  private cellAt(x: number, y: number): number {
    const cx = Math.floor((x - GRID_X) / CELL);
    const cy = Math.floor((y - GRID_Y) / CELL);
    if (cx < 0 || cy < 0 || cx >= GRID_COLS || cy >= GRID_ROWS) return -1;
    return cy * GRID_COLS + cx;
  }

  /** Where bag items fly to. */
  storagePos() {
    return { x: STORAGE_RECT.x + 16, y: STORAGE_RECT.centerY };
  }

  // ---------------------------------------------------------------- view sync

  private sync() {
    // items an open quest asks for: gold frame + scroll badge (check badge once there are enough)
    const needs = questNeeds();
    for (let i = 0; i < CELLS; i++) {
      const gid = state.grid[i];
      if (gid) discover(gid);
      const need = gid ? needs.get(gid) : undefined;
      const show = !!need && i !== this.dragging;
      this.questGlow[i].setVisible(show);
      this.badges[i].setVisible(show).setFrame(need && need.have >= need.need ? 8 : 3);

      const { x, y } = this.cellPos(i);
      const open = state.unlocked[i];
      this.slots[i].setFrame(open ? 0 : 1);
      if (!open && !this.locks[i]) this.locks[i] = this.scene.add.image(x, y, 'icons', 5).setDepth(DEPTH.ui).setAlpha(0.7);
      if (open && this.locks[i]) {
        this.locks[i]!.destroy();
        this.locks[i] = null;
      }

      const cur = this.sprites[i];
      if (cur && cur.getData('id') === gid) {
        if (i !== this.dragging) cur.setPosition(x, y).setDepth(DEPTH.item);
        continue;
      }
      cur?.destroy();
      this.sprites[i] = gid ? this.makeItem(i, gid, x, y) : null;
    }
    const n = this.planMerges().length;
    this.autoLabel.setText(n > 0 ? `자동 합성 (${n})` : '자동 합성').setAlpha(n > 0 ? 1 : 0.5);
  }

  private syncStorage() {
    this.storageLabel.setText(`가방 (${storageTotal()})`);
  }

  /** "!" on the craft button when there is something to buy or craft. */
  private syncCraft() {
    const train = Math.min(HUNTER.trainCost(state.atkLv), HUNTER.trainCost(state.hpLv));
    const craftable = WEAPONS.some((w) => w.recipe && !state.weapons.includes(w.id) && hasAll(w.recipe));
    const ready = craftable || state.gold >= train;
    this.craftLabel.setText(ready ? '제작 · 단련 !' : '제작 · 단련').setColor(ready ? '#a8281c' : '#3a1e18');
  }

  private tipText(id: string): string {
    const def = ITEMS[id];
    const lines = [`${def.name} · ${def.sell}G`];
    const next = nextTier(id);
    if (next) lines.push(`같은 것끼리 → ${ITEMS[next].name}${isBagItem(next) ? ' (가방으로)' : ''}`);
    else if (isMaxTier(id)) lines.push('최고 단계 (더 합칠 수 없음)');
    lines.push(...itemUses(id));
    const need = questNeeds().get(id);
    if (need) lines.push(`의뢰에 필요 (${Math.min(need.have, need.need)}/${need.need})`);
    return lines.join('\n');
  }

  private makeItem(cell: number, id: string, x: number, y: number) {
    const def = ITEMS[id];
    const img = this.scene.add.image(x, y, 'items', def.frame).setDepth(DEPTH.item).setData('id', id);
    img.setInteractive({ useHandCursor: true, draggable: true });
    img.on('dragstart', () => {
      this.dragging = cell;
      this.lastTouch = this.scene.time.now;
      this.badges[cell].setVisible(false);
      this.questGlow[cell].setVisible(false);
      img.setDepth(DEPTH.drag);
      this.tip.setText(this.tipText(id)).setVisible(true);
      this.showTargets(cell, id);
      sfx('pop');
    });
    img.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
      img.setPosition(dx, dy);
      const half = this.tip.width / 2 + 2;
      this.tip.setPosition(Math.round(Phaser.Math.Clamp(dx, half, 640 - half)), Math.round(Math.max(dy - 14, this.tip.height + 2)));
    });
    img.on('dragend', (p: Phaser.Input.Pointer) => {
      this.tip.setVisible(false);
      this.dragging = -1;
      this.targetGlow.forEach((g) => g.setVisible(false));
      this.drop(cell, p.x, p.y);
    });
    return img;
  }

  /** While dragging: green frame on cells it merges with, pink on known fusion partners. */
  private showTargets(from: number, id: string) {
    const canMerge = nextTier(id) !== null;
    for (let i = 0; i < CELLS; i++) {
      const other = state.grid[i];
      if (i === from || !other) continue;
      if (canMerge && other === id) this.targetGlow[i].setStrokeStyle(2, MERGE_COLOR).setVisible(true);
      else {
        const fused = fusionOf(id, other);
        if (fused && state.seen.includes(fused)) this.targetGlow[i].setStrokeStyle(2, FUSION_COLOR).setVisible(true);
      }
    }
  }

  // ---------------------------------------------------------------- rules

  private drop(from: number, x: number, y: number) {
    const a = state.grid[from];
    if (!a) return;
    const to = this.cellAt(x, y);

    if (to >= 0 && to !== from && state.unlocked[to] && !reservedCells.has(to)) {
      const b = state.grid[to];
      const merged = b === a ? nextTier(a) : null;
      const fused = b && !merged ? fusionOf(a, b) : null;
      if (!b) {
        state.grid[to] = a;
        state.grid[from] = null;
      } else if (merged || fused) {
        const result = (merged ?? fused)!;
        state.grid[from] = null;
        state.grid[to] = isBagItem(result) ? null : result;
        this.sync();
        this.onMerge(to, result, !!fused);
        if (isBagItem(result)) this.toBag(result, to);
      } else if (b === a && isMaxTier(a)) {
        const p = this.cellPos(to);
        floatText(this.scene, p.x, p.y - 16, '최고 단계!', '#ff9a8a', 'sm');
        sfx('deny');
      } else {
        state.grid[to] = a;
        state.grid[from] = b;
      }
    } else if (STORAGE_RECT.contains(x, y)) {
      state.grid[from] = null;
      addStorage(a);
      floatText(this.scene, x, y - 8, `${ITEMS[a].name} 가방에 넣음`, '#f6ecd8', 'sm');
      sfx('pop');
    } else if (SELL_RECT.contains(x, y)) {
      state.grid[from] = null;
      addGold(ITEMS[a].sell);
      floatText(this.scene, x, y - 8, `+${ITEMS[a].sell}G`, '#ffd84a');
      sfx('coin');
    }
    bus.emit('grid');
  }

  private onMerge(cell: number, result: string, fusion: boolean) {
    const now = this.scene.time.now;
    this.combo = now - this.lastMerge < COMBO_WINDOW ? this.combo + 1 : 1;
    this.lastMerge = now;
    if (!state.flags.merged) {
      state.flags.merged = true;
      toast(this.scene, '좋아요! 합칠수록 비싸지고, 의뢰에도 쓰입니다');
    }

    const { x, y } = this.cellPos(cell);
    const img = this.sprites[cell];
    if (img) this.scene.tweens.add({ targets: img, scale: { from: 1.6, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    sparkle(this.scene, x, y, fusion ? FUSION_COLOR : 0xffe890, fusion ? 14 : 8);
    floatText(this.scene, x, y - 16, `${ITEMS[result].name}!`, fusion ? '#ff9ad8' : '#ffe890', 'sm');
    sfx(fusion ? 'fusion' : 'merge');

    if (this.combo >= 3) {
      const bonus = this.combo * 2;
      addGold(bonus);
      floatText(this.scene, x, y - 30, `콤보 x${this.combo} +${bonus}G`, '#ffb03a');
      sfx('combo');
    }
  }

  private clickSlot(i: number) {
    if (state.unlocked[i]) return;
    const cost = unlockCost();
    const now = this.scene.time.now;
    if (this.pendingUnlock.cell !== i || now > this.pendingUnlock.until) {
      this.pendingUnlock = { cell: i, until: now + 3000 };
      toast(this.scene, `칸 열기 ${cost}G — 한 번 더 누르면 구매`);
      return;
    }
    this.pendingUnlock.cell = -1;
    if (!spendGold(cost)) {
      toast(this.scene, `골드가 부족합니다 (${cost}G 필요)`);
      sfx('deny');
      return;
    }
    state.unlocked[i] = true;
    const { x, y } = this.cellPos(i);
    sparkle(this.scene, x, y);
    sfx('up');
    bus.emit('grid');
  }

  // ---------------------------------------------------------------- auto-merge

  /** Planned auto-merge steps, leaving alone cells in flight or being dragged. */
  private planMerges() {
    return planMerges(new Set([...reservedCells, this.dragging]));
  }

  private autoMerge() {
    if (this.autoBusy) return;
    const steps = this.planMerges();
    if (steps.length === 0) {
      // pairs that exist but are all held back for quests
      const held = [...questNeeds().keys()].some((id) => nextTier(id) && state.grid.filter((g) => g === id).length >= 2);
      toast(this.scene, held ? '남은 짝은 의뢰용이라 합치지 않았습니다' : '합칠 수 있는 아이템이 없습니다');
      sfx('deny');
      return;
    }
    this.autoBusy = true;
    if (!state.flags.merged) state.flags.merged = true;
    let done = 0;
    // one step at a time: each merge finishes before the next starts, since later steps use earlier results
    const run = (k: number) => {
      if (k >= steps.length) {
        this.autoBusy = false;
        bus.emit('grid');
        const kept = [...questNeeds().keys()].some((id) => state.grid.includes(id));
        toast(this.scene, kept ? `자동 합성 ${done}회 (의뢰용 아이템은 남겨둠)` : `자동 합성 ${done}회`);
        return;
      }
      const st = steps[k];
      const id = state.grid[st.from];
      const next = () => this.scene.time.delayedCall(AUTO_STEP_MS, () => run(k + 1));
      // the player may have moved things meanwhile; skip steps that no longer apply
      const held = st.from === this.dragging || st.to === this.dragging;
      if (!id || held || state.grid[st.to] !== id || nextTier(id) !== st.result) return next();
      const to = this.cellPos(st.to);
      const apply = () => {
        if (state.grid[st.from] === id && state.grid[st.to] === id) {
          const bag = isBagItem(st.result);
          state.grid[st.from] = null;
          state.grid[st.to] = bag ? null : st.result;
          done++;
          this.sync();
          if (bag) this.toBag(st.result, st.to);
          const merged = this.sprites[st.to];
          if (merged) this.scene.tweens.add({ targets: merged, scale: { from: 1.4, to: 1 }, duration: 160, ease: 'Back.easeOut' });
          sparkle(this.scene, to.x, to.y, 0xffe890, 6);
          sfx('merge');
        }
        next();
      };
      const img = this.sprites[st.from];
      if (img) this.scene.tweens.add({ targets: img, x: to.x, y: to.y, duration: 70, onComplete: apply });
      else apply();
    };
    run(0);
  }

  // ---------------------------------------------------------------- guidance

  /** Two cells holding the same mergeable item, lowest tier first. */
  private findPair(): [number, number] | null {
    let best: [number, number] | null = null;
    let bestTier = Infinity;
    const first = new Map<string, number>();
    for (let i = 0; i < CELLS; i++) {
      const id = state.grid[i];
      if (!id || !nextTier(id)) continue;
      const j = first.get(id);
      if (j === undefined) first.set(id, i);
      else if ((ITEMS[id].tier ?? 9) < bestTier) {
        best = [j, i];
        bestTier = ITEMS[id].tier ?? 9;
      }
    }
    return best;
  }

  private stopHand() {
    this.handTween?.stop();
    this.handTween = null;
    this.handPair = '';
    this.hand.setVisible(false);
  }

  update(time: number) {
    // quest frames pulse so they catch the eye
    const pulse = 0.55 + 0.45 * Math.sin(time / 180);
    this.questGlow.forEach((g) => g.visible && g.setAlpha(pulse));

    const pair = this.dragging < 0 ? this.findPair() : null;

    // first-time guide: a hand keeps showing the drag until the first merge
    const tutorial = !state.flags.merged;
    this.guide.setVisible(tutorial);
    if (tutorial && pair) {
      const key = pair.join(',');
      if (key !== this.handPair) {
        this.stopHand();
        this.handPair = key;
        const a = this.cellPos(pair[0]);
        const b = this.cellPos(pair[1]);
        this.hand.setPosition(a.x + 6, a.y + 8).setVisible(true);
        this.handTween = this.scene.tweens.add({
          targets: this.hand, x: b.x + 6, y: b.y + 8, duration: 900, delay: 300, hold: 300, repeat: -1, repeatDelay: 200,
          ease: 'Sine.easeInOut',
        });
      }
      return;
    }
    if (this.handTween) this.stopHand();

    // later: when the grid is nearly full and the player is idle, wiggle a mergeable pair
    const used = state.grid.filter(Boolean).length;
    const open = state.unlocked.filter(Boolean).length;
    if (pair && used >= open - 2 && time - this.lastTouch > HINT_IDLE && time - this.lastHint > HINT_IDLE) {
      this.lastHint = time;
      for (const c of pair) {
        const img = this.sprites[c];
        if (img) this.scene.tweens.add({ targets: img, angle: { from: -12, to: 12 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => img.setAngle(0) });
      }
      if (!this.hintToasted) toast(this.scene, '합칠 수 있는 아이템이 있어요!');
      this.hintToasted = true;
    }
  }

  // ---------------------------------------------------------------- incoming items

  /** Sends an item flying from (x, y) into a free cell. False when the grid is full. */
  flyIn(id: string, x: number, y: number, delay = 0): boolean {
    if (isBagItem(id)) {
      const to = this.storagePos();
      const img = this.scene.add.image(x, y, 'items', ITEMS[id].frame).setDepth(DEPTH.fly);
      this.scene.tweens.add({ targets: img, x: to.x, y: to.y, delay, duration: 500, ease: 'Cubic.easeIn', onComplete: () => {
        img.destroy();
        addStorage(id);
      } });
      return true;
    }
    const cell = emptyCell();
    if (cell < 0) return false;
    reservedCells.add(cell);
    const to = this.cellPos(cell);
    const img = this.scene.add.image(x, y, 'items', ITEMS[id].frame).setDepth(DEPTH.fly).setVisible(delay === 0);
    this.scene.tweens.add({
      targets: img, x: to.x, y: to.y, delay, duration: 420, ease: 'Cubic.easeInOut',
      onStart: () => img.setVisible(true),
      onComplete: () => {
        img.destroy();
        reservedCells.delete(cell);
        state.grid[cell] = id;
        sfx('pop');
        bus.emit('grid');
      },
    });
    return true;
  }

  /** A finished item made on the grid flies from that cell into the bag. */
  private toBag(id: string, cell: number) {
    const from = this.cellPos(cell);
    const to = this.storagePos();
    addStorage(id);
    const img = this.scene.add.image(from.x, from.y, 'items', ITEMS[id].frame).setDepth(DEPTH.fly);
    this.scene.tweens.add({
      targets: img, x: to.x, y: to.y, delay: 150, duration: 450, ease: 'Cubic.easeIn', onComplete: () => img.destroy(),
    });
  }

  /** Bag -> grid (e.g. to try a fusion by hand). */
  withdraw(id: string): boolean {
    if ((state.storage[id] ?? 0) <= 0) return false;
    const cell = emptyCell();
    if (cell < 0) return false;
    state.storage[id]--;
    state.grid[cell] = id;
    bus.emit('storage');
    bus.emit('grid');
    return true;
  }
}
