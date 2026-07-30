import type { Card, CardId } from '@/lib/types';
import { KB_TANTANDAERO } from './kb-tantandaero';
import { KB_COUPANG_WOW } from './kb-coupang-wow';
import { SAMSUNG_AMEX_BLUE } from './samsung-amex-blue';
import { HYUNDAI_ZERO_ED2 } from './hyundai-zero-ed2';
import { SHINHAN_DISCOUNT_PLAN } from './shinhan-discount-plan';
import { SHINHAN_EV } from './shinhan-ev';

export const CARDS: Card[] = [
  KB_TANTANDAERO,
  KB_COUPANG_WOW,
  SAMSUNG_AMEX_BLUE,
  HYUNDAI_ZERO_ED2,
  SHINHAN_DISCOUNT_PLAN,
  SHINHAN_EV,
];

export const CARDS_BY_ID: Record<CardId, Card> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
) as Record<CardId, Card>;

/** 카드 뒤 4자리 → 카드 상품. 이 매핑이 앱 전체의 축이다. */
export const LAST4_TO_CARD_ID: Record<string, CardId> = (() => {
  const map: Record<string, CardId> = {};
  for (const card of CARDS) {
    for (const last4 of card.last4) {
      if (map[last4]) {
        throw new Error(
          `카드 뒷4자리 중복: ${last4} (${map[last4]} vs ${card.id}). ` +
            '두 카드가 같은 4자리를 쓰면 구분이 불가능하다.',
        );
      }
      map[last4] = card.id;
    }
  }
  return map;
})();

/** Notion `카드 상품` select 옵션명 → 카드 상품 */
export const NOTION_OPTION_TO_CARD_ID: Record<string, CardId> = Object.fromEntries(
  CARDS.map((c) => [c.notionOption, c.id]),
);

export function getCard(id: CardId): Card {
  return CARDS_BY_ID[id];
}

export function resolveCardIdByLast4(last4: string | null | undefined): CardId | null {
  if (!last4) return null;
  return LAST4_TO_CARD_ID[last4] ?? null;
}

export const ACTIVE_CARDS = CARDS.filter((c) => c.active);
