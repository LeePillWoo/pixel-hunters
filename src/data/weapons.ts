export interface WeaponDef {
  id: string;
  name: string;
  frame: number; // items.png
  interval: number; // seconds per attack
  mult: number; // damage multiplier per hit
  desc: string;
  enhance: string; // T4 item used to enhance
  recipe: { id: string; n: number }[] | null; // null = starting gear
}

export const WEAPONS: WeaponDef[] = [
  { id: 'sword', name: '낡은 검', frame: 28, interval: 1.0, mult: 1.0, desc: '기본 무기', enhance: 'feather4', recipe: null },
  {
    id: 'great', name: '대검', frame: 29, interval: 2.0, mult: 2.6, desc: '15% 확률로 적 경직', enhance: 'bone4',
    recipe: [{ id: 'bone3', n: 5 }, { id: 'shell', n: 1 }],
  },
  {
    id: 'dual', name: '쌍검', frame: 30, interval: 0.35, mult: 0.4, desc: '치명타 +20%, 출혈', enhance: 'hide4',
    recipe: [{ id: 'hide3', n: 5 }, { id: 'claw', n: 1 }],
  },
  {
    id: 'hammer', name: '해머', frame: 31, interval: 1.5, mult: 1.7, desc: 'BREAK 시간 2배, 기절', enhance: 'ore4',
    recipe: [{ id: 'ore3', n: 5 }, { id: 'horn', n: 1 }],
  },
];

export const weaponDef = (id: string) => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];

/** +1..+5 enhancement with T4 materials (Shop Titans style upgrade sink). */
export const ENHANCE = {
  max: 5,
  perLv: 0.15, // damage multiplier per level
  cost: (lv: number) => ({ n: Math.ceil((lv + 1) / 2), gold: 40 * (lv + 1) }),
};

export const HUNTER = {
  baseAtk: 10,
  atkPerLv: 3,
  baseHp: 100,
  hpPerLv: 25,
  trainCost: (lv: number) => Math.round(15 * Math.pow(1.35, lv)),
  critChance: 0.05,
  critMult: 2,
  healOnKill: 0.05, // fraction of max HP
  potionAt: 0.3, // auto-drink below this HP fraction
  staggerChance: 0.15, // greatsword
  dualCrit: 0.2,
  bleedPerStack: 0.04, // of attack, per second
  bleedMaxStacks: 10,
  hammerStunHits: 6,
  hammerStun: 1,
  hammerWindowMult: 2,
};
