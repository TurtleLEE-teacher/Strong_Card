/**
 * 신한 Discount Plan Time Plan — 음식점 영역의 경계.
 *
 * 이 영역은 브랜드 열거가 아니라 **업종 기준**이다(한식·일식·양식·중식·
 * 일반대중음식·패스트푸드·뷔페). 그래서 카드 룰이 카테고리('식비')를
 * 폴백으로 쓰는데, 그 폴백이 두 방향으로 새기 쉽다.
 *
 *   너무 좁다  브랜드 목록이 패스트푸드뿐이라 아웃백·빕스가 카테고리
 *              없이는 '대상 가맹점 아님'으로 떨어졌다
 *   너무 넓다  약관이 금지한 배달앱 주문까지 음식점 할인을 받았다
 *
 * 출처: 신한카드 Discount Plan 서비스 유의사항
 *   "배달앱으로 카페/음식점/편의점 주문 시에는 카페/음식점/편의점 할인이
 *    적용되지 않습니다"
 *   "카페 영역의 대상 가맹점이 음식점 업종에 해당할 경우 카페 할인이
 *    적용되며, 음식점 할인은 적용되지 않습니다"
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { resolveBrand } from '@/config/merchants';
import type { CardId, Transaction, TxCategory } from '@/lib/types';

let seq = 0;
function tx(
  title: string,
  krwAmount: number,
  kstHour: number,
  category: TxCategory | null = null,
): Transaction {
  seq += 1;
  return {
    id: `tpa-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(2026, 7, 5, kstHour - 9, 0, 0)).toISOString(),
    issuer: null,
    last4: null,
    cardId: 'shinhan-discount-plan' as CardId,
    category,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

const dp = CARDS_BY_ID['shinhan-discount-plan'];
const prevMonth = (): Transaction => ({
  ...tx('아무데나', 2_000_000, 12),
  approvedAt: '2026-07-05T03:00:00.000Z',
});

function applied(t: Transaction) {
  const snap = buildSnapshot(dp, [prevMonth(), t], '2026-08');
  return {
    net: snap.appliedBenefits.find((b) => b.transactionId === t.id)?.netAmount ?? 0,
    rule: snap.appliedBenefits.find((b) => b.transactionId === t.id)?.ruleId,
    reason: snap.noBenefit[t.id]?.reason,
  };
}

describe('배달앱 주문은 카페·음식점·편의점 할인 대상이 아니다', () => {
  it('낮에 배달의민족으로 주문해도 음식점 할인이 붙지 않는다', () => {
    // 배달앱 영역은 18~22시만 열린다. 낮 1시 주문은 배달앱 룰에서 떨어지는데,
    // 그때 음식점 룰이 카테고리 폴백으로 받아먹으면 안 된다.
    const t = tx('배달의민족', 30_000, 13, '식비');
    expect(applied(t).net).toBe(0);
  });

  it('요기요·쿠팡이츠·땡겨요도 마찬가지다', () => {
    for (const name of ['요기요', '쿠팡이츠', '땡겨요']) {
      expect(applied(tx(name, 30_000, 13, '식비')).net, name).toBe(0);
    }
  });

  it('저녁 시간대의 배달앱은 정상적으로 배달앱 할인을 받는다', () => {
    const t = tx('배달의민족', 30_000, 20, '식비');
    const r = applied(t);
    expect(r.rule).toBe('dp-time-delivery');
    expect(r.net).toBe(1_000); // 이용금액 1만원 상한 × 10%
  });
});

describe('패밀리레스토랑·뷔페는 음식점 업종이다', () => {
  it('아웃백은 카테고리가 없어도 가맹점명만으로 걸린다', () => {
    expect(resolveBrand('아웃백스테이크하우스 강남점')).toBe('OUTBACK');

    const t = tx('아웃백스테이크하우스 강남점', 80_000, 13);
    const r = applied(t);
    expect(r.rule).toBe('dp-time-restaurant');
    expect(r.net).toBe(1_000);
  });

  it('빕스·애슐리·매드포갈릭도 같다', () => {
    for (const name of ['빕스 목동', '애슐리퀸즈 강남', '매드포갈릭 여의도']) {
      expect(applied(tx(name, 50_000, 13)).rule, name).toBe('dp-time-restaurant');
    }
  });

  it('저녁에는 음식점 영역이 닫혀 있다 (07~15시만)', () => {
    expect(applied(tx('아웃백스테이크하우스 강남점', 80_000, 20)).net).toBe(0);
  });

  it('이용금액 상한이 1만원이라 8만원을 써도 1,000원이다', () => {
    expect(applied(tx('아웃백스테이크하우스 강남점', 80_000, 13)).net).toBe(1_000);
    expect(applied(tx('아웃백스테이크하우스 강남점', 10_000, 13)).net).toBe(1_000);
  });
});

describe('카페가 음식점보다 우선한다', () => {
  it('스타벅스는 음식점이 아니라 카페 영역으로 간다', () => {
    // 약관: "카페 영역의 대상 가맹점이 음식점 업종에 해당할 경우
    //        카페 할인이 적용되며, 음식점 할인은 적용되지 않습니다"
    const t = tx('스타벅스 강남점', 30_000, 13, '식비');
    expect(applied(t).rule).toBe('dp-time-cafe');
  });
});
