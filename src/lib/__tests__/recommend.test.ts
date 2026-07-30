import { describe, expect, it } from 'vitest';
import { ACTIVE_CARDS, CARDS_BY_ID } from '@/config/cards';
import { buildAllSnapshots, buildSnapshot } from '@/lib/engine/snapshot';
import {
  estimateBenefit,
  findMissedBenefits,
  formatRate,
  recommendCards,
} from '@/lib/engine/recommend';
import type { CardId, Transaction } from '@/lib/types';

let seq = 0;
function tx(cardId: CardId, title: string, krwAmount: number, day: string): Transaction {
  seq += 1;
  return {
    id: `r-${seq}`,
    title,
    merchant: title,
    rawAmount: krwAmount,
    currency: 'KRW',
    krwAmount,
    approvedAt: new Date(`2026-${day}T03:00:00Z`).toISOString(),
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

const tantan = CARDS_BY_ID['kb-tantandaero'];
const zero = CARDS_BY_ID['hyundai-zero-ed2'];
const AT = '2026-07-15T03:00:00Z';

describe('카드별 예상 혜택', () => {
  it('실적을 채운 카드는 요율대로 혜택을 준다', () => {
    // 6월 70만 → 7월 70만 구간 (커피 한도 10,000원)
    const snapshot = buildSnapshot(tantan, [tx('kb-tantandaero', 'A', 700_000, '06-15')], '2026-07');
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '스타벅스 강남점',
      amount: 20_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(2_000); // 10%
    expect(result.ruleLabel).toBe('커피 10%');
    expect(result.cappedBy).toBe('none');
  });

  it('실적 미달 카드는 0원이라고 정확히 말한다', () => {
    const snapshot = buildSnapshot(tantan, [], '2026-07');
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '스타벅스',
      amount: 20_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(0);
    expect(result.reason).toContain('실적 미달');
  });

  it('한도를 다 쓴 카드는 요율이 높아도 0원으로 계산한다', () => {
    // 이게 이 엔진의 존재 이유다. 요율만 보고 추천하면
    // 1원도 안 나오는 카드를 계속 권하게 된다.
    const snapshot = buildSnapshot(
      tantan,
      [
        tx('kb-tantandaero', 'A', 700_000, '06-15'),
        // 커피 한도 10,000원을 미리 소진
        tx('kb-tantandaero', '스타벅스', 200_000, '07-01'),
      ],
      '2026-07',
    );
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '스타벅스',
      amount: 50_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(0);
    expect(result.grossBenefit).toBe(5_000);
    expect(result.reason).toContain('다 썼습니다');
  });

  it('매칭되는 혜택이 없으면 이유를 밝힌다', () => {
    const snapshot = buildSnapshot(tantan, [tx('kb-tantandaero', 'A', 700_000, '06-15')], '2026-07');
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '이름없는동네가게',
      amount: 30_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(0);
    expect(result.ruleLabel).toBeNull();
    expect(result.reason).toContain('적용되는 혜택이 없습니다');
  });

  it('무실적 카드는 실적과 무관하게 적립한다', () => {
    const snapshot = buildSnapshot(zero, [], '2026-07');
    const result = estimateBenefit(zero, snapshot, {
      merchant: '이름없는동네가게',
      amount: 100_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(1_000); // 전 가맹점 1%
  });

  it('세금 결제에는 catch-all 룰이 붙지 않는다', () => {
    // 이 검사가 없으면 "지방세는 쿠팡와우로!"라고 권하게 된다.
    // 세금은 모든 카드에서 혜택·실적 제외 항목이다.
    const wow = CARDS_BY_ID['kb-coupang-wow'];
    const snapshot = buildSnapshot(wow, [], '2026-07');
    const result = estimateBenefit(wow, snapshot, {
      merchant: '서울시청 지방세',
      amount: 340_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(0);
    expect(result.reason).toContain('공과금');
  });

  it('상품권 구입에도 적립이 붙지 않는다', () => {
    const snapshot = buildSnapshot(zero, [], '2026-07');
    const result = estimateBenefit(zero, snapshot, {
      merchant: '컬쳐랜드 문화상품권',
      amount: 500_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(0);
    expect(result.reason).toContain('상품권');
  });

  it('제외 항목이라도 룰이 opt-in 하면 혜택을 준다 (신한EV 하이패스)', () => {
    const ev = CARDS_BY_ID['shinhan-ev'];
    const snapshot = buildSnapshot(
      ev,
      [tx('shinhan-ev', 'A', 400_000, '06-15')], // 30만 구간
      '2026-07',
    );
    const result = estimateBenefit(ev, snapshot, {
      merchant: '한국도로공사 하이패스',
      amount: 30_000,
      at: AT,
    });
    expect(result.expectedBenefit).toBe(3_000); // 10% 캐시백
  });
});

describe('카드 추천 순위', () => {
  const transactions = [
    tx('kb-tantandaero', 'A', 700_000, '06-15'), // 7월 70만 구간
    tx('samsung-amex-blue', 'B', 400_000, '06-15'), // 7월 30만 구간
  ];
  const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, '2026-07');

  it('실제로 받을 금액이 큰 순으로 정렬한다', () => {
    const results = recommendCards(ACTIVE_CARDS, snapshots, {
      merchant: '스타벅스 강남점',
      amount: 20_000,
      at: AT,
    });
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1].expectedBenefit).toBeGreaterThanOrEqual(results[i].expectedBenefit);
    }
  });

  it('스타벅스는 20% 주는 Amex Blue가 10% 주는 탄탄대로를 이긴다', () => {
    const results = recommendCards(ACTIVE_CARDS, snapshots, {
      merchant: '스타벅스 강남점',
      amount: 20_000,
      at: AT,
    });
    expect(results[0].cardId).toBe('samsung-amex-blue');
    expect(results[0].expectedBenefit).toBe(4_000); // 20%
  });

  it('한도가 소진되면 순위가 뒤집힌다', () => {
    // Amex Blue 스벅 한도(5,000원)를 미리 소진시킨다
    const drained = [
      ...transactions,
      tx('samsung-amex-blue', '스타벅스', 100_000, '07-01'),
    ];
    const drainedSnapshots = buildAllSnapshots(ACTIVE_CARDS, drained, '2026-07');
    const results = recommendCards(ACTIVE_CARDS, drainedSnapshots, {
      merchant: '스타벅스 강남점',
      amount: 20_000,
      at: AT,
    });
    expect(results[0].cardId).not.toBe('samsung-amex-blue');
    const amex = results.find((r) => r.cardId === 'samsung-amex-blue')!;
    expect(amex.expectedBenefit).toBe(0);
  });

  it('활성 카드 전부를 결과에 담고, 각각 설명이 붙는다', () => {
    const results = recommendCards(ACTIVE_CARDS, snapshots, {
      merchant: '이름없는동네가게',
      amount: 30_000,
      at: AT,
    });
    expect(results).toHaveLength(ACTIVE_CARDS.length);
    // 혜택 이름이 있거나(정상 적용), 왜 안 되는지 이유가 있거나 둘 중 하나다.
    for (const r of results) expect(r.ruleLabel ?? r.reason).toBeTruthy();
  });

  it('한도에 걸리지 않으면 이유를 비워 둔다 (라벨과 중복 설명 방지)', () => {
    // 'Amex Blue의 스타벅스·이디야 20% 할인 · 20% 할인' 같은 중복을 막는다
    const results = recommendCards(ACTIVE_CARDS, snapshots, {
      merchant: '스타벅스 강남점',
      amount: 20_000,
      at: AT,
    });
    const amex = results.find((r) => r.cardId === 'samsung-amex-blue')!;
    expect(amex.ruleLabel).toBeTruthy();
    expect(amex.reason).toBeNull();
  });
});

describe('요율 표시', () => {
  it('소수점 요율을 반올림해 버리지 않는다', () => {
    // 쿠팡와우 프로모션 1.2%가 '1%'로 표시되던 버그
    expect(formatRate(0.012)).toBe('1.2%');
    expect(formatRate(0.002)).toBe('0.2%');
    expect(formatRate(0.015)).toBe('1.5%');
    expect(formatRate(0.2)).toBe('20%');
    expect(formatRate(0.1)).toBe('10%');
  });

  it('추천 결과의 요율 라벨이 실제 요율과 일치한다', () => {
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, [], '2026-07');
    const results = recommendCards(ACTIVE_CARDS, snapshots, {
      merchant: '쿠팡',
      amount: 100_000,
      at: AT,
    });
    const wow = results.find((r) => r.cardId === 'kb-coupang-wow')!;
    expect(wow.rateLabel).toBe('4%');
    expect(wow.expectedBenefit).toBe(4_000);
  });
});

describe('실적 영향 안내', () => {
  it('이 결제로 구간을 넘기면 알려준다', () => {
    // 7월에 29만원 사용 → 30만 구간까지 1만원 남음
    const snapshot = buildSnapshot(
      tantan,
      [tx('kb-tantandaero', 'A', 700_000, '06-15'), tx('kb-tantandaero', 'B', 290_000, '07-01')],
      '2026-07',
    );
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '이름없는동네가게',
      amount: 20_000,
      at: AT,
    });
    expect(result.performanceNote).toContain('30만원 구간 달성');
  });

  it('구간이 한참 멀면 조용하다', () => {
    const snapshot = buildSnapshot(tantan, [tx('kb-tantandaero', 'A', 700_000, '06-15')], '2026-07');
    const result = estimateBenefit(tantan, snapshot, {
      merchant: '이름없는동네가게',
      amount: 10_000,
      at: AT,
    });
    expect(result.performanceNote).toBeNull();
  });

  it('무실적 카드는 실적 안내가 없다', () => {
    const snapshot = buildSnapshot(zero, [], '2026-07');
    const result = estimateBenefit(zero, snapshot, {
      merchant: '아무데나',
      amount: 500_000,
      at: AT,
    });
    expect(result.performanceNote).toBeNull();
  });
});

describe('놓친 혜택', () => {
  it('더 나은 카드가 있었다면 찾아낸다', () => {
    const transactions = [
      tx('kb-tantandaero', 'A', 700_000, '06-15'),
      tx('samsung-amex-blue', 'B', 400_000, '06-15'),
      // 스타벅스를 탄탄대로(10%)로 결제 — Amex Blue였다면 20%
      tx('kb-tantandaero', '스타벅스 강남점', 30_000, '07-10'),
    ];
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, '2026-07');
    const missed = findMissedBenefits(ACTIVE_CARDS, snapshots, transactions);

    const hit = missed.find((m) => m.merchant === '스타벅스 강남점');
    expect(hit).toBeDefined();
    expect(hit!.usedCardId).toBe('kb-tantandaero');
    expect(hit!.bestCardId).toBe('samsung-amex-blue');
    expect(hit!.actualBenefit).toBe(3_000); // 10%
    expect(hit!.bestBenefit).toBe(5_000); // 20%지만 월 한도 5,000원에서 잘림
    expect(hit!.delta).toBe(2_000);
  });

  it('최선의 카드를 이미 썼으면 놓친 게 없다', () => {
    const transactions = [
      tx('samsung-amex-blue', 'B', 400_000, '06-15'),
      tx('samsung-amex-blue', '스타벅스', 20_000, '07-10'),
    ];
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, '2026-07');
    const missed = findMissedBenefits(ACTIVE_CARDS, snapshots, transactions);
    expect(missed.find((m) => m.merchant === '스타벅스')).toBeUndefined();
  });

  it('차이가 미미하면 보고하지 않는다 (노이즈 억제)', () => {
    const transactions = [tx('hyundai-zero-ed2', '아무데나', 10_000, '07-10')];
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, '2026-07');
    const missed = findMissedBenefits(ACTIVE_CARDS, snapshots, transactions, { minDelta: 500 });
    expect(missed).toHaveLength(0);
  });

  it('취소 건은 대상이 아니다', () => {
    const canceled = { ...tx('kb-tantandaero', '스타벅스', 100_000, '07-10'), canceled: true };
    const transactions = [tx('kb-tantandaero', 'A', 700_000, '06-15'), canceled];
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, '2026-07');
    const missed = findMissedBenefits(ACTIVE_CARDS, snapshots, transactions);
    expect(missed.find((m) => m.transactionId === canceled.id)).toBeUndefined();
  });

  it('놓친 금액이 큰 순으로 정렬한다', () => {
    const transactions = [
      tx('kb-tantandaero', 'A', 700_000, '06-15'),
      tx('samsung-amex-blue', 'B', 400_000, '06-15'),
      tx('kb-tantandaero', '스타벅스 A', 30_000, '07-10'),
      tx('kb-tantandaero', 'NETFLIX', 50_000, '07-11'),
    ];
    const snapshots = buildAllSnapshots(ACTIVE_CARDS, transactions, '2026-07');
    const missed = findMissedBenefits(ACTIVE_CARDS, snapshots, transactions);
    for (let i = 1; i < missed.length; i += 1) {
      expect(missed[i - 1].delta).toBeGreaterThanOrEqual(missed[i].delta);
    }
  });
});
