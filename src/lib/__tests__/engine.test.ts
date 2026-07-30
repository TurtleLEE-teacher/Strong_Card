import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/lib/types';
import { CARDS_BY_ID, LAST4_TO_CARD_ID, resolveCardIdByLast4 } from '@/config/cards';
import { normalizeMerchant, resolveBrand } from '@/config/merchants';
import {
  extractIssuerCumulative,
  extractLast4,
  extractLast4FromApprovalNo,
} from '@/lib/parse/sms';
import {
  currentMonthKey,
  daysRemainingInMonth,
  monthRangeUtc,
  previousMonthKey,
  toMonthKey,
} from '@/lib/date';
import { toKrw } from '@/lib/fx';
import { computePerformance, judgeTransaction, resolveTier } from '@/lib/engine/performance';
import { computeBenefits, resolveCap } from '@/lib/engine/benefits';
import { buildSnapshot } from '@/lib/engine/snapshot';

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

let seq = 0;
function tx(partial: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `tx-${seq}`,
    title: partial.title ?? '테스트가맹점',
    merchant: partial.merchant ?? partial.title ?? '테스트가맹점',
    rawAmount: partial.rawAmount ?? partial.krwAmount ?? 10_000,
    currency: partial.currency ?? 'KRW',
    krwAmount: partial.krwAmount ?? 10_000,
    approvedAt: partial.approvedAt ?? '2026-07-10T01:00:00Z',
    issuer: partial.issuer ?? null,
    last4: partial.last4 ?? null,
    cardId: partial.cardId ?? null,
    category: partial.category ?? null,
    paymentKind: partial.paymentKind ?? '일시불',
    installmentMonths: partial.installmentMonths ?? null,
    canceled: partial.canceled ?? false,
    rawMessage: partial.rawMessage ?? null,
    issuerCumulative: partial.issuerCumulative ?? null,
    alertStatus: partial.alertStatus ?? null,
  };
}

// ---------------------------------------------------------------------------
// 카드 매핑
// ---------------------------------------------------------------------------

