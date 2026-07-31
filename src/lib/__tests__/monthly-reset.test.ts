/**
 * 매월 1일 초기화.
 *
 * 카드사 한도는 매월 1일 00:00(KST)에 리셋된다. 이월되지 않는다.
 * 이게 어긋나면 지난달 소진액이 이번 달 바에 남아 "이미 다 썼다"고
 * 거짓말을 하거나, 반대로 이번 달 거래가 지난달로 새어 나간다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { daysRemainingInMonth, monthRangeUtc, toMonthKey } from '@/lib/date';
import type { Transaction } from '@/lib/types';

const card = CARDS_BY_ID['kb-tantandaero'];

let seq = 0;
/** KST 시각을 지정해 거래를 만든다 */
function txKst(title: string, krwAmount: number, kstIso: string): Transaction {
  seq += 1;
  const [d, t = '12:00'] = kstIso.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return {
    id: `m-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(y, mo - 1, da, h - 9, mi, 0)).toISOString(),
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

describe('월 경계는 KST 기준이다', () => {
  it('1일 00:00 KST는 새 달에 속한다', () => {
    // 2026-07-01 00:00 KST = 2026-06-30 15:00 UTC
    const tx = txKst('경계', 10_000, '2026-07-01 00:00');
    expect(tx.approvedAt).toBe('2026-06-30T15:00:00.000Z');
    expect(toMonthKey(tx.approvedAt)).toBe('2026-07');
  });

  it('말일 23:59 KST는 아직 지난 달이다', () => {
    const tx = txKst('경계', 10_000, '2026-06-30 23:59');
    expect(toMonthKey(tx.approvedAt)).toBe('2026-06');
  });

  it('월 범위가 KST 1일 00:00 ~ 말일 24:00을 덮는다', () => {
    const { startUtc, endUtc } = monthRangeUtc('2026-07');
    expect(startUtc.toISOString()).toBe('2026-06-30T15:00:00.000Z'); // 7/1 00:00 KST
    expect(endUtc.toISOString()).toBe('2026-07-31T15:00:00.000Z'); // 8/1 00:00 KST
  });
});

describe('한도는 매월 1일에 초기화된다', () => {
  // 6월에 한도를 다 쓰고, 7월 1일에 다시 쓴다.
  const transactions = [
    txKst('아무데나', 900_000, '2026-05-15'), // 6월 구간 확보
    txKst('아무데나', 900_000, '2026-06-15'), // 7월 구간 확보
    txKst('롯데백화점', 300_000, '2026-06-20'), // 6월 백화점 한도 소진
    txKst('롯데백화점', 50_000, '2026-07-01 09:00'), // 7월 첫날 다시
  ];

  it('지난달 소진액이 이번 달로 넘어오지 않는다', () => {
    const june = buildSnapshot(card, transactions, '2026-06');
    const july = buildSnapshot(card, transactions, '2026-07');

    const area = (s: typeof june) =>
      s.benefitUsage.find((u) => u.ruleId === 'tt-daily-dept-cvs')!;

    // 6월: 30만 × 10% = 30,000 → 한도 15,000 소진
    expect(area(june).used).toBe(15_000);
    // 7월: 1일 결제 5만 × 10% = 5,000. 6월분이 섞이면 이 값이 아니다.
    expect(area(july).used).toBe(5_000);
  });

  it('실적도 달마다 따로 센다', () => {
    const june = buildSnapshot(card, transactions, '2026-06');
    const july = buildSnapshot(card, transactions, '2026-07');
    // 6월 실적에는 6월 거래만 (90만 + 30만)
    expect(june.currentSpend).toBe(1_200_000);
    // 7월 실적에는 7월 1일 거래만
    expect(july.currentSpend).toBe(50_000);
  });

  it('이번 달 혜택은 지난달 실적이 정한 구간을 쓴다', () => {
    const july = buildSnapshot(card, transactions, '2026-07');
    // 6월 실적 120만 → 80만 구간
    expect(july.appliedTier?.threshold).toBe(800_000);
  });
});

describe('남은 일수 계산', () => {
  it('1일이면 그 달 일수 - 1', () => {
    // 2026-07-01 12:00 KST → 7월은 31일이므로 30일 남음
    expect(daysRemainingInMonth(new Date('2026-07-01T03:00:00Z'))).toBe(30);
  });

  it('말일이면 0', () => {
    expect(daysRemainingInMonth(new Date('2026-07-31T03:00:00Z'))).toBe(0);
  });

  it('말일 23:00 KST에도 아직 0이다 (다음 달로 안 넘어간다)', () => {
    // 2026-07-31 23:00 KST = 2026-07-31 14:00 UTC
    expect(daysRemainingInMonth(new Date('2026-07-31T14:00:00Z'))).toBe(0);
  });
});
