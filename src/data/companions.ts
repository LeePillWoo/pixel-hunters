import type { Line } from './items';

export interface CompanionDef {
  id: string;
  name: string;
  sprite: number; // index into companions.png (2 frames each)
  lines: Line[]; // +50% production on these lines
}

export const COMPANIONS: CompanionDef[] = [
  { id: 'apprentice', name: '견습 헌터', sprite: 0, lines: [] },
  { id: 'cat', name: '냥냥 채집꾼', sprite: 1, lines: ['herb'] },
  { id: 'dog', name: '강아지 광부', sprite: 2, lines: ['ore'] },
  { id: 'veteran', name: '노련한 사냥꾼', sprite: 3, lines: ['bone', 'hide'] },
];
export const companionDef = (id: string) => COMPANIONS.find((c) => c.id === id)!;
export const SPECIALTY_BONUS = 1.5;
export const COMP_LV_BONUS = 0.1; // production per level
export const COMP_MAX_LV = 10;
export const compLvCost = (lv: number) => Math.round(30 * Math.pow(1.45, lv));

export interface QuestDef {
  id: string;
  title: string;
  need: { id: string; n: number }[];
  gold: number;
  companion?: string;
}

/** Story orders, given one at a time. Each one brings a new companion. */
export const STORY_QUESTS: QuestDef[] = [
  { id: 'q1', title: '고양이의 부탁', need: [{ id: 'herb2', n: 2 }], gold: 40, companion: 'cat' },
  { id: 'q2', title: '광부의 도시락', need: [{ id: 'bone2', n: 2 }, { id: 'herb2', n: 2 }], gold: 80, companion: 'dog' },
  { id: 'q3', title: '사냥꾼의 장비', need: [{ id: 'hide3', n: 1 }, { id: 'ore2', n: 2 }], gold: 160, companion: 'veteran' },
];
