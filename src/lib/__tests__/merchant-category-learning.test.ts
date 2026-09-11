/**
 * 노션 `카테고리` 학습.
 *
 * 문자 → 노션 자동화는 카테고리를 안 채운다. 업종 기준 혜택(신한 음식점
 * 10%, 탄탄대로 미용 20%)은 카테고리 폴백이 유일한 길인데, 그 길이 한 번도
 * 안 열린 채 담솥 42,000원이 점심시간에 '대상 가맹점 아님'으로 떨어졌다.
 * 한 행에 적은 카테고리가 같은 가게의 다른 달 거래에도 따라붙어야 한다.
 */

import { describe, expect, it } from 'vitest';
import { applyMerchantCategories } from '@/lib/notion/transactions';
import { normalizeMerchant } from '@/config/merchants';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import type { Transaction, TxCategory } from '@/lib/types';

let seq = 0;
function tx(title: string, krwAmount: number, isoUtc: string, category: TxCategory | null = null): Transaction {
  seq += 1;
  return {
    id: `cat-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: isoUtc,
    issuer: '신한',
    last4: '6359',
    cardId: 'shinhan-discount-plan',
    category,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

const learned = new Map<string, TxCategory>([[normalizeMerchant('담솥 판교아브뉴프랑점'), '식비']]);

describe('applyMerchantCategories', () => {
  it('비어 있는 카테고리만 채운다', () => {
    const [a] = applyMerchantCategories([tx('담솥 판교아브뉴프랑점', 42_000, '2026-09-05T03:13:00Z')], learned);
    expect(a.category).toBe('식비');
  });

  it('행에 직접 적힌 값은 덮지 않는다', () => {
    const [a] = applyMerchantCategories(
      [tx('담솥 판교아브뉴프랑점', 42_000, '2026-09-05T03:13:00Z', '기타')],
      learned,
    );
    expect(a.category).toBe('기타');
  });

  it('지점 구분자·공백이 달라도 같은 가게로 본다', () => {
    const [a] = applyMerchantCategories([tx('담솥*판교아브뉴프랑점', 42_000, '2026-09-05T03:13:00Z')], learned);
    expect(a.category).toBe('식비');
  });

  it('사전이 비면 그대로 돌려준다', () => {
    const input = [tx('담솥 판교아브뉴프랑점', 42_000, '2026-09-05T03:13:00Z')];
    expect(applyMerchantCategories(input, new Map())).toBe(input);
  });
});

describe('학습된 카테고리로 업종 혜택이 열린다', () => {
  it('담솥 42,000원(12:13 KST, 120만 구간) → 음식점 10% 1,000원', () => {
    const dp = CARDS_BY_ID['shinhan-discount-plan'];
    const lunch = tx('담솥 판교아브뉴프랑점', 42_000, '2026-09-05T03:13:00Z');
    const prev = tx('아무데나', 1_500_000, '2026-08-15T03:00:00Z');

    // 학습 전: 대상 가맹점 아님
    const before = buildSnapshot(dp, [prev, lunch], '2026-09');
    expect(before.noBenefit[lunch.id]?.reason).toBe('대상 가맹점 아님');

    // 학습 후: 이용금액 1만원 상한 × 10%
    const after = buildSnapshot(dp, applyMerchantCategories([prev, lunch], learned), '2026-09');
    const applied = after.appliedBenefits.find((b) => b.transactionId === lunch.id);
    expect(applied?.ruleId).toBe('dp-time-restaurant');
    expect(applied?.netAmount).toBe(1_000);
  });
});
