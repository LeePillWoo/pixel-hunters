import Phaser from 'phaser';
import { GRID_COLS, GRID_ROWS } from './config';
import { ITEMS, discoverReward, nextTier, type Line } from './data/items';
import { isBagItem } from './data/uses';
import { CHEST_BASE, CHEST_PER_LV, FIRST_COMBAT_FLOOR, FLOOR_EVENT, MAX_FLOOR, PRODUCE_SECONDS, floorDef } from './data/floors';
import { ENHANCE, HUNTER, weaponDef } from './data/weapons';
import { COMP_LV_BONUS, SPECIALTY_BONUS, STORY_QUESTS, companionDef, type QuestDef } from './data/companions';

const SAVE_KEY = 'pixel-hunters-save-v1';
export const CELLS = GRID_COLS * GRID_ROWS;
const START_COLS = 5; // 5x4 of the 8x4 grid is open at the start

export interface GameState {
  v: 1;
  gold: number;
  grid: (string | null)[];
  unlocked: boolean[];
  storage: Record<string, number>;
  chests: Record<number, string[]>; // per floor, waiting to fly to the grid
  prog: Record<number, number>; // per floor production progress (0..1)
  stationed: Record<number, string>; // floor -> companion id
  companions: string[];
  cleared: number; // highest cleared floor (F1 camp counts as cleared)
  floor: number; // floor the hunter is fighting on
  kills: number;
  hp: number;
  atkLv: number;
  hpLv: number;
  weapon: string;
  weapons: string[];
  storyIdx: number;
  order: QuestDef; // repeatable random order
  orderSeq: number;
  seen: string[]; // codex: every item obtained at least once
  compLv: Record<string, number>;
  chestLv: number;
  weaponLv: Record<string, number>;
  flags: Record<string, boolean>; // tutorial steps already done
  bossKills: number;
  lastSeen: number;
}

/**
 * Events: 'gold', 'grid', 'storage', 'tower', 'hunter', 'quests', 'codex',
 * 'toast' (text), 'modal' (name, arg).
 */
export const bus = new Phaser.Events.EventEmitter();

/** Grid cells an item is currently flying to (runtime only). */
export const reservedCells = new Set<number>();

/** Floor -> time (ms) a production boost ends (runtime only). */
export const boosts: Record<number, number> = {};

function newState(): GameState {
  const s: GameState = {
    v: 1,
    gold: 0,
    grid: new Array(CELLS).fill(null),
    unlocked: Array.from({ length: CELLS }, (_, i) => i % GRID_COLS < START_COLS),
    storage: {},
    chests: {},
    prog: {},
    stationed: { 1: 'apprentice' },
    companions: ['apprentice'],
    cleared: 1,
    floor: FIRST_COMBAT_FLOOR,
    kills: 0,
    hp: HUNTER.baseHp,
    atkLv: 0,
    hpLv: 0,
    weapon: 'sword',
    weapons: ['sword'],
    storyIdx: 0,
    order: { id: 'o0', title: '마을 납품', need: [{ id: 'herb2', n: 1 }], gold: 15 },
    orderSeq: 0,
    seen: [],
    compLv: {},
    chestLv: 0,
    weaponLv: {},
    flags: {},
    bossKills: 0,
    lastSeen: Date.now(),
  };
  s.grid[0] = 'herb1';
  s.grid[1] = 'herb1';
  return s;
}

export let state: GameState = newState();

/** Loads the save and returns how many seconds the player was away. */
export function loadState(): number {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw) as GameState;
    if (data.v !== 1) return 0;
    state = { ...newState(), ...data };
    // older saves kept finished goods on the grid; they live in the bag now
    state.grid = state.grid.map((id) => {
      if (id && isBagItem(id)) state.storage[id] = (state.storage[id] ?? 0) + 1;
      return id && isBagItem(id) ? null : id;
    });
    return Math.max(0, (Date.now() - state.lastSeen) / 1000);
  } catch {
    return 0;
  }
}

export function saveState() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode): the game still runs, it just won't persist
  }
}

