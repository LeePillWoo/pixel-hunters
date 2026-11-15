import Phaser from 'phaser';
import { DEPTH, GAME_H, GAME_W, label } from '../config';
import { FUSIONS, ITEMS, LINES, LINE_NAME, MAX_TIER } from '../data/items';
import { CHEST_MAX_LV, CHEST_PER_LV, chestLvCost, floorDef } from '../data/floors';
import { COMPANIONS, COMP_LV_BONUS, COMP_MAX_LV, compLvCost, companionDef } from '../data/companions';
import sprites from '../data/sprites.json';
import { ENHANCE, HUNTER, WEAPONS } from '../data/weapons';
import {
  activeQuests, attack, bus, chestCap, completeQuest, consumeAll, countItem, hasAll, maxHp, spendGold, state, station, weaponPower,
} from '../state';
import { sfx } from '../audio';
import { STORY_QUESTS } from '../data/companions';
import { button } from './widgets';

let current: Modal | null = null;

/** Centered window over a dimmed, click-blocking backdrop. Only one is open at a time. */
export class Modal {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Container;
  readonly x: number;
  readonly y: number;

  constructor(readonly scene: Phaser.Scene, readonly w: number, readonly h: number, title: string) {
    current?.close();
    current = this;
    this.x = Math.round((GAME_W - w) / 2);
    this.y = Math.round((GAME_H - h) / 2);
    const s = scene;
    const dim = s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive();
    dim.on('pointerdown', () => this.close());
    const panel = s.add.nineslice(this.x, this.y, 'panel', undefined, w, h, 8, 8, 8, 8).setOrigin(0);
    const block = s.add.zone(this.x, this.y, w, h).setOrigin(0).setInteractive(); // clicks inside don't close
    this.body = s.add.container(this.x, this.y);
    this.root = s.add.container(0, 0, [dim, panel, block,
      label(s, this.x + 10, this.y + 7, title, { size: 'md', color: '#ffe890' }),
      button(s, this.x + w - 26, this.y + 5, 20, 18, 'X', () => this.close(), { key: 'btn_dark' }),
      this.body,
    ]).setDepth(DEPTH.modal);
  }

  close() {
    if (current === this) current = null;
    this.root.destroy();
  }
}

export const closeModal = () => current?.close();

const needText = (need: { id: string; n: number }[]) =>
  need.map((r) => `${ITEMS[r.id].name} ${Math.min(countItem(r.id), r.n)}/${r.n}`).join('  ');

function needIcons(m: Modal, x: number, y: number, need: { id: string; n: number }[]) {
  need.forEach((r, i) => {
    const ok = countItem(r.id) >= r.n;
    m.body.add(m.scene.add.image(x + i * 62 + 12, y + 12, 'items', ITEMS[r.id].frame));
    m.body.add(label(m.scene, x + i * 62 + 26, y + 7, `${countItem(r.id)}/${r.n}`, { color: ok ? '#8ee06a' : '#ff9a8a' }));
  });
}

// ---------------------------------------------------------------- craft & training

