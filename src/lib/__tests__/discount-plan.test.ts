import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { computePerformance } from '@/lib/engine/performance';
import { computeBenefits } from '@/lib/engine/benefits';
import { estimateBenefit } from '@/lib/engine/recommend';
import { isWithinHours, kstHour } from '@/lib/date';
import type { Transaction } from '@/lib/types';

const dp = CARDS_BY_ID['shinhan-discount-plan'];

let seq = 0;
/** KST 시각(hour)을 지정해 거래를 만든다. */
function txAt(title: string, krwAmount: number, day: string, kstHourValue: number): Transaction {
  seq += 1;
  // KST hour → UTC hour (−9). 자정 이전으로 넘어가면 전날이 된다.
  const utcHour = kstHourValue - 9;
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, utcHour, 0, 0));
  return {
    id: `dp-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: at.toISOString(),
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

/**
 * 40만 구간(40만 이상 80만 미만)을 만들어 주는 지난달 실적.
 * Time Plan 한도 5,000 / Daily Plan 10,000 / 정기결제 3,000 / 영화 5,000.
 */
const PREV_MONTH = txAt('아무데나', 700_000, '2026-06-15', 12);

describe('KST 시각 유틸', () => {
  it('UTC ISO에서 KST 시를 뽑는다', () => {
    // 2026-07-10 03:00 UTC = 12:00 KST
    expect(kstHour('2026-07-10T03:00:00Z')).toBe(12);
    // 2026-07-10 15:30 UTC = 다음날 00:30 KST
    expect(kstHour('2026-07-10T15:30:00Z')).toBe(0);
  });

  it('구간 판정은 끝 시각을 포함하지 않는다', () => {
    expect(isWithinHours('2026-07-10T03:00:00Z', 7, 15)).toBe(true); // 12시
    expect(isWithinHours('2026-07-10T06:00:00Z', 7, 15)).toBe(false); // 15시 정각
    expect(isWithinHours('2026-07-09T22:00:00Z', 7, 15)).toBe(true); // 07시 정각
  });

  it('자정을 넘는 구간도 처리한다', () => {
    // 22~02시 구간
    expect(isWithinHours('2026-07-10T14:00:00Z', 22, 2)).toBe(true); // 23시
    expect(isWithinHours('2026-07-10T16:00:00Z', 22, 2)).toBe(true); // 01시
    expect(isWithinHours('2026-07-10T03:00:00Z', 22, 2)).toBe(false); // 12시
  });
});

describe('Discount Plan 시간대 할인', () => {
  it('카페는 07~15시에만 할인된다', () => {
    // 20,000 × 10% = 2,000이지만 Time Plan은 건당 1,000원까지다
    const inWindow = buildSnapshot(dp, [PREV_MONTH, txAt('스타벅스 강남점', 20_000, '2026-07-10', 12)], '2026-07');
    expect(inWindow.totalBenefitUsed).toBe(1_000);

    const outWindow = buildSnapshot(dp, [PREV_MONTH, txAt('스타벅스 강남점', 20_000, '2026-07-10', 16)], '2026-07');
    expect(outWindow.totalBenefitUsed).toBe(0);
  });

  it('편의점은 18~22시에만 할인된다', () => {
    const inWindow = buildSnapshot(dp, [PREV_MONTH, txAt('GS25 역삼점', 20_000, '2026-07-10', 19)], '2026-07');
    expect(inWindow.totalBenefitUsed).toBe(1_000);

    const outWindow = buildSnapshot(dp, [PREV_MONTH, txAt('GS25 역삼점', 20_000, '2026-07-10', 12)], '2026-07');
    expect(outWindow.totalBenefitUsed).toBe(0);
  });

  it('같은 편의점이라도 점심에 사면 밤과 결과가 다르다', () => {
    // 시각을 안 보면 이 두 결과가 같아진다 — 그게 버그다.
    const lunch = buildSnapshot(dp, [PREV_MONTH, txAt('CU 편의점', 30_000, '2026-07-10', 13)], '2026-07');
    const night = buildSnapshot(dp, [PREV_MONTH, txAt('CU 편의점', 30_000, '2026-07-10', 20)], '2026-07');
    expect(lunch.totalBenefitUsed).toBe(0);
    expect(night.totalBenefitUsed).toBe(1_000);
  });

  it('영역별로 하루 1회만 할인된다', () => {
    const snapshot = buildSnapshot(
      dp,
      [
        PREV_MONTH,
        txAt('스타벅스', 20_000, '2026-07-10', 9),
        txAt('투썸플레이스', 20_000, '2026-07-10', 13),
      ],
      '2026-07',
    );
    expect(snapshot.totalBenefitUsed).toBe(1_000);
  });

  it('UTC로 판정하면 틀리는 경계 시각을 KST로 올바로 본다', () => {
    // KST 08시 = UTC 23시(전날). UTC 시각으로 보면 07~15시 창을 벗어난다.
    const tx = txAt('스타벅스', 20_000, '2026-07-10', 8);
    expect(tx.approvedAt).toContain('2026-07-09T23:00');
    const snapshot = buildSnapshot(dp, [PREV_MONTH, tx], '2026-07');
    expect(snapshot.totalBenefitUsed).toBe(1_000);
  });
});

describe('Discount Plan 공과금 할인', () => {
  const utility = txAt('한국전력공사 전기요금', 80_000, '2026-07-10', 10);

  it('공과금은 실적에서는 빠진다', () => {
    const perf = computePerformance(dp, [utility]);
    expect(perf.includedSpend).toBe(0);
    expect(perf.exclusions[0].verdict).toBe('제외-공과금');
  });

  it('실적에서 빠져도 할인은 받는다', () => {
    const perf = computePerformance(dp, [utility]);
    const result = computeBenefits({
      card: dp,
      transactions: [utility],
      appliedTier: dp.performance.tiers[3], // 120만 구간 (정기결제 한도 10,000)
      verdicts: perf.verdicts,
      month: '2026-07',
    });
    // 80,000 × 10% = 8,000이지만 건당 한도 5,000원
    expect(result.totalUsed).toBe(5_000);
  });

  it('추천 화면에서도 공과금 할인을 제안한다', () => {
    const snapshot = buildSnapshot(dp, [PREV_MONTH], '2026-07');
    const result = estimateBenefit(dp, snapshot, {
      merchant: '한국전력공사 전기요금',
      amount: 80_000,
      at: '2026-07-15T03:00:00Z',
    });
    // 80,000 × 10% = 8,000 → 건당 5,000 → 40만 구간 정기결제 한도 3,000
    expect(result.expectedBenefit).toBe(3_000);
    expect(result.ruleLabel).toContain('공과금');
  });

  it('공과금 할인이 없는 카드는 여전히 0원이다', () => {
    const tantan = CARDS_BY_ID['kb-tantandaero'];
    const snapshot = buildSnapshot(tantan, [], '2026-07');
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '한국전력공사 전기요금',
      amount: 80_000,
      at: '2026-07-15T03:00:00Z',
    });
    expect(result.expectedBenefit).toBe(0);
  });
});

describe('Discount Plan 디지털구독', () => {
  it('구독은 20% 할인, 건당 2,000원까지', () => {
    const snapshot = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('NETFLIX', 17_000, '2026-07-08', 10)],
      '2026-07',
    );
    // 17,000 × 20% = 3,400이지만 건당 한도 2,000원
    expect(snapshot.totalBenefitUsed).toBe(2_000);
  });

  it('시각과 무관하게 적용된다 (정기결제는 시각이 제각각이다)', () => {
    const dawn = buildSnapshot(dp, [PREV_MONTH, txAt('NETFLIX', 10_000, '2026-07-08', 3)], '2026-07');
    expect(dawn.totalBenefitUsed).toBe(2_000);
  });
});

describe('Discount Plan 대상 가맹점은 약관에 열거된 것뿐이다', () => {
  it('지정 6개 카페만 할인된다', () => {
    const listed = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('폴바셋 선릉점', 20_000, '2026-07-10', 11)],
      '2026-07',
    );
    expect(listed.totalBenefitUsed).toBe(1_000);

    // 할리스는 약관 목록에 없다. 일반 카페 브랜드를 다 넣으면 과다 계상된다.
    const unlisted = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('할리스커피 선릉점', 20_000, '2026-07-10', 11)],
      '2026-07',
    );
    expect(unlisted.totalBenefitUsed).toBe(0);
  });

  it('편의점은 CU·GS25·세븐일레븐·이마트24만 대상이다', () => {
    const listed = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('GS25 역삼점', 20_000, '2026-07-10', 20)],
      '2026-07',
    );
    expect(listed.totalBenefitUsed).toBe(1_000);

    // 미니스톱은 약관 목록에 없다
    const unlisted = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('미니스톱 역삼점', 20_000, '2026-07-10', 20)],
      '2026-07',
    );
    expect(unlisted.totalBenefitUsed).toBe(0);
  });

  it('영화 예매는 정액 5,000원 할인이다', () => {
    const snapshot = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('CGV 강남', 15_000, '2026-07-10', 19)],
      '2026-07',
    );
    expect(snapshot.totalBenefitUsed).toBe(5_000);
  });

  it('영화 예매는 12,000원 미만이면 할인되지 않는다', () => {
    const snapshot = buildSnapshot(
      dp,
      [PREV_MONTH, txAt('CGV 강남', 11_000, '2026-07-10', 19)],
      '2026-07',
    );
    expect(snapshot.totalBenefitUsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Amex Blue 해외 결제 — 전월실적 조건이 없는 유일한 혜택
// ---------------------------------------------------------------------------

describe('Amex Blue 해외 결제 5% 적립', () => {
  const amex = CARDS_BY_ID['samsung-amex-blue'];

  function overseasTx(krwAmount: number): Transaction {
    return {
      ...txAt('ANTHROPIC,PBC', krwAmount, '2026-07-10', 12),
      cardId: 'samsung-amex-blue',
      issuer: '삼성',
      last4: '2055',
      paymentKind: '해외',
      currency: 'USD',
    };
  }

  it('실적이 0원이어도 해외 적립은 나온다', () => {
    // 이 카드에서 해외 적립만 전월실적과 무관하다. 통합 한도를 두면
    // 실적 미달일 때 이 적립까지 0원이 되어버린다.
    const snapshot = buildSnapshot(amex, [overseasTx(100_000)], '2026-07');
    expect(snapshot.previousSpend).toBe(0);
    expect(snapshot.appliedTier?.threshold).toBe(0);
    expect(snapshot.totalBenefitUsed).toBe(5_000); // 5%
  });

  it('국내 결제에는 해외 룰이 붙지 않는다', () => {
    const snapshot = buildSnapshot(
      amex,
      [txAt('아무데나', 100_000, '2026-07-10', 12)],
      '2026-07',
    );
    // 실적 미달이라 국내 혜택은 전부 0원
    expect(snapshot.totalBenefitUsed).toBe(0);
  });

  it('해외 적립은 월 3만 포인트에서 잘린다', () => {
    const snapshot = buildSnapshot(amex, [overseasTx(1_000_000)], '2026-07');
    expect(snapshot.totalBenefitUsed).toBe(30_000);
  });

  it('실적을 채우면 국내 혜택도 함께 잡힌다', () => {
    const snapshot = buildSnapshot(
      amex,
      [
        { ...txAt('아무데나', 400_000, '2026-06-15', 12), cardId: 'samsung-amex-blue' },
        { ...txAt('스타벅스', 20_000, '2026-07-10', 12), cardId: 'samsung-amex-blue' },
        overseasTx(100_000),
      ],
      '2026-07',
    );
    // 스벅 20% 4,000 + 해외 5% 5,000
    expect(snapshot.totalBenefitUsed).toBe(9_000);
  });
});
