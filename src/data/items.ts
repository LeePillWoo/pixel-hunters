export type Line = 'herb' | 'bone' | 'hide' | 'ore' | 'feather';

export interface ItemDef {
  id: string;
  name: string;
  frame: number; // index into items.png (see tools/gen_placeholder_art.py)
  sell: number;
  kind: 'mat' | 'boss' | 'fusion';
  line?: Line;
  tier?: number;
}

export const LINES: Line[] = ['herb', 'bone', 'hide', 'ore', 'feather'];
export const LINE_NAME: Record<Line, string> = { herb: '약초', bone: '뼈', hide: '가죽', ore: '광석', feather: '깃털' };
export const MAX_TIER = 4;

const MAT_NAMES: Record<Line, string[]> = {
  herb: ['풀잎', '약초 다발', '회복 포션', '고급 포션'],
  bone: ['뼈조각', '큰 뼈', '고대 해골', '용골'],
  hide: ['가죽 조각', '질긴 가죽', '두꺼운 가죽', '명품 가죽'],
  ore: ['돌멩이', '구리 광석', '푸른 수정', '빛나는 수정'],
  feather: ['깃털', '황금 깃털', '무지개 깃털', '불사조 깃털'],
};
const TIER_SELL = [2, 5, 12, 30];

export const ITEMS: Record<string, ItemDef> = {};
LINES.forEach((line, li) => {
  MAT_NAMES[line].forEach((name, ti) => {
    const id = `${line}${ti + 1}`;
    ITEMS[id] = { id, name, frame: li * 4 + ti, sell: TIER_SELL[ti], kind: 'mat', line, tier: ti + 1 };
  });
});

const EXTRA: ItemDef[] = [
  { id: 'horn', name: '녹룡의 뿔', frame: 20, sell: 150, kind: 'boss' },
  { id: 'claw', name: '녹룡의 발톱', frame: 21, sell: 150, kind: 'boss' },
  { id: 'shell', name: '녹룡의 갑각', frame: 22, sell: 150, kind: 'boss' },
  { id: 'pick', name: '뼈 곡괭이', frame: 24, sell: 60, kind: 'fusion' },
  { id: 'cloth', name: '바람 망토 천', frame: 25, sell: 80, kind: 'fusion' },
  { id: 'elixir', name: '마력 엘릭서', frame: 26, sell: 120, kind: 'fusion' },
];
EXTRA.forEach((d) => (ITEMS[d.id] = d));

/** Same item + same tier -> next tier. Null when it cannot be merged further. */
export function nextTier(id: string): string | null {
  const d = ITEMS[id];
  if (!d || d.kind !== 'mat' || !d.line || !d.tier || d.tier >= MAX_TIER) return null;
  return `${d.line}${d.tier + 1}`;
}

/** Secret fusions: two different items -> special item. */
export const FUSIONS: { a: string; b: string; result: string }[] = [
  { a: 'bone2', b: 'ore2', result: 'pick' },
  { a: 'hide2', b: 'feather2', result: 'cloth' },
  { a: 'herb3', b: 'ore3', result: 'elixir' },
];
export const FUSION_FIRST_REWARD = 100;

/** Gold for adding an item to the codex for the first time. */
export function discoverReward(id: string): number {
  const d = ITEMS[id];
  if (!d) return 0;
  if (d.kind === 'fusion') return FUSION_FIRST_REWARD;
  if (d.kind === 'boss') return 50;
  return d.tier && d.tier >= 2 ? d.sell * 3 : 0;
}

export function fusionOf(a: string, b: string): string | null {
  const f = FUSIONS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  return f ? f.result : null;
}