export function resetState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // nothing to clear
  }
  state = newState();
}

// ---------------------------------------------------------------- hunter

export const frontline = () => Math.min(state.cleared + 1, MAX_FLOOR);
export const maxHp = () => HUNTER.baseHp + state.hpLv * HUNTER.hpPerLv;
export const attack = () => HUNTER.baseAtk + state.atkLv * HUNTER.atkPerLv;
/** Damage multiplier of a weapon including its enhancement. */
export const weaponPower = (id: string) => weaponDef(id).mult * (1 + ENHANCE.perLv * (state.weaponLv[id] ?? 0));
export const chestCap = () => CHEST_BASE + state.chestLv * CHEST_PER_LV;

/** First time an item is obtained: register it in the codex and pay the bonus. */
export function discover(id: string) {
  if (state.seen.includes(id)) return;
  state.seen.push(id);
  const gold = discoverReward(id);
  if (gold > 0) {
    addGold(gold);
    bus.emit('toast', `NEW! ${ITEMS[id].name} 도감 등록 (+${gold}G)`);
  }
  bus.emit('codex');
}

// ---------------------------------------------------------------- gold & inventory

export function addGold(n: number) {
  state.gold += Math.round(n);
  bus.emit('gold');
}

export function spendGold(n: number): boolean {
  if (state.gold < n) return false;
  state.gold -= n;
  bus.emit('gold');
  return true;
}

/** Items count from both the storage and the merge grid. */
export function countItem(id: string): number {
  return (state.storage[id] ?? 0) + state.grid.filter((g) => g === id).length;
}

export const hasAll = (need: { id: string; n: number }[]) => need.every((r) => countItem(r.id) >= r.n);

/** Takes from the storage first, then from the grid. */
export function consumeAll(need: { id: string; n: number }[]): boolean {
  if (!hasAll(need)) return false;
  for (const r of need) {
    let left = r.n;
    const stored = Math.min(left, state.storage[r.id] ?? 0);
    if (stored > 0) {
      state.storage[r.id] -= stored;
      left -= stored;
    }
    for (let i = 0; i < CELLS && left > 0; i++) {
      if (state.grid[i] === r.id) {
        state.grid[i] = null;
        left--;
      }
    }
  }
  bus.emit('storage');
  bus.emit('grid');
  return true;
}

export function addStorage(id: string, n = 1) {
  discover(id);
  state.storage[id] = (state.storage[id] ?? 0) + n;
  bus.emit('storage');
}

export const storageTotal = () => Object.values(state.storage).reduce((a, b) => a + b, 0);

/**
 * Bag pairs -> next tier. Keeps back what open quests still need.
 * Returns how many were made.
 */
export function combineInBag(id: string): number {
  const next = nextTier(id);
  const have = state.storage[id] ?? 0;
  if (!next) return 0;
  const keep = questNeeds().get(id)?.need ?? 0;
  const pairs = Math.floor(Math.max(0, have - keep) / 2);
  if (pairs === 0) return 0;
  state.storage[id] = have - pairs * 2;
  addStorage(next, pairs);
  return pairs;
}

export function emptyCell(): number {
  for (let i = 0; i < CELLS; i++) {
    if (state.unlocked[i] && state.grid[i] === null && !reservedCells.has(i)) return i;
  }
  return -1;
}

export function unlockCost(): number {
  const opened = state.unlocked.filter(Boolean).length - START_COLS * GRID_ROWS;
  return Math.round(40 * Math.pow(1.35, opened));
}

// ---------------------------------------------------------------- production

/** Items per second on a floor (0 when nobody is stationed). */
export function productionRate(floor: number): number {
  const who = state.stationed[floor];
  if (!who) return 0;
  const bonus = companionDef(who).lines.includes(floorDef(floor).line) ? SPECIALTY_BONUS : 1;
  const level = 1 + COMP_LV_BONUS * (state.compLv[who] ?? 0);
  const boost = (boosts[floor] ?? 0) > Date.now() ? FLOOR_EVENT.boostMult : 1;
  return (bonus * level * boost) / PRODUCE_SECONDS;
}

