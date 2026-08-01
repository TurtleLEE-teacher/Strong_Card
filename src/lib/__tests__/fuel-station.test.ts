/**
 * 주유소 가맹점 판별.
 *
 * 주유소는 대부분 개인 사업자라 **간판 브랜드(폴)와 상호가 다르다.**
 * '판교서일주유소'는 GS칼텍스 폴이지만 이름 어디에도 GS가 없다.
 *
 * 그래서 두 층으로 나눠 본다.
 *   1) 업종은 이름으로 안다        → FUEL_UNBRANDED (정유사 무관 혜택용)
 *   2) 정유사는 이름으로 못 안다   → MERCHANT_BRAND_OVERRIDES에 사용자가 적는다
 *
 * 추측으로 정유사를 붙이면 S-OIL 주유소에 탄탄대로 할인이 붙어 과다 계상되고,
 * 아무것도 안 하면 GS 주유소인데 매달 조용히 할인을 놓친다.
 */

import { describe, expect, it } from 'vitest';
import {
  BRAND_ALIASES,
  MERCHANT_BRAND_OVERRIDES,
  resolveBrand,
} from '@/config/merchants';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { judgeTransaction } from '@/lib/engine/performance';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(
  title: string,
  krwAmount: number,
  day: string,
  cardId: CardId,
  last4: string,
): Transaction {
  seq += 1;
  return {
    id: `fuel-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(`${day}T03:00:00Z`).toISOString(),
    issuer: null,
    last4,
    cardId,
    category: null,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

describe('상호에 브랜드가 없는 주유소', () => {
  it('폴을 아는 주유소는 그 정유사로 잡는다', () => {
    expect(resolveBrand('판교서일주유소')).toBe('GS_CALTEX');
    expect(resolveBrand('서일주유소')).toBe('GS_CALTEX');
    // 지점 표기가 붙어도 접두일치로 따라온다
    expect(resolveBrand('서일주유소 판교점')).toBe('GS_CALTEX');
  });

  it('모르는 주유소는 업종까지만 잡는다 (정유사를 찍지 않는다)', () => {
    expect(resolveBrand('동서울주유소')).toBe('FUEL_UNBRANDED');
    expect(resolveBrand('제일셀프주유')).toBe('FUEL_UNBRANDED');
  });

  it('이름에 정유사가 있으면 업종 폴백보다 그쪽이 이긴다', () => {
    expect(resolveBrand('SK에너지 셀프주유소')).toBe('SK_ENERGY');
    expect(resolveBrand('판교GS칼텍스주유소')).toBe('GS_CALTEX');
    expect(resolveBrand('알뜰주유소')).toBe('ALTTEUL');
  });

  it('지정한 브랜드 키가 실제로 사전에 있다 (오타 방지)', () => {
    for (const brand of Object.values(MERCHANT_BRAND_OVERRIDES)) {
      expect(BRAND_ALIASES[brand]).toBeDefined();
    }
  });
});

describe('주유 결제와 혜택·실적', () => {
  it('탄탄대로: 폴을 아는 GS 주유소는 주유 할인을 받는다', () => {
    const snap = buildSnapshot(
      CARDS_BY_ID['kb-tantandaero'],
      [
        tx('아무데나', 900_000, '2026-06-15', 'kb-tantandaero', '6089'), // 지난달 → 80만 구간
        tx('판교서일주유소', 70_000, '2026-07-09', 'kb-tantandaero', '6089'),
      ],
      '2026-07',
    );
    const fuel = snap.appliedBenefits.find((b) => b.ruleId === 'tt-daily-fuel');
    expect(fuel?.netAmount).toBeGreaterThan(0);
  });

  it('탄탄대로: 정유사를 모르는 주유소에는 할인을 붙이지 않는다', () => {
    // 약관이 SK·GS만 열거한다. 업종만 보고 붙이면 S-OIL 주유소까지 할인이
    // 붙어 실제로는 받지 못할 금액을 받은 것처럼 보여 준다.
    const snap = buildSnapshot(
      CARDS_BY_ID['kb-tantandaero'],
      [
        tx('아무데나', 900_000, '2026-06-15', 'kb-tantandaero', '6089'),
        tx('동서울주유소', 70_000, '2026-07-09', 'kb-tantandaero', '6089'),
      ],
      '2026-07',
    );
    expect(snap.appliedBenefits.find((b) => b.ruleId === 'tt-daily-fuel')).toBeUndefined();
  });

  it('ZERO Edition2: 정유사를 몰라도 생활 필수 적립은 받는다', () => {
    // 이 카드는 주유를 **업종**으로 본다. 브랜드를 모른다는 이유로 1%
    // 기본 적립으로 떨어뜨리면 매 주유마다 1.5%p씩 조용히 샌다.
    const snap = buildSnapshot(
      CARDS_BY_ID['hyundai-zero-ed2'],
      [tx('동서울주유소', 70_000, '2026-07-09', 'hyundai-zero-ed2', '7316')],
      '2026-07',
    );
    const earned = snap.appliedBenefits.find((b) => b.ruleId === 'zero-essential');
    expect(earned?.netAmount).toBe(1_750); // 70,000 × 2.5%
  });

  it('주유 결제는 브랜드를 못 알아봐도 실적에는 그대로 들어간다', () => {
    // 미분류는 **혜택 판정**에서만 빠진다. 실적까지 빠진다고 오해하기 쉬운
    // 자리라 못을 박아 둔다.
    const unknown = tx('동서울주유소', 70_000, '2026-07-09', 'kb-tantandaero', '6089');
    for (const card of Object.values(CARDS_BY_ID)) {
      expect(judgeTransaction(card, unknown)).toBe('인정');
    }

    const snap = buildSnapshot(
      CARDS_BY_ID['kb-tantandaero'],
      [
        tx('아무데나', 900_000, '2026-06-15', 'kb-tantandaero', '6089'),
        unknown,
      ],
      '2026-07',
    );
    expect(snap.currentSpend).toBe(70_000);
    expect(snap.excludedSpend).toBe(0);
  });
});
