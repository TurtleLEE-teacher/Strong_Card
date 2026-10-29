/**
 * 쿠팡와우 2026-11 프로모션 (2026-11-01 ~ 2027-04-30, 기보유 고객).
 *
 *   혜택1  쿠팡·쿠팡이츠·쿠팡플레이 3.5% · 월 35,000원
 *   혜택2  그 외 국내외 1% · 월 10,000원
 *   혜택3  카페·편의점·해외 1% **추가** · 영역마다 월 10,000원
 *          혜택2와 중복. 혜택2 한도를 넘으면 1%만.
 *
 * 혜택3이 이 앱 처음의 '중복 적립'이다. 거래 하나에 룰 하나만 고르던
 * 엔진으로는 카페 결제가 1%로 나온다 — 실제는 2%다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { benefitsByTransaction, computeBenefits } from '@/lib/engine/benefits';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { estimateBenefit, findMissedBenefits } from '@/lib/engine/recommend';
import { buildBenefitAlert } from '@/lib/alerts/rules';
import type { Card, PaymentKind, Transaction, TxCategory } from '@/lib/types';

const wow = CARDS_BY_ID['kb-coupang-wow'];
const tier = wow.performance.tiers[0];

let seq = 0;
/** 같은 날 만든 순서대로 승인 시각이 1초씩 늦어진다 (한도 소진 순서를 고정). */
function tx(
  title: string,
  krwAmount: number,
  day: string,
  opts: { paymentKind?: PaymentKind; category?: TxCategory; canceled?: boolean } = {},
): Transaction {
  seq += 1;
  const [y, m, d] = day.split('-').map(Number);
  return {
    id: `cw-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(Date.UTC(y, m - 1, d, 5, 0, seq)).toISOString(),
    issuer: '국민',
    last4: null,
    cardId: 'kb-coupang-wow',
    category: opts.category ?? null,
    paymentKind: opts.paymentKind ?? '일시불',
    installmentMonths: null,
    canceled: opts.canceled ?? false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

function run(transactions: Transaction[], month = '2026-11') {
  return computeBenefits({ card: wow, transactions, appliedTier: tier, month });
}

describe('쿠팡와우 2026-11 프로모션 — 요율과 한도', () => {
  it('11-01부터 쿠팡은 3.5%', () => {
    expect(run([tx('쿠팡', 100_000, '2026-11-01')]).totalUsed).toBe(3_500);
  });

  it('4월 30일까지 이어지고 5월 1일에 기본 2%로 돌아간다', () => {
    expect(run([tx('쿠팡', 100_000, '2027-04-30')], '2027-04').totalUsed).toBe(3_500);
    expect(run([tx('쿠팡', 100_000, '2027-05-01')], '2027-05').totalUsed).toBe(2_000);
  });

  it('쿠팡 3.5%는 월 35,000원까지', () => {
    expect(run([tx('쿠팡', 1_200_000, '2026-11-02')]).totalUsed).toBe(35_000);
  });

  it('그 외 가맹점은 1%, 월 10,000원까지', () => {
    expect(run([tx('동네가게', 500_000, '2026-11-02')]).totalUsed).toBe(5_000);
    expect(run([tx('동네가게', 2_000_000, '2026-11-02')]).totalUsed).toBe(10_000);
  });

  it('앱스토어로 낸 쿠팡플레이는 쿠팡 혜택이 아니라 그 외 1%', () => {
    const play = tx('GOOGLE*쿠팡플레이', 10_000, '2026-11-02');
    const result = run([play]);
    expect(result.appliedBenefits.map((b) => b.ruleId)).toEqual(['cw-other-2611']);
    expect(result.totalUsed).toBe(100);
  });

  it('월 최대 75,000원 (35,000 + 10,000 + 30,000)', () => {
    const result = run([
      tx('쿠팡', 2_000_000, '2026-11-03'),
      tx('동네가게', 2_000_000, '2026-11-03'),
      tx('스타벅스', 2_000_000, '2026-11-03'),
      tx('CU', 2_000_000, '2026-11-03'),
      tx('AMAZON', 2_000_000, '2026-11-03', { paymentKind: '해외' }),
    ]);
    expect(result.totalUsed).toBe(75_000);
  });
});

describe('쿠팡와우 2026-11 — 카페·편의점·해외 1% 중복 적립', () => {
  it('카페는 그 외 1%에 1%가 더 붙는다 (2%)', () => {
    const cafe = tx('스타벅스', 10_000, '2026-11-04');
    const result = run([cafe]);
    expect(result.totalUsed).toBe(200);
    expect(result.appliedBenefits.map((b) => b.ruleId)).toEqual(['cw-other-2611', 'cw-cafe-2611']);
    expect(result.noBenefit[cafe.id]).toBeUndefined();
  });

  it('브랜드를 몰라도 노션 카테고리가 카페면 걸린다', () => {
    expect(run([tx('동네커피집', 10_000, '2026-11-04', { category: '카페' })]).totalUsed).toBe(200);
  });

  it('편의점 4사만 추가 적립이다 (미니스톱 제외)', () => {
    expect(run([tx('GS25', 10_000, '2026-11-04')]).totalUsed).toBe(200);
    expect(run([tx('세븐일레븐', 10_000, '2026-11-04')]).totalUsed).toBe(200);
    expect(run([tx('이마트24', 10_000, '2026-11-04')]).totalUsed).toBe(200);
    expect(run([tx('미니스톱', 10_000, '2026-11-04')]).totalUsed).toBe(100);
  });

  it('해외 결제도 2%', () => {
    expect(
      run([tx('AMAZON', 10_000, '2026-11-04', { paymentKind: '해외' })]).totalUsed,
    ).toBe(200);
  });

  it('그 외 1% 한도를 다 쓰면 카페는 1%만 받는다', () => {
    const local = tx('동네가게', 1_000_000, '2026-11-05');
    const cafe = tx('스타벅스', 10_000, '2026-11-05');
    const result = run([local, cafe]);
    const merged = benefitsByTransaction(result.appliedBenefits).get(cafe.id)!;
    expect(merged.netAmount).toBe(100);
    // 0원이 된 '그 외 1%'는 이름에서 빠진다
    expect(merged.ruleLabel).toBe('카페 1% 추가 적립');
    expect(result.noBenefit[cafe.id]).toBeUndefined();
  });

  it('추가 적립은 영역마다 월 10,000원', () => {
    const first = tx('CU', 2_000_000, '2026-11-06');
    const late = tx('GS25', 10_000, '2026-11-06');
    const result = run([first, late]);
    // CU: 그 외 10,000 + 편의점 10,000. 그 뒤 GS25는 둘 다 소진.
    expect(result.totalUsed).toBe(20_000);
    expect(result.noBenefit[late.id]?.reason).toBe('월 한도 소진');
  });

  it('세금·상품권에는 추가 적립도 없다', () => {
    const snap = buildSnapshot(wow, [tx('CU문화상품권', 50_000, '2026-11-07')], '2026-11');
    expect(snap.totalBenefitUsed).toBe(0);
  });

  it('10월(두 프로모션 사이)에는 추가 적립이 없다', () => {
    expect(run([tx('스타벅스', 10_000, '2026-10-20')], '2026-10').totalUsed).toBe(20); // 0.2%
  });

  it('취소하면 두 혜택이 모두 돌아온다', () => {
    const buy = tx('스타벅스', 10_000, '2026-11-08');
    const back = { ...tx('스타벅스', -10_000, '2026-11-09'), paymentKind: '취소·환불' as const, canceled: true };
    const snap = buildSnapshot(wow, [buy, back], '2026-11');
    expect(snap.totalBenefitUsed).toBe(0);
    for (const id of ['cw-other-2611', 'cw-cafe-2611']) {
      expect(snap.benefitUsage.find((u) => u.ruleId === id)?.used, id).toBe(0);
    }
    expect(benefitsByTransaction(snap.appliedBenefits).get(back.id)?.netAmount).toBe(-200);
  });
});

describe('쿠팡와우 2026-11 — 거래 단위 화면·알림·추천', () => {
  it('거래 하나로 합치면 금액은 더하고 이름은 잇는다', () => {
    const cafe = tx('스타벅스', 10_000, '2026-11-10');
    const merged = benefitsByTransaction(run([cafe]).appliedBenefits).get(cafe.id)!;
    expect(merged.netAmount).toBe(200);
    expect(merged.ruleLabel).toBe('그 외 1% 적립 (프로모션) + 카페 1% 추가 적립');
  });

  it('알림은 합친 금액으로 한 번 나간다', () => {
    const cafe = tx('스타벅스', 10_000, '2026-11-10');
    const snap = buildSnapshot(wow, [cafe], '2026-11');
    const alert = buildBenefitAlert(wow, snap, cafe.id, '스타벅스');
    expect(alert?.title).toBe('200원 적립 적용');
  });

  it('추천도 카페에서 2%로 계산한다', () => {
    const snap = buildSnapshot(wow, [], '2026-11');
    const rec = estimateBenefit(wow, snap, {
      merchant: '스타벅스',
      amount: 10_000,
      at: '2026-11-11T03:00:00Z',
    });
    expect(rec.expectedBenefit).toBe(200);
    expect(rec.rateLabel).toBe('2%');
  });

  it('놓친 혜택 계산이 받은 금액을 절반으로 잡지 않는다', () => {
    const cafe = tx('스타벅스', 10_000, '2026-11-12');
    const snap = buildSnapshot(wow, [cafe], '2026-11');
    // 전 가맹점 1.5%짜리 비교용 카드. 쿠팡와우가 실제로 받은 건 2%(200원)라
    // 1.5%(150원)는 놓친 혜택이 아니다. 첫 건(100원)만 보면 놓쳤다고 나온다.
    const flat: Card = {
      ...wow,
      id: 'hyundai-zero-ed2',
      shortName: '비교용',
      benefits: [
        { id: 'flat-150', label: '전 가맹점 1.5%', type: 'point', rate: 0.015, match: {} },
      ],
    };
    const flatSnap = buildSnapshot(flat, [], '2026-11');
    expect(findMissedBenefits([wow, flat], [snap, flatSnap], [cafe], { minDelta: 1 })).toEqual([]);
  });
});

describe('쿠팡와우 소진 현황 목록', () => {
  it('11월에는 새 프로모션 룰만 보인다', () => {
    const ids = run([]).usage.map((u) => u.ruleId).sort();
    expect(ids).toEqual([
      'cw-cafe-2611',
      'cw-coupang-2611',
      'cw-cvs-2611',
      'cw-other-2611',
      'cw-overseas-2611',
    ]);
  });

  it('10월: 15일 뒤 결제는 기본 룰로 받고, 그 줄이 목록에 남는다', () => {
    const result = run(
      [tx('쿠팡', 100_000, '2026-10-10'), tx('쿠팡', 100_000, '2026-10-20')],
      '2026-10',
    );
    expect(result.totalUsed).toBe(6_000); // 4,000 + 2,000
    const used = (id: string) => result.usage.find((u) => u.ruleId === id)?.used;
    expect(used('cw-coupang-promo')).toBe(4_000);
    expect(used('cw-coupang-base')).toBe(2_000);
    // 한 번도 안 쓴 기본 '그 외'는 여전히 가려진다
    expect(result.usage.some((u) => u.ruleId === 'cw-other-base')).toBe(false);
  });
});
