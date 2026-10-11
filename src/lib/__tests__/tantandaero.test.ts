/**
 * KB국민 탄탄대로 — 공식 약관 기준 검증.
 *
 * 이 카드의 가장 큰 함정은 요율이 아니라 **실적**이다.
 * Trendy 서비스(20%) 할인을 받은 거래는 그 매출 전체가 실적에서 빠진다.
 * 20% 할인 한 번 받자고 40만 구간을 놓칠 수 있다.
 */

import { describe, expect, it } from 'vitest';
import { CARDS_BY_ID } from '@/config/cards';
import { buildSnapshot } from '@/lib/engine/snapshot';
import { estimateBenefit } from '@/lib/engine/recommend';
import type { Transaction } from '@/lib/types';

const card = CARDS_BY_ID['kb-tantandaero'];

let seq = 0;
function tx(title: string, krwAmount: number, day: string): Transaction {
  seq += 1;
  return {
    id: `tt-${seq}`,
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

describe('Trendy 할인을 받은 거래는 실적에서 빠진다', () => {
  it('20% 할인을 받으면 그 결제 전액이 실적에 안 잡힌다', () => {
    const snap = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'), // 지난달 → 80만 구간
        tx('일반결제', 300_000, '2026-07-02'),
        tx('헤어살롱 청담', 120_000, '2026-07-09'), // Trendy 20%
      ],
      '2026-07',
    );
    // 할인은 그대로 받는다 (120,000 × 20% = 24,000 → 영역 한도 20,000)
    const beauty = snap.benefitUsage.find((u) => u.ruleId === 'tt-trendy-beauty')!;
    expect(beauty.used).toBe(20_000);
    // 하지만 실적에는 일반결제 30만원만 잡힌다. 헤어살롱 12만원은 통째로 빠진다.
    expect(snap.currentSpend).toBe(300_000);
    expect(snap.excludedSpend).toBe(120_000);
  });

  it('Daily 서비스 할인은 실적에 영향을 주지 않는다', () => {
    const snap = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'),
        tx('이마트 성수점', 200_000, '2026-07-03'), // 대형마트 5% — Daily
      ],
      '2026-07',
    );
    const mart = snap.benefitUsage.find((u) => u.ruleId === 'tt-daily-mart-pharmacy')!;
    expect(mart.used).toBe(10_000); // 200,000 × 5%
    // Daily는 실적 제외 대상이 아니다
    expect(snap.currentSpend).toBe(200_000);
  });

  it('주유 6만원은 할인을 받고도 실적 6만원으로 남는다', () => {
    /*
     * 약관의 이용실적 제외 대상은 'Trendy서비스 받은 이용건'뿐이다.
     * 주유는 Daily 서비스라 여기 해당하지 않는다.
     *
     * 같은 6만원인데 어디서 쓰느냐로 실적 기여가 정반대가 되는 지점이라,
     * 룰을 손대다 주유를 excludeBenefitedGroups에 잘못 넣으면 실적이
     * 조용히 6만원씩 깎인다. 그걸 여기서 막는다.
     */
    const snap = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'), // 지난달 → 80만 구간
        tx('SK에너지 방배주유소', 60_000, '2026-07-04'),
      ],
      '2026-07',
    );

    // 리터당 100원 → 기준유가 1,700원/ℓ 환산으로 할인은 붙는다
    const transit = snap.benefitUsage.find((u) => u.capGroup === 'tt-daily-transit')!;
    expect(transit.used).toBe(Math.floor(60_000 * (100 / 1_700)));

    // 그런데 실적은 6만원 그대로다 — 한 푼도 빠지지 않는다
    expect(snap.currentSpend).toBe(60_000);
    expect(snap.excludedSpend).toBe(0);
    expect(snap.exclusions).toHaveLength(0);
  });

  it('같은 6만원이라도 Trendy에서 쓰면 실적이 0원이 된다', () => {
    // 주유 건과 나란히 두어야 이 차이가 규칙임을 알 수 있다.
    const snap = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'),
        tx('헤어살롱 청담', 60_000, '2026-07-04'),
      ],
      '2026-07',
    );
    expect(snap.currentSpend).toBe(0);
    expect(snap.excludedSpend).toBe(60_000);
    expect(snap.exclusions.find((e) => e.verdict === '제외-혜택')?.amount).toBe(60_000);
  });

  it('할인이 0원이면 실적에서 빼지 않는다', () => {
    // 실적 미달(구간 0)이라 Trendy 한도가 0 → 할인이 안 붙는다.
    // 할인을 못 받았으면 실적에서 뺄 이유도 없다.
    const snap = buildSnapshot(card, [tx('헤어살롱 청담', 120_000, '2026-07-09')], '2026-07');
    expect(snap.appliedTier?.threshold).toBe(0);
    expect(snap.currentSpend).toBe(120_000);
  });
});