export function openCraft(scene: Phaser.Scene) {
  const m = new Modal(scene, 480, 280, '대장간 — 무기 제작 · 단련');
  const draw = () => {
    m.body.removeAll(true);
    const s = scene;
    WEAPONS.forEach((w, i) => {
      const y = 28 + i * 44;
      m.body.add(s.add.nineslice(8, y, 'btn_dark', undefined, 464, 40, 6, 6, 6, 6).setOrigin(0));
      m.body.add(s.add.image(26, y + 20, 'items', w.frame));
      const lv = state.weaponLv[w.id] ?? 0;
      m.body.add(label(s, 44, y + 4, lv > 0 ? `${w.name} +${lv}` : w.name, { size: 'md' }));
      m.body.add(label(s, 44, y + 21, `${w.interval}초마다 x${weaponPower(w.id).toFixed(2)} · ${w.desc}`, { color: '#c8b8a8' }));
      const owned = state.weapons.includes(w.id);
      if (!owned && w.recipe) needIcons(m, 262, y + 8, w.recipe);
      if (owned && lv < ENHANCE.max) {
        // enhancement: T4 material + gold
        const cost = ENHANCE.cost(lv);
        const need = [{ id: w.enhance, n: cost.n }];
        needIcons(m, 262, y + 8, need);
        const eb = button(s, 336, y + 9, 62, 22, `+${lv + 1} ${cost.gold}G`, () => {
          if (state.gold < cost.gold || !consumeAll(need)) return;
          spendGold(cost.gold);
          state.weaponLv[w.id] = lv + 1;
          sfx('up');
          bus.emit('toast', `${w.name} +${lv + 1} 강화 성공!`);
          bus.emit('hunter');
          draw();
        }, { key: 'btn_yellow' });
        eb.setEnabled(hasAll(need) && state.gold >= cost.gold);
        m.body.add(eb);
      }
      const equipped = state.weapon === w.id;
      const text = equipped ? '장착 중' : owned ? '장착' : '제작';
      const b = button(s, 404, y + 9, 60, 22, text, () => {
        if (!owned) {
          if (!w.recipe || !consumeAll(w.recipe)) return;
          state.weapons.push(w.id);
          bus.emit('toast', `${w.name} 제작 완료!`);
          sfx('fusion');
        }
        state.weapon = w.id;
        bus.emit('hunter');
        draw();
      }, { key: equipped ? 'btn_dark' : owned ? 'btn' : 'btn_yellow' });
      b.setEnabled(!equipped && (owned || (!!w.recipe && hasAll(w.recipe))));
      m.body.add(b);
    });

    const ty = 28 + WEAPONS.length * 44 + 8;
    m.body.add(label(s, 10, ty, '단련 · 시설', { size: 'md', color: '#ffe890' }));
    const train = (x: number, name: string, lv: number, value: string, cost: number | null, up: () => void) => {
      m.body.add(label(s, x, ty + 20, `${name} Lv.${lv}  (${value})`));
      const b = button(s, x, ty + 34, 148, 22, cost === null ? '최대' : `강화 ${cost}G`, () => {
        if (cost === null || !spendGold(cost)) return;
        up();
        sfx('up');
        bus.emit('hunter');
        draw();
      }, { icon: 6 });
      b.setEnabled(cost !== null && state.gold >= cost);
      m.body.add(b);
    };
    train(10, '공격력', state.atkLv, `${attack()}`, HUNTER.trainCost(state.atkLv), () => state.atkLv++);
    train(166, '체력', state.hpLv, `${maxHp()}`, HUNTER.trainCost(state.hpLv), () => {
      state.hpLv++;
      state.hp += HUNTER.hpPerLv;
    });
    train(322, '상자 용량', state.chestLv, `${chestCap()}칸`, state.chestLv < CHEST_MAX_LV ? chestLvCost(state.chestLv) : null, () => {
      state.chestLv++;
      bus.emit('toast', `모든 층의 상자가 ${chestCap()}칸이 되었습니다 (+${CHEST_PER_LV})`);
    });
  };
  draw();
}

// ---------------------------------------------------------------- quests

export function openQuests(scene: Phaser.Scene) {
  const m = new Modal(scene, 380, 190, '의뢰 게시판');
  const draw = () => {
    m.body.removeAll(true);
    activeQuests().forEach((q, i) => {
      const y = 28 + i * 76;
      m.body.add(scene.add.nineslice(8, y, 'btn_dark', undefined, 364, 70, 6, 6, 6, 6).setOrigin(0));
      m.body.add(label(scene, 16, y + 5, q.title, { size: 'md' }));
      const reward = q.companion ? `보상 ${q.gold}G + 동료 ${companionDef(q.companion).name}` : `보상 ${q.gold}G`;
      m.body.add(label(scene, 16, y + 22, reward, { color: '#ffd84a' }));
      m.body.add(label(scene, 16, y + 38, needText(q.need), { color: '#c8b8a8', wrap: 260 }));
      const b = button(scene, 296, y + 24, 66, 24, '납품', () => {
        if (!completeQuest(q)) return;
        sfx('quest');
        draw();
      }, { key: 'btn_yellow' });
      b.setEnabled(hasAll(q.need));
      m.body.add(b);
    });
  };
  draw();
}

// ---------------------------------------------------------------- storage

export function openStorage(scene: Phaser.Scene, withdraw: (id: string) => boolean) {
  const m = new Modal(scene, 340, 220, '창고 — 누르면 합성판으로 꺼냅니다');
  const draw = () => {
    m.body.removeAll(true);
    const ids = Object.keys(state.storage).filter((id) => state.storage[id] > 0);
    if (ids.length === 0) {
      m.body.add(label(scene, 170, 110, '비어 있습니다. 아이템을 창고 버튼으로 끌어다 놓으세요.', { color: '#c8b8a8', origin: [0.5, 0.5], wrap: 260 }));
      return;
    }
    ids.forEach((id, i) => {
      const x = 12 + (i % 8) * 40;
      const y = 30 + Math.floor(i / 8) * 44;
      const slot = scene.add.image(x + 17, y + 17, 'slot', 0).setInteractive({ useHandCursor: true });
      slot.on('pointerdown', () => {
        if (withdraw(id)) draw();
        else bus.emit('toast', '합성판에 빈칸이 없습니다');
      });
      m.body.add(slot);
      m.body.add(scene.add.image(x + 17, y + 17, 'items', ITEMS[id].frame));
      m.body.add(label(scene, x + 32, y + 24, `${state.storage[id]}`, { stroke: true, origin: [1, 0] }));
    });
  };
  draw();
}

// ---------------------------------------------------------------- companions

