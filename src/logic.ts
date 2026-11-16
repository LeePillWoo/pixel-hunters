// Game rules that don't need a screen: used by the full layout, the taskbar strip and background catch-up.
import { nextTier } from './data/items';
import { isBagItem } from './data/uses';
import { addStorage, bus, chestOf, emptyCell, questNeeds, reservedCells, state } from './state';

/** Puts an item straight into the grid (or the bag for finished goods). False when the grid is full. */
export function placeItem(id: string): boolean {
  if (isBagItem(id)) {
    addStorage(id);
    return true;
  }
  const cell = emptyCell();
  if (cell < 0) return false;
  state.grid[cell] = id;
  bus.emit('grid');
  return true;
}

/** Moves waiting items from the floor chests into free grid cells. Returns how many moved. */
export function drainChests(max = Infinity): number {
  let moved = 0;
  for (let f = state.cleared; f >= 1 && moved < max; f--) {
    const chest = chestOf(f);
    while (chest.length > 0 && moved < max && placeItem(chest[0])) {
      chest.shift();
      moved++;
    }
  }
  return moved;
}

export interface MergeStep {
  from: number;
  to: number;
  result: string;
}

/**
 * Every merge the grid allows, chained up the tiers. Items an open quest still needs are kept back
 * (as many as it asks for, minus what the bag already holds); secret fusions and items taken out of
 * the bag are left alone. `skip` holds cells that must not be touched (in flight, being dragged).
 */
export function planMerges(skip: Set<number> = reservedCells): MergeStep[] {
  const needs = questNeeds();
  const keep = (id: string) => Math.max(0, (needs.get(id)?.need ?? 0) - (state.storage[id] ?? 0));
  const grid = [...state.grid];
  const steps: MergeStep[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    const cells = new Map<string, number[]>();
    grid.forEach((id, i) => {
      if (id && nextTier(id) && !isBagItem(id) && !skip.has(i)) cells.set(id, [...(cells.get(id) ?? []), i]);
    });
    for (const [id, list] of cells) {
      const free = list.slice(Math.min(keep(id), list.length));
      for (let k = 0; k + 1 < free.length; k += 2) {
        const result = nextTier(id)!;
        steps.push({ from: free[k + 1], to: free[k], result });
        grid[free[k]] = isBagItem(result) ? null : result;
        grid[free[k + 1]] = null;
        changed = true;
      }
    }
  }
  return steps;
}

/** Applies one planned merge without animation. False if the grid changed since planning. */
export function applyMerge(st: MergeStep): boolean {
  const id = state.grid[st.from];
  if (!id || state.grid[st.to] !== id || nextTier(id) !== st.result) return false;
  state.grid[st.from] = null;
  if (isBagItem(st.result)) {
    state.grid[st.to] = null;
    addStorage(st.result);
  } else state.grid[st.to] = st.result;
  return true;
}

/** Instant auto-merge (strip mode / background). Returns how many merges happened. */
export function autoMergeNow(): number {
  let n = 0;
  for (const st of planMerges()) if (applyMerge(st)) n++;
  if (n > 0) bus.emit('grid');
  return n;
}
