/**
 * 네플스 결제 방식별 신한 Discount Plan 판정 (2026-11-02 실측, 11/5 결제예정금액 확인).
 *
 *   카드 간편결제(네이버페이) → 문자 '네이버페이'         → 할인 없음 (약관: 간편결제명 제외)
 *   일반결제 > 신용카드       → 문자 '네이버파이낸셜(주)' → 온라인쇼핑 10%
 *
 * '네이버파이낸셜'은 브랜드 사전에서 NAVERPAY 로 잡힌다. Amex Blue 간편결제 적립이
 * 그 브랜드를 쓰므로 Discount Plan 쪽은 룰 키워드로만 붙였다. 그래서 Amex Blue
 * 판정은 바뀌지 않아야 한다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { resolveBrand } from '@/config/merchants';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(
  title: string,
  krwAmount: number,
  cardId: CardId,
  dayOfMonth = 2,
  kstHour = 19,
): Transaction {
  seq += 1;
  return {
    id: `nf-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(2026, 10, dayOfMonth, kstHour - 9, 0, 0)).toISOString(),
    issuer: null,
    last4: null,
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

const DP = 'shinhan-discount-plan' as CardId;
const AB = 'samsung-amex-blue' as CardId;
const dp = CARDS_BY_ID[DP];
const ab = CARDS_BY_ID[AB];

/** 10월 실적 200만원 — 120만 구간 (Daily 30,000) */
const prevMonth = (cardId: CardId): Transaction => ({
  ...tx('아무데나', 2_000_000, cardId),
  approvedAt: '2026-10-05T03:00:00.000Z',
});

const net = (snap: ReturnType<typeof buildSnapshot>, id: string) =>
  snap.appliedBenefits.find((b) => b.transactionId === id)?.netAmount ?? 0;

describe('Discount Plan 온라인쇼핑: 네플스는 일반결제만 받는다', () => {
  it('일반결제(네이버파이낸셜) 56,610원 → 5만원 × 10% = 5,000원', () => {
    const naver = tx('네이버파이낸셜(주)', 56_610, DP);
    const snap = buildSnapshot(dp, [prevMonth(DP), naver], '2026-11');
    expect(net(snap, naver.id)).toBe(5_000);
  });

  it('카드 간편결제(네이버페이)는 지금처럼 0원이다', () => {
    const naverPay = tx('네이버페이', 56_310, DP);
    const snap = buildSnapshot(dp, [prevMonth(DP), naverPay], '2026-11');
    expect(net(snap, naverPay.id)).toBe(0);
  });

  it('같은 이름의 멤버십 요금(4,900원 · 46,800원)은 온라인쇼핑으로 잡지 않는다', () => {
    const monthly = tx('네이버파이낸셜(주)', 4_900, DP, 3);
    const yearly = tx('네이버파이낸셜(주)', 46_800, DP, 4);
    const snap = buildSnapshot(dp, [prevMonth(DP), monthly, yearly], '2026-11');
    expect(net(snap, monthly.id)).toBe(0);
    expect(net(snap, yearly.id)).toBe(0);
  });

  it('금액 제외는 네이버파이낸셜에만 걸린다 (쿠팡 4,900원은 그대로)', () => {
    const coupang = tx('쿠팡', 4_900, DP, 3);
    const snap = buildSnapshot(dp, [prevMonth(DP), coupang], '2026-11');
    expect(net(snap, coupang.id)).toBe(490);
  });

  it('쿠팡과 같은 온라인쇼핑 영역이라 하루 1회를 같이 쓴다', () => {
    const coupang = tx('쿠팡', 30_000, DP, 5, 10);
    const naver = tx('네이버파이낸셜(주)', 30_000, DP, 5, 15);
    const snap = buildSnapshot(dp, [prevMonth(DP), coupang, naver], '2026-11');
    expect(net(snap, coupang.id)).toBe(3_000);
    expect(net(snap, naver.id)).toBe(0);
    expect(snap.noBenefit[naver.id]?.reason).toBe('횟수 초과');
  });
});

describe('Amex Blue 간편결제 적립은 바뀌지 않는다', () => {
  it('네이버파이낸셜은 여전히 NAVERPAY 브랜드다', () => {
    expect(resolveBrand('네이버파이낸셜(주)')).toBe('NAVERPAY');
    expect(resolveBrand('네이버페이')).toBe('NAVERPAY');
  });

  it('네이버파이낸셜 · 네이버페이 모두 쇼핑 1.5% 적립을 받는다', () => {
    const general = tx('네이버파이낸셜(주)', 56_610, AB);
    const easyPay = tx('네이버페이', 56_000, AB, 3);
    const snap = buildSnapshot(ab, [prevMonth(AB), general, easyPay], '2026-11');
    expect(net(snap, general.id)).toBe(849);
    expect(net(snap, easyPay.id)).toBe(840);
  });
});