export function openCompanions(scene: Phaser.Scene, floor: number) {
  const def = floorDef(floor);
  const m = new Modal(scene, 380, 64 + COMPANIONS.length * 38, `F${floor} ${def.name} — 동료 배치`);
  const where = (id: string) => Object.keys(state.stationed).find((f) => state.stationed[+f] === id);
  const draw = () => {
    m.body.removeAll(true);
    m.body.add(label(scene, 10, 24, `이 층의 생산품: ${LINE_NAME[def.line]}`, { color: '#c8b8a8' }));
    state.companions.forEach((id, i) => {
      const c = companionDef(id);
      const y = 40 + i * 38;
      const at = where(id);
      const lv = state.compLv[id] ?? 0;
      m.body.add(scene.add.nineslice(8, y, 'btn_dark', undefined, 364, 34, 6, 6, 6, 6).setOrigin(0));
      m.body.add(scene.add.image(24, y + 32, 'companions', c.sprite * 2)
        .setOrigin(sprites.companions.originX, sprites.companions.originY));
      m.body.add(label(scene, 42, y + 4, `${c.name} Lv.${lv}`));
      const bonus = c.lines.length ? `${c.lines.map((l) => LINE_NAME[l]).join('·')} +50%` : '특기 없음';
      m.body.add(label(scene, 42, y + 17, `${bonus} · 생산 +${Math.round(lv * COMP_LV_BONUS * 100)}% · ${at ? `F${at}` : '대기'}`, {
        color: c.lines.includes(def.line) ? '#8ee06a' : '#c8b8a8',
      }));
      const cost = lv < COMP_MAX_LV ? compLvCost(lv) : null;
      const up = button(scene, 228, y + 7, 74, 20, cost === null ? '최대' : `강화 ${cost}G`, () => {
        if (cost === null || !spendGold(cost)) return;
        state.compLv[id] = lv + 1;
        sfx('up');
        draw();
      }, { key: 'btn_yellow' });
      up.setEnabled(cost !== null && state.gold >= cost);
      m.body.add(up);
      const here = at === String(floor);
      m.body.add(button(scene, 308, y + 7, 58, 20, here ? '철수' : '배치', () => {
        station(floor, here ? null : id);
        m.close();
      }, { key: here ? 'btn_dark' : 'btn' }));
    });
    if (state.companions.length < COMPANIONS.length) {
      const next = STORY_QUESTS.slice(state.storyIdx).find((q) => q.companion);
      const text = next ? `다음 동료: ${companionDef(next.companion!).name} — 의뢰 '${next.title}' 완료 시 합류` : '의뢰를 완료하면 새 동료가 합류합니다.';
      m.body.add(label(scene, 10, 44 + state.companions.length * 38, text, { color: '#ffe890' }));
    }
  };
  draw();
}

// ---------------------------------------------------------------- codex

/** Every item with a silhouette until found; secret fusions show one ingredient as a hint (Little Alchemy style). */
export function openCodex(scene: Phaser.Scene) {
  const m = new Modal(scene, 440, 250, '도감');
  const seen = new Set(state.seen);
  const icon = (x: number, y: number, id: string) => {
    const img = scene.add.image(x, y, 'items', ITEMS[id].frame);
    if (!seen.has(id)) img.setTintFill(0x241a1c).setAlpha(0.8);
    m.body.add(img);
  };
  const total = Object.keys(ITEMS).length;
  m.body.add(label(scene, 404, 9, `발견 ${state.seen.filter((id) => ITEMS[id]).length}/${total}`, { color: '#ffd84a', origin: [1, 0] }));

  LINES.forEach((line, li) => {
    const y = 44 + li * 30;
    m.body.add(label(scene, 12, y - 6, LINE_NAME[line], { color: '#c8b8a8' }));
    for (let t = 1; t <= MAX_TIER; t++) icon(56 + (t - 1) * 28, y, `${line}${t}`);
  });

  m.body.add(label(scene, 180, 26, '보스 소재 (BREAK로만 획득)', { color: '#c8b8a8' }));
  ['horn', 'claw', 'shell'].forEach((id, i) => icon(194 + i * 30, 52, id));

  m.body.add(label(scene, 180, 74, '시크릿 융합', { color: '#c8b8a8' }));
  FUSIONS.forEach((f, i) => {
    const y = 100 + i * 30;
    icon(194, y, f.result);
    const text = seen.has(f.result)
      ? `${ITEMS[f.result].name} = ${ITEMS[f.a].name} + ${ITEMS[f.b].name}`
      : `??? = ${seen.has(f.a) ? ITEMS[f.a].name : '???'} + ???`;
    m.body.add(label(scene, 212, y - 6, text, { color: seen.has(f.result) ? '#f6ecd8' : '#8a7a70' }));
  });
  m.body.add(label(scene, 180, 196, '처음 얻은 아이템은 도감에 등록되고 보너스 골드를 줍니다.', { color: '#8a7a70', wrap: 250 }));
}

// ---------------------------------------------------------------- message

export function openMessage(scene: Phaser.Scene, title: string, text: string) {
  const m = new Modal(scene, 300, 110, title);
  m.body.add(label(scene, 150, 50, text, { origin: [0.5, 0.5], wrap: 270 }));
  m.body.add(button(scene, 115, 78, 70, 22, '확인', () => m.close()));
}