function rollProduct(floor: number): string {
  const def = floorDef(floor);
  return `${def.line}${Math.random() < def.t2Chance ? 2 : 1}`;
}

export const chestOf = (floor: number) => (state.chests[floor] ??= []);

/** Advances production on every staffed floor. Stops while a chest is full. */
export function tickProduction(dt: number) {
  for (let f = 1; f <= state.cleared; f++) {
    const rate = productionRate(f);
    const chest = chestOf(f);
    const cap = chestCap();
    if (rate === 0 || chest.length >= cap) continue;
    let p = (state.prog[f] ?? 0) + dt * rate;
    while (p >= 1 && chest.length < cap) {
      chest.push(rollProduct(f));
      p -= 1;
    }
    state.prog[f] = chest.length >= cap ? 0 : p;
  }
}

/** Offline production: capped by chest size. Returns how many items were added. */
export function produceOffline(seconds: number): number {
  let added = 0;
  for (let f = 1; f <= state.cleared; f++) {
    const chest = chestOf(f);
    const n = Math.min(Math.floor(seconds * productionRate(f)), chestCap() - chest.length);
    for (let i = 0; i < n; i++) chest.push(rollProduct(f));
    added += Math.max(0, n);
  }
  return added;
}

/** Station a companion on a floor (moves them if they were elsewhere). Null clears the floor. */
export function station(floor: number, companion: string | null) {
  for (const f of Object.keys(state.stationed)) {
    if (state.stationed[+f] === companion) delete state.stationed[+f];
  }
  if (companion) state.stationed[floor] = companion;
  else delete state.stationed[floor];
  state.prog[floor] = 0;
  bus.emit('tower');
}

// ---------------------------------------------------------------- quests

/** item id -> how many more the open quests still need (0 when there are enough). */
export function questNeeds(): Map<string, { need: number; have: number }> {
  const out = new Map<string, { need: number; have: number }>();
  for (const q of activeQuests()) {
    for (const r of q.need) {
      const cur = out.get(r.id);
      out.set(r.id, { need: (cur?.need ?? 0) + r.n, have: countItem(r.id) });
    }
  }
  return out;
}

export const idleCompanions = () => state.companions.filter((c) => !Object.values(state.stationed).includes(c));

const ORDER_TITLES = ['마을 납품', '상인의 주문', '대장장이의 주문', '연금술사의 주문'];

function rollOrder(): QuestDef {
  const lines = new Set<Line>();
  for (let f = 1; f <= state.cleared; f++) lines.add(floorDef(f).line);
  const pool = [...lines];
  const picks = Phaser.Utils.Array.Shuffle(pool).slice(0, pool.length > 1 && Math.random() < 0.5 ? 2 : 1);
  const need = picks.map((line) => {
    const tier = state.cleared >= 5 && Math.random() < 0.35 ? 3 : 2;
    return { id: `${line}${tier}`, n: tier === 3 ? 1 : Phaser.Math.Between(1, 3) };
  });
  const gold = need.reduce((sum, r) => sum + ITEMS[r.id].sell * r.n, 0) * 3;
  state.orderSeq++;
  return { id: `o${state.orderSeq}`, title: Phaser.Utils.Array.GetRandom(ORDER_TITLES), need, gold };
}

export function activeQuests(): QuestDef[] {
  const story = STORY_QUESTS[state.storyIdx];
  return story ? [story, state.order] : [state.order];
}

export function completeQuest(q: QuestDef): boolean {
  if (!consumeAll(q.need)) return false;
  addGold(q.gold);
  if (q.companion && !state.companions.includes(q.companion)) {
    state.companions.push(q.companion);
    bus.emit('toast', `${companionDef(q.companion).name} 합류! 탑의 빈 층에 배치하세요`);
  }
  if (STORY_QUESTS[state.storyIdx]?.id === q.id) state.storyIdx++;
  else state.order = rollOrder();
  bus.emit('quests');
  bus.emit('tower');
  return true;
}
