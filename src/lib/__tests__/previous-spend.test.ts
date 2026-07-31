/**
 * 전월실적의 출처 구분.
 *
 * 이 앱의 모든 혜택 숫자는 전월실적이 정한 구간에 매달려 있다. 그런데
 * Notion에 지난달 거래가 없으면 실적을 **계산할 수 없다**. 그 상태를
 * '실적 0원 = 미달'로 취급하면 화면이 통째로 거짓말을 한다 — 실제 카드는
 * 멀쩡히 할인을 주고 있는데 앱은 혜택이 없다고 한다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildAllSnapshots, buildSnapshot } from '@/lib/engine/snapshot';
import { ACTIVE_CARDS } from '@/config/cards';
import { knownSpendFor, KNOWN_MONTHLY_SPEND } from '@/config/manual-spend';
import type { Transaction } from '@/lib/types';

const dp = CARDS_BY_ID['shinhan-discount-plan'];

let seq = 0;
function tx(title: string, krwAmount: number, day: string): Transaction {
  seq += 1;
  return {
    id: `p-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(`${day}T05:00:00Z`).toISOString(), // 14시 KST
    issuer: '신한',
    last4: '6359',
    cardId: 'shinhan-discount-plan',
    category: null,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

describe('전월실적 출처', () => {
  it('지난달 거래가 없으면 unknown — 미달이라고 단정하지 않는다', () => {
    const snap = buildSnapshot(dp, [tx('무신사', 100_000, '2026-07-10')], '2026-07');
    expect(snap.previousSpendSource).toBe('unknown');
  });

  it('지난달 거래가 있으면 computed', () => {
    const snap = buildSnapshot(
      dp,
      [tx('아무데나', 500_000, '2026-06-10'), tx('무신사', 100_000, '2026-07-10')],
      '2026-07',
    );
    expect(snap.previousSpendSource).toBe('computed');
    expect(snap.previousSpend).toBe(500_000);
  });

  it('수동 입력이 있으면 계산값보다 우선한다', () => {
    const snap = buildSnapshot(
      dp,
      [tx('아무데나', 500_000, '2026-06-10')],
      '2026-07',
      { manualPreviousSpend: 900_000 },
    );
    expect(snap.previousSpendSource).toBe('manual');
    expect(snap.previousSpend).toBe(900_000);
    // 90만 → 80만 구간
    expect(snap.appliedTier?.threshold).toBe(800_000);
  });
});

describe('무신사 결제가 실제로 할인을 받는다', () => {
  const musinsa = tx('무신사', 100_000, '2026-07-10');

  it('전월실적을 알면 온라인쇼핑 10%가 붙는다', () => {
    const snap = buildSnapshot(dp, [musinsa], '2026-07', {
      manualPreviousSpend: 500_000, // 40만 구간
    });
    const online = snap.benefitUsage.find((u) => u.capGroup === 'dp-daily')!;
    // Daily Plan 한도 10,000. 10만 × 10% = 10,000이지만 이용금액 5만 상한 →
    // 5만 × 10% = 5,000
    expect(online.used).toBe(5_000);
    expect(snap.totalBenefitUsed).toBe(5_000);
  });

  it('전월실적을 모르면 0원이지만, 그 이유가 화면에 남는다', () => {
    const snap = buildSnapshot(dp, [musinsa], '2026-07');
    expect(snap.totalBenefitUsed).toBe(0);
    // 0원인 이유가 '미달'이 아니라 '모름'임을 화면이 구분할 수 있어야 한다
    expect(snap.previousSpendSource).toBe('unknown');
    // 영역 목록은 비지 않는다 — 무슨 혜택이 있는지는 보여야 한다
    expect(snap.benefitUsage.length).toBeGreaterThan(0);
  });

  it('구간이 오르면 한도도 오른다', () => {
    const at120 = buildSnapshot(dp, [musinsa], '2026-07', {
      manualPreviousSpend: 1_300_000,
    });
    expect(at120.benefitUsage.find((u) => u.capGroup === 'dp-daily')!.cap).toBe(30_000);
  });
});


/**
 * 2026-07 실적을 코드에 박아 뒀다. 8월 화면이 그걸 집어 가야 한다.
 *
 * 이게 이 표의 존재 이유다 — 8월 1일에 손대지 않아도 구간이 맞물려야 한다.
 */
describe('박아 둔 7월 실적이 8월 구간을 정한다', () => {
  const july = KNOWN_MONTHLY_SPEND['2026-07']!;

  it('7월 값이 실제로 들어 있다', () => {
    expect(july['shinhan-discount-plan']).toBe(2_677_344);
    expect(july['kb-tantandaero']).toBe(1_962_580);
    expect(july['samsung-amex-blue']).toBe(704_385);
  });

  it('8월 화면은 거래가 하나도 없어도 최고 구간을 적용한다', () => {
    const snaps = buildAllSnapshots(ACTIVE_CARDS, [], '2026-08', knownSpendFor);
    const by = (id: string) => snaps.find((s) => s.cardId === id)!;

    // Discount Plan 267만 → 120만 구간 (최고)
    expect(by('shinhan-discount-plan').previousSpendSource).toBe('manual');
    expect(by('shinhan-discount-plan').appliedTier?.threshold).toBe(1_200_000);

    // 탄탄대로 196만 → 80만 구간 (최고)
    expect(by('kb-tantandaero').appliedTier?.threshold).toBe(800_000);

    // Amex Blue 70만 → 30만 구간 (최고)
    expect(by('samsung-amex-blue').appliedTier?.threshold).toBe(300_000);
  });

  it('8월에는 혜택 한도가 실제로 열린다', () => {
    const snaps = buildAllSnapshots(ACTIVE_CARDS, [], '2026-08', knownSpendFor);
    const dpUsage = snaps.find((s) => s.cardId === 'shinhan-discount-plan')!.benefitUsage;
    // 120만 구간: Daily Plan 30,000 / Time Plan 15,000
    expect(dpUsage.find((u) => u.capGroup === 'dp-daily')?.cap).toBe(30_000);
    expect(dpUsage.find((u) => u.capGroup === 'dp-time')?.cap).toBe(15_000);
    // 잠긴 영역이 하나도 없어야 한다
    expect(dpUsage.filter((u) => u.cap === 0)).toHaveLength(0);
  });

  it('7월 화면은 여전히 6월을 모른다 (7월 값을 6월로 오해하지 않는다)', () => {
    // 이게 월을 못 박은 이유다. '전월실적'으로 받았다면 7월 화면이
    // 7월 값을 6월 실적으로 읽어 구간을 잘못 올렸을 것이다.
    const snaps = buildAllSnapshots(ACTIVE_CARDS, [], '2026-07', knownSpendFor);
    const dp = snaps.find((s) => s.cardId === 'shinhan-discount-plan')!;
    expect(dp.previousSpendSource).toBe('unknown');
    expect(dp.appliedTier?.threshold).toBe(0);
  });

  it('9월은 박아 둔 값이 없어 Notion 계산값으로 돌아간다', () => {
    // 8월 거래가 Notion에 쌓이면 자연히 계산된다. 표를 매달 갱신할 필요가 없다.
    expect(knownSpendFor('2026-08', 'shinhan-discount-plan')).toBeUndefined();
  });
});
