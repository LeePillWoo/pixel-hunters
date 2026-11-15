import type { Line } from './items';

export interface MonsterDef {
  name: string;
  hp: number;
  atk: number;
  interval: number; // seconds between attacks
  gold: number;
  tint: number;
  scale: number;
}

export interface FloorDef {
  floor: number;
  name: string;
  kind: 'camp' | 'normal' | 'elite' | 'boss';
  line: Line; // what a stationed companion produces here
  t2Chance: number; // chance the product is T2 instead of T1
  kills: number; // kills needed to clear
  monster?: MonsterDef;
}

export const MAX_FLOOR = 10;
export const FIRST_COMBAT_FLOOR = 2; // F1 is the base camp
export const CHEST_BASE = 20;
export const CHEST_PER_LV = 5;
export const CHEST_MAX_LV = 8;
export const chestLvCost = (lv: number) => Math.round(60 * Math.pow(1.5, lv));
export const PRODUCE_SECONDS = 5;

const hp = (f: number) => Math.round(30 * Math.pow(1.3, f - 2));
const atk = (f: number) => Math.round(3 * Math.pow(1.2, f - 2) * 10) / 10;
const slime = (f: number, name: string, tint: number): MonsterDef => ({
  name, hp: hp(f), atk: atk(f), interval: 1.5, gold: 2 + f, tint, scale: 1,
});

export const FLOORS: FloorDef[] = [
  { floor: 1, name: '베이스캠프', kind: 'camp', line: 'herb', t2Chance: 0, kills: 0 },
  { floor: 2, name: '뼈 무덤', kind: 'normal', line: 'bone', t2Chance: 0, kills: 10, monster: slime(2, '풀 슬라임', 0x8ee06a) },
  { floor: 3, name: '짐승 굴', kind: 'normal', line: 'hide', t2Chance: 0, kills: 10, monster: slime(3, '진흙 슬라임', 0xc98a4c) },
  { floor: 4, name: '돌 광산', kind: 'normal', line: 'ore', t2Chance: 0, kills: 10, monster: slime(4, '바위 슬라임', 0xaab2bf) },
  {
    floor: 5, name: '깃털 둥지', kind: 'elite', line: 'feather', t2Chance: 0, kills: 1,
    monster: { name: '정예 왕슬라임', hp: hp(5) * 6, atk: atk(5) * 1.6, interval: 1.8, gold: 60, tint: 0xf2c94c, scale: 2 },
  },
  { floor: 6, name: '깊은 뼈 무덤', kind: 'normal', line: 'bone', t2Chance: 0.1, kills: 10, monster: slime(6, '독 슬라임', 0xb07ae0) },
  { floor: 7, name: '깊은 짐승 굴', kind: 'normal', line: 'hide', t2Chance: 0.15, kills: 10, monster: slime(7, '얼음 슬라임', 0x7ad0f0) },
  { floor: 8, name: '깊은 광산', kind: 'normal', line: 'ore', t2Chance: 0.2, kills: 10, monster: slime(8, '용암 슬라임', 0xff8a4a) },
  { floor: 9, name: '바람 둥지', kind: 'normal', line: 'feather', t2Chance: 0.25, kills: 10, monster: slime(9, '그림자 슬라임', 0x7a6a8a) },
  {
    floor: 10, name: '녹룡의 둥지', kind: 'boss', line: 'herb', t2Chance: 0.3, kills: 1,
    monster: { name: '새끼 녹룡', hp: 2800, atk: 14, interval: 2, gold: 300, tint: 0xffffff, scale: 1 },
  },
];

export const floorDef = (f: number) => FLOORS[f - 1];

/** Monsters drop the material of their floor (the hunter's own source of materials). */
export const DROP = {
  chance: 0.4, // per normal kill: one T1 of the floor's line
  elite: { n: 2, tier: 2 },
  boss: { n: 3, tier: 2 }, // random lines
};

/** Random requests that pop up over a working companion (Tiny Tower style). */
export const FLOOR_EVENT = {
  firstGap: 15, // seconds until the first one
  minGap: 30,
  maxGap: 60,
  life: 25, // seconds before the bubble disappears
  boostMult: 3,
  boostSeconds: 30,
  gold: (cleared: number) => 15 + cleared * 6,
  treasure: 2, // T2 items dropped into the chest
};

/** Boss break parts: where the weak point shows (offset from the boss sprite's feet) and what it drops. */
export const BOSS_PARTS = [
  { id: 'horn', name: '뿔', drop: 'horn', dx: -3, dy: -78 },
  { id: 'claw', name: '발톱', drop: 'claw', dx: -10, dy: -30 },
  { id: 'shell', name: '갑각', drop: 'shell', dx: 20, dy: -42 },
] as const;

export const BREAK = {
  minGap: 5, // seconds between weak points
  maxGap: 10,
  window: 1.5, // seconds the player has to react
  damageMult: 5,
  stun: 2,
  heavyEvery: 4, // every Nth boss attack is a telegraphed heavy attack
  heavyMult: 2.5,
  telegraph: 0.8,
};
