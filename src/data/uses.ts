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
