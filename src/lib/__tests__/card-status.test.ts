/**
 * 카드 정렬과 '다 받음' 판정.
 *
 * 가장 위험한 오판은 **실적 미달 카드에 '다 받음'이 붙는 것**이다. 한도가
 * 0원인 영역은 "0원 중 0원을 썼다"가 늘 성립하므로, 순진하게 비율만 보면
 * 혜택을 한 푼도 못 받는 카드가 정확히 반대 뜻의 스티커를 달게 된다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import {
  byBenefitDesc,
  exhaustedAreaCount,
  isFullyEarned,
  openUsage,
  remainingBenefit,
} from '@/lib/card-status';
import type { BenefitUsage, CardId, CardMonthlySnapshot, Transaction } from '@/lib/types';

/** 판정에 필요한 두 값만 진짜로 채운 스냅샷 */
function snapshotWith(
  cardId: CardId,
  totalBenefitUsed: number,
  usage: Pick<BenefitUsage, 'used' | 'cap' | 'ratio'>[],
): CardMonthlySnapshot {
  return {
    cardId,
    month: '2026-07',
    currentSpend: 0,
    excludedSpend: 0,
    exclusions: [],
    performanceVerdicts: {},
    reachedTier: null,
    nextTier: null,
    remainingToNextTier: 0,
    issuerReportedSpend: null,
    reconciliationDelta: null,
    previousSpend: 0,
    previousSpendSource: 'computed',
    appliedTier: null,
    benefitUsage: usage.map((u, i) => ({
      ruleId: `r${i}`,
      label: `영역 ${i}`,
      type: 'discount',
      txCount: 0,
      ...u,
    })),
    appliedBenefits: [],
    totalBenefitUsed,
    totalBenefitCap: null,
    ruleCounts: {},
    noBenefit: {},
    unmatchedTransactionIds: [],
    transactionCount: 0,
  };
}

describe('혜택 많은 순으로 세운다', () => {
  it('금액 내림차순', () => {
    const ordered = byBenefitDesc([
      snapshotWith('kb-tantandaero', 1_000, []),
      snapshotWith('shinhan-ev', 30_000, []),
      snapshotWith('samsung-amex-blue', 12_000, []),
    ]);
    expect(ordered.map((s) => s.totalBenefitUsed)).toEqual([30_000, 12_000, 1_000]);
  });

  it('동점이면 받은 순서를 유지한다', () => {
    /*
     * 0원인 카드가 매달, 심지어 새로고침마다 자리를 바꾸면 카드를 위치로
     * 기억할 수 없다. 정렬 기준이 없는 구간에서는 등록 순서가 남아야 한다.
     */
    const ordered = byBenefitDesc([
      snapshotWith('kb-tantandaero', 0, []),
      snapshotWith('kb-coupang-wow', 0, []),
      snapshotWith('shinhan-ev', 0, []),
    ]);
    expect(ordered.map((s) => s.cardId)).toEqual([
      'kb-tantandaero',
      'kb-coupang-wow',
      'shinhan-ev',
    ]);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const input = [
      snapshotWith('kb-tantandaero', 1_000, []),
      snapshotWith('shinhan-ev', 30_000, []),
    ];
    byBenefitDesc(input);
    expect(input.map((s) => s.totalBenefitUsed)).toEqual([1_000, 30_000]);
  });
});

describe("'다 받음' 판정", () => {
  it('한도 있는 영역을 전부 채우면 다 받은 것이다', () => {
    const s = snapshotWith('kb-tantandaero', 25_000, [
      { used: 15_000, cap: 15_000, ratio: 1 },
      { used: 10_000, cap: 10_000, ratio: 1 },
    ]);
    expect(isFullyEarned(s)).toBe(true);
    expect(remainingBenefit(s)).toBe(0);
    expect(exhaustedAreaCount(s)).toBe(2);
  });

  it('한 영역이라도 남으면 아니다', () => {
    const s = snapshotWith('kb-tantandaero', 20_000, [
      { used: 15_000, cap: 15_000, ratio: 1 },
      { used: 5_000, cap: 10_000, ratio: 0.5 },
    ]);
    expect(isFullyEarned(s)).toBe(false);
    expect(remainingBenefit(s)).toBe(5_000);
    expect(exhaustedAreaCount(s)).toBe(1);
  });

  it('실적 미달로 한도가 0인 카드에는 붙지 않는다', () => {
    /*
     * 이게 이 판정의 존재 이유다. 한도 0원짜리 영역만 남은 카드는 혜택을
     * 한 푼도 못 받고 있는데, 비율로만 보면 전부 '100% 소진'이라 다 받은
     * 것처럼 보인다. 정확히 반대말이 화면에 뜬다.
     */
    const s = snapshotWith('kb-tantandaero', 0, [
      { used: 0, cap: 0, ratio: 0 },
      { used: 0, cap: 0, ratio: 0 },
    ]);
    expect(openUsage(s)).toHaveLength(0);
    expect(isFullyEarned(s)).toBe(false);
    expect(remainingBenefit(s)).toBe(0);
  });

  it('한도가 아예 없는 카드에도 붙지 않는다', () => {
    // ZERO Ed2처럼 무제한 적립인 카드는 '다 받는' 순간이 영영 오지 않는다.
    const s = snapshotWith('hyundai-zero-ed2', 8_000, [{ used: 8_000, cap: null, ratio: null }]);
    expect(isFullyEarned(s)).toBe(false);
  });

  it('영역이 하나도 없으면 붙지 않는다', () => {
    expect(isFullyEarned(snapshotWith('shinhan-ev', 0, []))).toBe(false);
  });
});

describe('실제 스냅샷으로도 같은 답을 낸다', () => {
  const card = CARDS_BY_ID['kb-tantandaero'];

  let seq = 0;
  function tx(title: string, krwAmount: number, day: string): Transaction {
    seq += 1;
    return {
      id: `cs-${seq}`,
      title,
      merchant: title,
      rawAmount: krwAmount,
      currency: 'KRW',
      krwAmount,
      approvedAt: new Date(`${day}T03:00:00Z`).toISOString(),
      issuer: '국민',
      last4: '6089',
      cardId: 'kb-tantandaero',
      category: null,
      paymentKind: '일시불',
      installmentMonths: null,
      canceled: false,
      rawMessage: null,
      issuerCumulative: null,
      alertStatus: null,
    };
  }

  it('지난달 거래가 없어 구간을 모르는 카드는 다 받은 것이 아니다', () => {
    // 이때 모든 영역 한도가 0으로 계산된다 — 실적이 0이라서가 아니라
    // 모르기 때문인데, 화면이 '다 받음'이라고 하면 거짓말이 두 겹이 된다.
    const snap = buildSnapshot(card, [tx('이마트 성수점', 100_000, '2026-07-03')], '2026-07');
    expect(snap.previousSpendSource).toBe('unknown');
    expect(isFullyEarned(snap)).toBe(false);
  });

  it('실적을 채운 달에는 남은 한도가 잡힌다', () => {
    const snap = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'), // 지난달 → 80만 구간
        tx('이마트 성수점', 100_000, '2026-07-03'), // 5% = 5,000 / 한도 15,000
      ],
      '2026-07',
    );
    expect(isFullyEarned(snap)).toBe(false);
    expect(remainingBenefit(snap)).toBeGreaterThan(0);
    // 한도가 열린 영역이 실제로 있다 — 위 판정이 '영역 없음'으로 통과한 게 아니다
    expect(openUsage(snap).length).toBeGreaterThan(0);
  });
});