describe('실적에서 왜 빠졌는지 화면과 노션이 같은 말을 한다', () => {
  const snap = () =>
    buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'),
        tx('헤어살롱 청담', 120_000, '2026-07-09'), // Trendy 20%
        tx('서울시청지방세', 50_000, '2026-07-11'), // 공과금
      ],
      '2026-07',
    );

  it('혜택 때문에 빠진 건은 「제외-혜택」으로 따로 잡힌다', () => {
    // 연회비·수수료와 같은 '기타' 칸에 섞이면 사용자는 12만원이 왜
    // 빠졌는지 화면에서 알아낼 방법이 없다.
    const s = snap();
    const benefited = s.exclusions.find((e) => e.verdict === '제외-혜택')!;
    expect(benefited.amount).toBe(120_000);
    expect(benefited.count).toBe(1);
    // 공과금은 제 사유 그대로 남는다
    expect(s.exclusions.find((e) => e.verdict === '제외-공과금')?.amount).toBe(50_000);
  });

  it('거래별 판정에도 보정 결과가 실린다 (노션 역기입이 쓰는 값)', () => {
    const s = snap();
    const hair = Object.entries(s.performanceVerdicts).find(([id]) =>
      s.appliedBenefits.some((b) => b.transactionId === id && b.ruleId === 'tt-trendy-beauty'),
    )!;
    expect(hair[1]).toBe('제외-혜택');
  });
});

describe('추천 화면이 실적 함정을 거꾸로 말하지 않는다', () => {
  // 지난달 30만 → 이번 달 실적 미달 구간이지만, 이번 달에 이미 38만을 써서
  // 40만 구간까지 2만원 남은 상황... 은 할인이 0원이라 함정이 안 생긴다.
  // 함정은 **할인을 실제로 받는** 80만 구간에서 나온다.
  const snap = buildSnapshot(
    card,
    [
      tx('아무데나', 900_000, '2026-06-15'), // 지난달 → 80만 구간
      tx('일반결제', 390_000, '2026-07-02'), // 이번 달 실적 39만 (40만까지 1만원)
    ],
    '2026-07',
  );

  it('Trendy 할인은 「구간 달성」이 아니라 「실적에서 빠진다」고 알린다', () => {
    const rec = estimateBenefit(card, snap, {
      merchant: '하이마트 역삼점',
      amount: 120_000,
      at: '2026-07-20T03:00:00Z',
    });
    expect(rec.expectedBenefit).toBe(20_000); // 할인은 그대로 받는다
    expect(rec.performanceImpact).toBe('excluded');
    expect(rec.performanceNote).toContain('실적에서 빠집니다');
    // 예전에는 여기서 "이 결제로 40만원 구간 달성"이라고 정반대로 말했다.
    expect(rec.performanceNote).not.toContain('구간 달성');
  });

  it('한도가 소진돼 할인이 0원이면 실적에는 그대로 잡힌다', () => {
    // 이미 Trendy 미용 한도(20,000)를 다 쓴 뒤라면 할인이 안 붙고,
    // 할인을 못 받았으면 실적에서 뺄 이유도 없다.
    const spent = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'),
        tx('일반결제', 390_000, '2026-07-02'),
        tx('헤어살롱 청담', 200_000, '2026-07-05'), // 한도 20,000 소진
      ],
      '2026-07',
    );
    const rec = estimateBenefit(card, spent, {
      merchant: '하이마트 역삼점',
      amount: 120_000,
      at: '2026-07-20T03:00:00Z',
    });
    expect(rec.expectedBenefit).toBe(0);
    expect(rec.performanceImpact).toBe('counts');
    expect(rec.performanceNote).toContain('구간 달성');
  });

  it('Daily 영역은 평소대로 실적 안내를 한다', () => {
    const rec = estimateBenefit(card, snap, {
      merchant: '이마트 성수점',
      amount: 120_000,
      at: '2026-07-20T03:00:00Z',
    });
    expect(rec.performanceImpact).toBe('counts');
    expect(rec.performanceNote).toContain('구간 달성');
  });
});

describe('영역별 한도 (약관 표)', () => {
  const prev = (n: number) => tx('아무데나', n, '2026-06-15');

  it.each([
    ['tt-trendy-beauty', 400_000, 15_000],
    ['tt-trendy-beauty', 900_000, 20_000],
    ['tt-daily-dept-cvs', 400_000, 10_000],
    ['tt-daily-dept-cvs', 900_000, 15_000],
    ['tt-daily-mart-pharmacy', 400_000, 10_000],
    ['tt-daily-mart-pharmacy', 900_000, 15_000],
  ])('%s: 지난달 %i원 → 한도 %i원', (ruleId, prevSpend, expected) => {
    const snap = buildSnapshot(card, [prev(prevSpend)], '2026-07');
    expect(snap.benefitUsage.find((u) => u.ruleId === ruleId)?.cap).toBe(expected);
  });
});

