/**
 * 삼성카드 American Express Blue — 공식 약관 화면 기준 검증.
 *
 * 이 카드의 함정은 **구간이 3단계(30/60/90만)** 라는 것이다. 적립 한도가
 * 구간마다 다른데 한 단계로 알고 있으면 60만 미만에서 한도를 3배로 잡는다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import type { Transaction } from '@/lib/types';

const card = CARDS_BY_ID['samsung-amex-blue'];

let seq = 0;
function tx(title: string, krwAmount: number, day: string, kind: Transaction['paymentKind'] = '일시불'): Transaction {
  seq += 1;
  return {
    id: `ab-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(`${day}T05:00:00Z`).toISOString(),
    issuer: '삼성',
    last4: '2055',
    cardId: 'samsung-amex-blue',
    category: null,
    paymentKind: kind,
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

/** 지난달 실적을 만들어 준다 */
const prev = (n: number) => tx('아무데나', n, '2026-06-15');

describe('구간이 3단계다 (30만 / 60만 / 90만)', () => {
  it('구간표가 약관과 일치한다', () => {
    expect(card.performance.tiers.map((t) => t.threshold)).toEqual([
      0, 300_000, 600_000, 900_000,
    ]);
  });

  it.each([
    [250_000, 0],
    [300_000, 300_000],
    [704_385, 600_000], // 실제 7월 실적 — 최고 구간이 아니다
    [900_000, 900_000],
  ])('지난달 %i원 → %i 구간', (spend, expected) => {
    const snap = buildSnapshot(card, [prev(spend)], '2026-07');
    expect(snap.appliedTier?.threshold).toBe(expected);
  });
});

describe('적립 한도가 구간마다 오른다', () => {
  const capOf = (ruleId: string, prevSpend: number) =>
    buildSnapshot(card, [prev(prevSpend)], '2026-07').benefitUsage.find(
      (u) => u.ruleId === ruleId,
    )?.cap;

  it.each([
    ['ab-cvs-delivery', 300_000, 5_000],
    ['ab-cvs-delivery', 600_000, 10_000],
    ['ab-cvs-delivery', 900_000, 15_000],
    ['ab-transit-telecom', 300_000, 5_000],
    ['ab-transit-telecom', 600_000, 10_000],
    ['ab-transit-telecom', 900_000, 15_000],
  ])('%s: 지난달 %i원 → 한도 %i원', (ruleId, prevSpend, expected) => {
    expect(capOf(ruleId, prevSpend)).toBe(expected);
  });

  it('할인 혜택은 구간이 올라도 5,000원 고정이다', () => {
    for (const spend of [300_000, 600_000, 900_000]) {
      expect(capOf('ab-starbucks', spend)).toBe(5_000);
      expect(capOf('ab-streaming', spend)).toBe(5_000);
    }
  });
});

describe('쇼핑 1.5%는 전월실적과 무관하다', () => {
  it('실적이 하나도 없어도 한도가 살아 있다', () => {
    // 약관: "전월 이용금액에 관계없이". 구간표를 쓰면 여기서 0원이 된다.
    const snap = buildSnapshot(card, [], '2026-07');
    expect(snap.appliedTier?.threshold).toBe(0);
    expect(snap.benefitUsage.find((u) => u.ruleId === 'ab-shopping')?.cap).toBe(30_000);
  });

  it('실적 미달이어도 실제로 적립이 붙는다', () => {
    const snap = buildSnapshot(card, [tx('네이버페이', 100_000, '2026-07-10')], '2026-07');
    expect(snap.totalBenefitUsed).toBe(1_500); // 100,000 × 1.5%
  });
});

describe('대상점이 약관 열거대로 좁혀져 있다', () => {
  const base = [prev(900_000)];
  const benefitFor = (merchant: string, amount = 50_000) =>
    buildSnapshot(card, [...base, tx(merchant, amount, '2026-07-10')], '2026-07')
      .totalBenefitUsed;

  it('스트리밍은 6곳만 (디즈니플러스·유튜브는 대상이 아니다)', () => {
    expect(benefitFor('넷플릭스', 17_000)).toBe(3_400); // 20%
    expect(benefitFor('멜론', 10_000)).toBe(2_000);
    expect(benefitFor('디즈니플러스', 17_000)).toBe(0);
    expect(benefitFor('유튜브프리미엄', 17_000)).toBe(0);
  });

  it('스트리밍은 건별 6,000원 이상만', () => {
    expect(benefitFor('넷플릭스', 5_900)).toBe(0);
    expect(benefitFor('넷플릭스', 6_000)).toBe(1_200);
  });

  it('교통은 버스·지하철만 (택시는 대상이 아니다)', () => {
    expect(benefitFor('티머니 버스', 20_000)).toBe(1_000); // 5%
    expect(benefitFor('카카오T 택시', 20_000)).toBe(0);
  });

  it('쇼핑은 간편결제·아울렛·트렌디패션 (일반 온라인몰은 아니다)', () => {
    expect(benefitFor('카카오페이', 100_000)).toBe(1_500);
    expect(benefitFor('현대프리미엄아울렛', 100_000)).toBe(1_500);
    expect(benefitFor('ZARA 명동점', 100_000)).toBe(1_500);
    // 지마켓·11번가는 이 카드의 '쇼핑' 대상이 아니다
    expect(benefitFor('지마켓', 100_000)).toBe(0);
  });

  it('편의점은 5곳 전부가 대상이다', () => {
    for (const cvs of ['CU 역삼점', 'GS25 강남점', '세븐일레븐 서초점', '이마트24 논현점']) {
      expect(benefitFor(cvs, 10_000), cvs).toBe(700); // 7%
    }
  });
});
