import { FUSIONS, ITEMS, MAX_TIER } from './items';
import { WEAPONS } from './weapons';

const POTION_USE: Record<string, string> = {
  herb3: '전투 중 HP 50% 회복 (자동)',
  herb4: '전투 중 HP 100% 회복 (자동)',
};

/** Short lines describing what an item is good for, shown while dragging it. */
export function itemUses(id: string): string[] {
  const out: string[] = [];
  if (POTION_USE[id]) out.push(POTION_USE[id]);
  for (const w of WEAPONS) {
    if (w.recipe?.some((r) => r.id === id)) out.push(`${w.name} 제작 재료`);
    if (w.enhance === id) out.push(`${w.name} 강화 재료`);
  }
  if (FUSIONS.some((f) => f.a === id || f.b === id)) out.push('어떤 재료와 융합됨 (도감)');
  return out;
}

export const isMaxTier = (id: string) => ITEMS[id]?.kind === 'mat' && ITEMS[id].tier === MAX_TIER;

/**
 * Finished goods go to the bag (stacked, no grid space): potions, crafting / enhancing materials (T3+),
 * boss parts and fusion items. The merge grid keeps the raw T1-T2 materials.
 */
export const isBagItem = (id: string) => {
  const d = ITEMS[id];
  return !!d && (d.kind !== 'mat' || (d.tier ?? 0) >= 3);
};

export type BagSection = 'potion' | 'material' | 'boss' | 'special' | 'raw';
export const BAG_SECTIONS: { id: BagSection; name: string }[] = [
  { id: 'potion', name: '물약' },
  { id: 'material', name: '제작 · 강화 재료' },
  { id: 'boss', name: '보스 소재' },
  { id: 'special', name: '융합 아이템' },
  { id: 'raw', name: '보관한 재료' },
];

export function bagSection(id: string): BagSection {
  const d = ITEMS[id];
  if (d.kind === 'boss') return 'boss';
  if (d.kind === 'fusion') return 'special';
  if ((d.tier ?? 0) < 3) return 'raw';
  return d.line === 'herb' ? 'potion' : 'material';
}