describe('대상 가맹점이 약관 열거대로 좁혀져 있다', () => {
  const base = [tx('아무데나', 900_000, '2026-06-15')];

  function benefitFor(merchant: string, amount = 100_000): number {
    const snap = buildSnapshot(card, [...base, tx(merchant, amount, '2026-07-10')], '2026-07');
    return snap.totalBenefitUsed;
  }

  it('편의점은 GS25·CU만 (세븐일레븐 제외)', () => {
    expect(benefitFor('GS25 역삼점')).toBeGreaterThan(0);
    expect(benefitFor('세븐일레븐 강남점')).toBe(0);
  });

  it('대형마트는 SSM을 제외한다', () => {
    expect(benefitFor('이마트 성수점')).toBeGreaterThan(0);
    expect(benefitFor('이마트에브리데이 역삼점')).toBe(0);
  });

  it('주유는 SK·GS칼텍스만 (S-OIL 제외)', () => {
    expect(benefitFor('SK에너지 방배주유소')).toBeGreaterThan(0);
    expect(benefitFor('에쓰오일 방배주유소')).toBe(0);
  });

  it('커피는 건당 2만원 이상만', () => {
    expect(benefitFor('스타벅스 강남점', 19_000)).toBe(0);
    expect(benefitFor('스타벅스 강남점', 20_000)).toBe(2_000);
  });
});

describe('대중교통·택시·주유가 한 한도를 나눠 쓴다', () => {
  it('세 영역의 소진액이 합산된다', () => {
    const snap = buildSnapshot(
      card,
      [
        tx('아무데나', 900_000, '2026-06-15'), // 80만 구간 → 한도 15,000
        tx('서울버스', 50_000, '2026-07-03'), // 10% = 5,000
        tx('SK에너지 방배주유소', 100_000, '2026-07-05'), // ≈5.9% = 5,882
      ],
      '2026-07',
    );
    const group = snap.benefitUsage.find((u) => u.capGroup === 'tt-daily-transit')!;
    expect(group.label).toBe('대중교통·택시·주유');
    expect(group.cap).toBe(15_000);
    // 한 줄로 합쳐져 나온다 — 두 줄이면 한도가 두 배로 보인다
    expect(snap.benefitUsage.filter((u) => u.capGroup === 'tt-daily-transit')).toHaveLength(1);
    expect(group.used).toBe(5_000 + Math.floor(100_000 * (100 / 1_700)));
  });
});

describe('미용 20%는 업종 기준이라 이름에 "헤어"가 없어도 걸려야 한다', () => {
  /*
   * 2026-09-09 차홍룸 판교점 302,000원. KB Pay에는 20% 할인이 붙었는데 앱은
   * '대상 가맹점 아님'이라고 했다 — 미용 룰이 이름 키워드에만 기대고 있었고,
   * 브랜드 사전에 미용실이 하나도 없었다. 놓친 건 할인 2만원만이 아니다.
   * Trendy 할인건은 실적에서 통째로 빠지는데 '인정'으로 잡혀 9월 실적이
   * 30만원 부풀려졌다.
   */
  const base = [tx('아무데나', 900_000, '2026-08-15')]; // 지난달 → 80만 구간

  it('차홍룸 판교점 302,000원 → 미용 한도 20,000원, 실적에서는 통째로 빠진다', () => {
    const salon = tx('차홍룸 판교점', 302_000, '2026-09-09');
    const snap = buildSnapshot(card, [...base, salon], '2026-09');
    const applied = snap.appliedBenefits.find((b) => b.transactionId === salon.id)!;
    expect(applied.ruleId).toBe('tt-trendy-beauty');
    expect(applied.netAmount).toBe(20_000); // 60,400 → 영역 한도
    expect(snap.performanceVerdicts[salon.id]).toBe('제외-혜택');
    expect(snap.currentSpend).toBe(0);
    expect(snap.noBenefit[salon.id]).toBeUndefined();
  });

  it.each([
    ['허지스헤어 아트테라'], // 키워드 '헤어'
    ['네일신'], // 키워드 '네일'
    ['블루클럽 판교점'], // 브랜드 사전 (이름에 업종이 없다)
    ['이가자헤어비스 분당'], // 브랜드 사전
    ['살롱드마고'], // 키워드 '살롱'
  ])('%s → 미용 룰', (name) => {
    const t = tx(name, 50_000, '2026-09-10');
    const snap = buildSnapshot(card, [...base, t], '2026-09');
    expect(snap.appliedBenefits.find((b) => b.transactionId === t.id)?.ruleId).toBe(
      'tt-trendy-beauty',
    );
  });

  it('사전에 없는 동네 미용실은 노션 카테고리 "미용"으로 걸어 준다', () => {
    const unknown = { ...tx('홍길동', 40_000, '2026-09-10'), category: '미용' as const };
    const snap = buildSnapshot(card, [...base, unknown], '2026-09');
    expect(snap.appliedBenefits.find((b) => b.transactionId === unknown.id)?.ruleId).toBe(
      'tt-trendy-beauty',
    );
  });

  it('카테고리도 없고 이름에도 업종이 없으면 여전히 대상 가맹점 아님', () => {
    // 사전을 넓혔다고 아무 가게나 미용실로 보면 과다 계상이다.
    const t = tx('홍길동', 40_000, '2026-09-10');
    const snap = buildSnapshot(card, [...base, t], '2026-09');
    expect(snap.noBenefit[t.id]?.reason).toBe('대상 가맹점 아님');
  });
});