describe('카드 뒷4자리 매핑', () => {
  it('6장 모두 고유한 뒷4자리를 가진다', () => {
    expect(Object.keys(LAST4_TO_CARD_ID)).toHaveLength(6);
  });

  it('실제 카드 뒷4자리가 올바른 상품으로 매핑된다', () => {
    expect(resolveCardIdByLast4('6089')).toBe('kb-tantandaero');
    expect(resolveCardIdByLast4('3211')).toBe('kb-coupang-wow');
    expect(resolveCardIdByLast4('2055')).toBe('samsung-amex-blue');
    expect(resolveCardIdByLast4('7316')).toBe('hyundai-zero-ed2');
    expect(resolveCardIdByLast4('6359')).toBe('shinhan-discount-plan');
    expect(resolveCardIdByLast4('4401')).toBe('shinhan-ev');
  });

  it('모르는 4자리는 null을 돌려준다', () => {
    expect(resolveCardIdByLast4('9999')).toBeNull();
    expect(resolveCardIdByLast4(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SMS 파싱 — 실제 관측된 원문으로 검증
// ---------------------------------------------------------------------------

const KB_SMS = `<제목: KB국민카드6089 승인>
KB국민카드6089
승인
2,500 원(일시불)
(주)아방가르드(아방
고객명 이*석님
승인시각 07/30 10:32
누적 2,040,509원`;

const SAMSUNG_SMS = `[Web발신]
삼성2055해외승인 이*석
USD 22.00
07/02 09:06 ANTHROPIC,PBC`;

describe('SMS 원문 파싱', () => {
  it('KB 문자에서 뒷4자리를 뽑는다', () => {
    expect(extractLast4(KB_SMS)).toBe('6089');
  });

  it('삼성 해외승인 문자에서 뒷4자리를 뽑는다', () => {
    expect(extractLast4(SAMSUNG_SMS)).toBe('2055');
  });

  it('카드사 공식 누적 실적을 뽑는다', () => {
    expect(extractIssuerCumulative(KB_SMS)).toBe(2_040_509);
    expect(extractIssuerCumulative(SAMSUNG_SMS)).toBeNull();
  });

  it('승인번호 합성키에서도 뒷4자리를 복구한다', () => {
    expect(extractLast4FromApprovalNo('KB-6089-N-07301032-2500')).toBe('6089');
    expect(extractLast4FromApprovalNo('KB-2055-N-07020906-22.00')).toBe('2055');
  });

  it('원문이 없으면 조용히 null', () => {
    expect(extractLast4(null)).toBeNull();
    expect(extractIssuerCumulative(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 가맹점 정규화
// ---------------------------------------------------------------------------

describe('가맹점 정규화', () => {
  it('사업자 형태와 잘린 괄호를 제거한다', () => {
    expect(normalizeMerchant('(주)아방가르드(아방')).toBe('아방가르드');
  });

  it('지점 구분자를 제거한다', () => {
    expect(normalizeMerchant('스타벅스*강남점')).toBe('스타벅스강남점');
  });

  it('브랜드를 접두일치로 찾는다', () => {
    expect(resolveBrand('스타벅스*강남점')).toBe('STARBUCKS');
    expect(resolveBrand('이디야커피 역삼2호점')).toBe('EDIYA');
    expect(resolveBrand('쿠팡')).toBe('COUPANG');
  });

  it('사전에 없는 가맹점은 null (= 미분류로 노출)', () => {
    expect(resolveBrand('(주)아방가르드(아방')).toBeNull();
    expect(resolveBrand(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// KST 월 경계 — 여기가 틀리면 월말 결제가 옆 달로 샌다
// ---------------------------------------------------------------------------

describe('KST 월 경계', () => {
  it('UTC 자정 직후도 KST 기준 같은 날로 본다', () => {
    // 2026-07-30 01:32 UTC = 2026-07-30 10:32 KST
    expect(toMonthKey('2026-07-30T01:32:00Z')).toBe('2026-07');
  });

  it('말일 밤 KST 결제가 다음 달로 새지 않는다', () => {
    // 2026-07-31 23:00 KST = 2026-07-31 14:00 UTC
    expect(toMonthKey('2026-07-31T14:00:00Z')).toBe('2026-07');
  });

  it('1일 새벽 KST 결제가 전달로 새지 않는다', () => {
    // 2026-08-01 00:30 KST = 2026-07-31 15:30 UTC
    expect(toMonthKey('2026-07-31T15:30:00Z')).toBe('2026-08');
  });

  it('월 범위는 KST 1일 00:00 ~ 다음달 1일 00:00', () => {
    const { startUtc, endUtc } = monthRangeUtc('2026-07');
    expect(startUtc.toISOString()).toBe('2026-06-30T15:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-07-31T15:00:00.000Z');
  });

  it('연초 경계에서 이전 달을 올바르게 계산한다', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12');
    expect(previousMonthKey('2026-07')).toBe('2026-06');
  });

  it('남은 일수를 KST 기준으로 센다', () => {
    // 2026-07-24 12:00 KST → 7월은 31일까지 → 7일 남음
    expect(daysRemainingInMonth(new Date('2026-07-24T03:00:00Z'))).toBe(7);
    expect(daysRemainingInMonth(new Date('2026-07-31T03:00:00Z'))).toBe(0);
  });

  it('currentMonthKey가 KST 기준으로 동작한다', () => {
    expect(currentMonthKey(new Date('2026-07-31T15:30:00Z'))).toBe('2026-08');
  });
});

// ---------------------------------------------------------------------------
// 환율
// ---------------------------------------------------------------------------

describe('원화 환산', () => {
  it('KRW는 그대로 통과시킨다', () => {
    expect(toKrw(2500, 'KRW')).toBe(2500);
  });

  it('USD 22는 22원이 아니라 3만원대가 된다', () => {
    const krw = toKrw(22, 'USD');
    expect(krw).toBeGreaterThan(29_000);
    expect(krw).toBeLessThan(32_000);
  });

  it('환율 오버라이드를 반영한다', () => {
    expect(toKrw(100, 'USD', { rates: { USD: 1000 }, applyFee: false })).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// 실적 계산
// ---------------------------------------------------------------------------

describe('실적 계산', () => {
  const card = CARDS_BY_ID['kb-tantandaero'];

  it('일반 결제는 실적에 산입된다', () => {
    expect(judgeTransaction(card, tx({ title: '아방가르드' }))).toBe('인정');
  });

  it('취소 건은 제외된다', () => {
    expect(judgeTransaction(card, tx({ canceled: true }))).toBe('제외-취소');
    expect(judgeTransaction(card, tx({ paymentKind: '취소·환불' }))).toBe('제외-취소');
  });

  it('세금·공과금은 제외된다', () => {
    expect(judgeTransaction(card, tx({ title: '서울시청지방세' }))).toBe('제외-공과금');
    expect(judgeTransaction(card, tx({ title: '행복아파트관리비' }))).toBe('제외-공과금');
  });

  it('상품권 구입은 제외된다', () => {
    expect(judgeTransaction(card, tx({ title: '컬쳐랜드문화상품권' }))).toBe('제외-상품권');
  });

  it('하이패스는 무승인 전표로 제외된다', () => {
    expect(judgeTransaction(card, tx({ title: '한국도로공사하이패스' }))).toBe('제외-무승인');
  });

  it('인정액과 제외액을 분리 집계한다', () => {
    const result = computePerformance(card, [
      tx({ title: '아방가르드', krwAmount: 500_000 }),
      tx({ title: '서울시청지방세', krwAmount: 300_000 }),
      tx({ title: '스타벅스', krwAmount: 5_000, canceled: true }),
    ]);
    expect(result.includedSpend).toBe(500_000);
    expect(result.excludedSpend).toBe(305_000);
    expect(result.exclusions).toHaveLength(2);
  });

  it('구간을 실적 금액으로 판정한다', () => {
    // 탄탄대로는 40만 / 80만 두 구간이다.
    expect(resolveTier(card, 0)?.threshold).toBe(0);
    expect(resolveTier(card, 399_999)?.threshold).toBe(0);
    expect(resolveTier(card, 400_000)?.threshold).toBe(400_000);
    expect(resolveTier(card, 799_999)?.threshold).toBe(400_000);
    expect(resolveTier(card, 1_600_000)?.threshold).toBe(800_000);
  });
});

// ---------------------------------------------------------------------------
// 혜택 한도
// ---------------------------------------------------------------------------

describe('혜택 한도 계산', () => {
  const tantan = CARDS_BY_ID['kb-tantandaero'];

  it('구간별 한도를 적용 구간에 맞게 푼다', () => {
    const cap = [
      { threshold: 0, cap: 0 },
      { threshold: 300_000, cap: 5_000 },
      { threshold: 700_000, cap: 10_000 },
    ];
    expect(resolveCap(cap, { threshold: 0, label: '', totalBenefitCap: 0 })).toBe(0);
    expect(resolveCap(cap, { threshold: 300_000, label: '', totalBenefitCap: 0 })).toBe(5_000);
    expect(resolveCap(cap, { threshold: 700_000, label: '', totalBenefitCap: 0 })).toBe(10_000);
    expect(resolveCap(cap, null)).toBe(0);
  });

  it('null 한도는 무제한이다', () => {
    expect(resolveCap(null, null)).toBeNull();
    expect(resolveCap(undefined, null)).toBeNull();
  });

  it('실적 미달이면 혜택이 0원이다', () => {
    const result = computeBenefits({
      card: tantan,
      transactions: [tx({ title: '스타벅스', krwAmount: 100_000 })],
      appliedTier: tantan.performance.tiers[0], // 실적 미달 구간
    });
    expect(result.totalUsed).toBe(0);
  });

  it('룰별 월 한도를 넘지 않는다', () => {
    // Amex Blue 스타벅스 20% 할인은 월 5,000원 한도다.
    const amex = CARDS_BY_ID['samsung-amex-blue'];
    const tier = amex.performance.tiers[1]; // 30만 구간
    const result = computeBenefits({
      card: amex,
      transactions: [
        tx({ title: '스타벅스', krwAmount: 20_000, approvedAt: '2026-07-01T01:00:00Z' }),
        tx({ title: '스타벅스', krwAmount: 20_000, approvedAt: '2026-07-02T01:00:00Z' }),
      ],
      appliedTier: tier,
    });
    // 각 4,000원이지만 월 한도 5,000원에서 잘린다
    expect(result.totalUsed).toBe(5_000);
    const coffee = result.usage.find((u) => u.ruleId === 'ab-starbucks');
    expect(coffee?.used).toBe(5_000);
    expect(coffee?.cap).toBe(5_000);
  });

  it('한도는 이용 순서대로 소진된다', () => {
    const amex = CARDS_BY_ID['samsung-amex-blue'];
    const tier = amex.performance.tiers[1];
    const result = computeBenefits({
      card: amex,
      transactions: [
        // 일부러 역순으로 넣는다 — 엔진이 정렬해야 한다
        tx({ title: '스타벅스', krwAmount: 15_000, approvedAt: '2026-07-05T01:00:00Z' }),
        tx({ title: '스타벅스', krwAmount: 30_000, approvedAt: '2026-07-01T01:00:00Z' }),
      ],
      appliedTier: tier,
    });
    // 7/1 건(6,000원 → 5,000원 한도)이 먼저 처리돼 한도를 다 먹는다
    const first = result.appliedBenefits[0];
    expect(first.grossAmount).toBe(6_000);
    expect(first.netAmount).toBe(5_000);
    expect(first.cappedBy).toBe('per-month');
    expect(result.appliedBenefits[1].netAmount).toBe(0);
  });

  it('카드 통합 한도가 룰별 한도보다 우선해서 잘린다', () => {
    const result = computeBenefits({
      card: tantan,
      transactions: [
        tx({ title: '미용실', krwAmount: 200_000, approvedAt: '2026-07-01T01:00:00Z' }),
        tx({ title: '골프연습장', krwAmount: 200_000, approvedAt: '2026-07-02T01:00:00Z' }),
      ],
      appliedTier: tantan.performance.tiers[1], // 40만 구간
    });
    // 미용·골프는 같은 영역(스포츠·미용·결혼)이라 한도 15,000원을 공유한다.
    // 40,000 + 40,000 = 80,000이지만 영역 한도에서 잘린다.
    expect(result.totalUsed).toBe(15_000);
    expect(result.appliedBenefits.at(-1)?.cappedBy).toBe('per-month');
  });

  it('건당 최소금액 미달이면 혜택이 없다', () => {
    const result = computeBenefits({
      card: tantan,
      // 탄탄대로 커피는 건당 2만원 이상이어야 한다
      transactions: [tx({ title: '스타벅스', krwAmount: 15_000 })],
      appliedTier: tantan.performance.tiers[1],
    });
    expect(result.appliedBenefits).toHaveLength(0);
  });

  it('취소 건에는 혜택을 주지 않는다', () => {
    const result = computeBenefits({
      card: tantan,
      transactions: [tx({ title: '스타벅스', krwAmount: 50_000, canceled: true })],
      appliedTier: tantan.performance.tiers[1],
    });
    expect(result.totalUsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 무실적 카드
// ---------------------------------------------------------------------------

describe('무실적 카드', () => {
  it('현대 ZERO는 한도 없이 적립한다', () => {
    const zero = CARDS_BY_ID['hyundai-zero-ed2'];
    const result = computeBenefits({
      card: zero,
      transactions: [tx({ title: '어디든지', krwAmount: 10_000_000 })],
      appliedTier: zero.performance.tiers[0],
    });
    expect(result.totalCap).toBeNull();
    expect(result.totalUsed).toBe(100_000); // 1%
  });

  it('ZERO도 세금 결제에는 적립을 주지 않는다', () => {
    const zero = CARDS_BY_ID['hyundai-zero-ed2'];
    const transactions = [tx({ title: '서울시청지방세', krwAmount: 1_000_000 })];
    const perf = computePerformance(zero, transactions);
    const result = computeBenefits({
      card: zero,
      transactions,
      appliedTier: zero.performance.tiers[0],
      verdicts: perf.verdicts,
    });
    expect(result.totalUsed).toBe(0);
  });

  it('쿠팡와우 프로모션이 종료일 전후로 요율이 바뀐다', () => {
    const wow = CARDS_BY_ID['kb-coupang-wow'];
    const tier = wow.performance.tiers[0];

    const during = computeBenefits({
      card: wow,
      transactions: [tx({ title: '쿠팡', krwAmount: 100_000, approvedAt: '2026-09-01T01:00:00Z' })],
      appliedTier: tier,
    });
    expect(during.totalUsed).toBe(4_000); // 4%

    const after = computeBenefits({
      card: wow,
      transactions: [tx({ title: '쿠팡', krwAmount: 100_000, approvedAt: '2026-11-01T01:00:00Z' })],
      appliedTier: tier,
    });
    expect(after.totalUsed).toBe(2_000); // 2%
  });
});

// ---------------------------------------------------------------------------
// 신한 EV — 하이패스 특수 케이스
// ---------------------------------------------------------------------------

describe('신한 EV', () => {
  const ev = CARDS_BY_ID['shinhan-ev'];

  it('하이패스는 실적에서 빠지지만 캐시백은 받는다', () => {
    const transactions = [tx({ title: '한국도로공사하이패스', krwAmount: 50_000 })];
    const perf = computePerformance(ev, transactions);
    expect(perf.includedSpend).toBe(0); // 실적 제외

    const result = computeBenefits({
      card: ev,
      transactions,
      appliedTier: ev.performance.tiers[1], // 30만 구간
      verdicts: perf.verdicts,
    });
    expect(result.totalUsed).toBe(5_000); // 10% → 월 한도 5,000원
  });

  it('60만 구간에서는 충전 할인이 50%로 올라간다', () => {
    const charge = [tx({ title: '환경부전기차충전', krwAmount: 30_000 })];

    const at30 = computeBenefits({
      card: ev,
      transactions: charge,
      appliedTier: ev.performance.tiers[1], // 30만
    });
    expect(at30.totalUsed).toBe(9_000); // 30%

    const at60 = computeBenefits({
      card: ev,
      transactions: charge,
      appliedTier: ev.performance.tiers[2], // 60만
    });
    expect(at60.totalUsed).toBe(15_000); // 50%
  });
});

// ---------------------------------------------------------------------------
// 스냅샷 — 실적/혜택의 한 달 어긋남
// ---------------------------------------------------------------------------

describe('월 스냅샷', () => {
  const card = CARDS_BY_ID['kb-tantandaero'];

  it('이번 달 혜택 한도는 지난달 실적으로 결정된다', () => {
    const transactions = [
      // 6월에 80만원 사용 → 7월 적용 구간은 80만 (통합 한도 10만원)
      tx({ cardId: card.id, title: '아방가르드', krwAmount: 800_000, approvedAt: '2026-06-15T01:00:00Z' }),
      // 7월에는 아직 1만원만 사용
      tx({ cardId: card.id, title: '아방가르드', krwAmount: 10_000, approvedAt: '2026-07-05T01:00:00Z' }),
    ];

    const snap = buildSnapshot(card, transactions, '2026-07');

    expect(snap.previousSpend).toBe(800_000);
    expect(snap.appliedTier?.threshold).toBe(800_000);
    // 이 카드는 통합 한도가 없다 — 영역별 한도로만 제어된다.
    expect(snap.totalBenefitCap).toBeNull();

    // 이번 달 실적은 별개로 낮다
    expect(snap.currentSpend).toBe(10_000);
    expect(snap.reachedTier?.threshold).toBe(0);
    expect(snap.nextTier?.threshold).toBe(400_000);
    expect(snap.remainingToNextTier).toBe(390_000);
  });

  it('카드사 공식 누계와의 오차를 계산한다', () => {
    const transactions = [
      tx({
        cardId: card.id,
        title: '아방가르드',
        krwAmount: 2_500,
        approvedAt: '2026-07-30T01:32:00Z',
        issuerCumulative: 2_040_509,
      }),
    ];
    const snap = buildSnapshot(card, transactions, '2026-07');
    expect(snap.issuerReportedSpend).toBe(2_040_509);
    expect(snap.reconciliationDelta).toBe(2_500 - 2_040_509);
  });

  it('다른 카드의 거래는 섞이지 않는다', () => {
    const transactions = [
      tx({ cardId: 'kb-tantandaero', krwAmount: 100_000, approvedAt: '2026-07-05T01:00:00Z' }),
      tx({ cardId: 'kb-coupang-wow', krwAmount: 500_000, approvedAt: '2026-07-05T01:00:00Z' }),
    ];
    const snap = buildSnapshot(card, transactions, '2026-07');
    expect(snap.currentSpend).toBe(100_000);
    expect(snap.transactionCount).toBe(1);
  });

  it('월 경계 밖 거래는 제외된다', () => {
    const transactions = [
      // 2026-08-01 00:30 KST — 7월이 아니다
      tx({ cardId: card.id, krwAmount: 999_999, approvedAt: '2026-07-31T15:30:00Z' }),
    ];
    const snap = buildSnapshot(card, transactions, '2026-07');
    expect(snap.currentSpend).toBe(0);
  });
});
