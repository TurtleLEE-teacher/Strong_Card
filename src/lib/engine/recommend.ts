/**
 * "이 결제, 어느 카드로?" 추천 엔진.
 *
 * 더쎈카드류 앱의 핵심 기능이자, 이 앱이 단순 조회 도구를 넘어서는 지점이다.
 *
 * 제대로 하려면 **남은 한도**를 봐야 한다. 요율만 보고 추천하면
 * "탄탄대로 커피 10%"를 계속 권하는데 정작 그 한도는 이미 소진돼 있어
 * 실제로는 1원도 안 나오는 사태가 벌어진다. 요율이 아니라 **실제로 받을
 * 금액**으로 줄을 세운다.
 */

import type {
  BenefitRule,
  Card,
  CardId,
  CardMonthlySnapshot,
  PerformanceVerdict,
  Transaction,
  TxCategory,
} from '@/lib/types';
import { resolveCap, selectRule, UsageCounters } from './benefits';
import { excludesSpendFromPerformance, judgeTransaction } from './performance';
import { isReversal } from './reversal';
import { percent } from '@/lib/format';

export interface PurchaseQuery {
  merchant: string;
  amount: number;
  category?: TxCategory | null;
  /** 결제 시점. 프로모션 유효기간 판정에 쓴다. 기본값은 지금. */
  at?: string;
}

export interface Recommendation {
  cardId: CardId;
  cardName: string;
  slot: number;
  /** 적용될 혜택 이름. 매칭되는 룰이 없으면 null. */
  ruleLabel: string | null;
  ruleType: 'discount' | 'point' | null;
  /** 표시용 요율. 매칭 룰이 없으면 null. */
  rateLabel: string | null;
  /** 한도를 반영한, 실제로 받을 금액 */
  expectedBenefit: number;
  /** 한도를 반영하기 전 이론값 */
  grossBenefit: number;
  /** 한도에 걸려 못 받는 금액 */
  cappedAmount: number;
  cappedBy: 'none' | 'per-tx' | 'per-month' | 'total';
  /** 실효 환원율 */
  effectiveRate: number;
  /**
   * 왜 이 금액인지에 대한 보충 설명. 한도에 걸리지 않았고 혜택도
   * 정상이면 null — 룰 이름이 이미 다 말해주므로 덧붙일 게 없다.
   */
  reason: string | null;
  /**
   * 이 결제가 실적에 미치는 영향.
   * 다음 달 혜택이 걸린 문제라 당장의 할인액만큼 중요할 수 있다.
   */
  performanceNote: string | null;
  /**
   * 이 결제가 **이 카드의 실적에 잡히는지.**
   *
   * 'counts'   산입된다
   * 'excluded' 안 잡힌다 — 제외 항목(세금·상품권·무승인)이거나, 이 할인을
   *            받는 순간 매출 전체가 빠지는 혜택(탄탄대로 Trendy)이거나
   * 'none'     실적 조건이 없는 카드라 따질 게 없다
   *
   * performanceNote의 색과 정렬 순서가 이 값에 달려 있다. 안 잡히는 결제를
   * 'counts'로 두면 화면이 초록색으로 "구간 달성"이라고 거짓말한다.
   */
  performanceImpact: 'counts' | 'excluded' | 'none';
}

/**
 * 스냅샷에 기록된 월별 적용 횟수를 카운터로 복원한다.
 * 일 단위 제한은 조회 시점의 '오늘' 기록이 없으므로 반영하지 않는다 —
 * 과소 추천보다 과다 추천이 덜 위험한 쪽이라 월 제한만 본다.
 */
function restoreCounters(card: Card, snapshot: CardMonthlySnapshot): UsageCounters {
  const counters = new UsageCounters();
  for (const rule of card.benefits) {
    const used = snapshot.ruleCounts?.[rule.id] ?? 0;
    for (let i = 0; i < used; i += 1) {
      counters.record(rule, {
        ...EMPTY_TX,
        // 서로 다른 날짜로 기록해 일 단위 제한에 걸리지 않게 한다
        approvedAt: new Date(Date.UTC(2000, 0, 1 + i)).toISOString(),
      });
    }
  }
  return counters;
}

/** restoreCounters 전용 더미 거래 */
const EMPTY_TX: Transaction = {
  id: '__counter__',
  title: '',
  merchant: null,
  rawAmount: 0,
  currency: 'KRW',
  krwAmount: 0,
  approvedAt: '2000-01-01T00:00:00.000Z',
  issuer: null,
  last4: null,
  cardId: null,
  category: null,
  paymentKind: null,
  installmentMonths: null,
  canceled: false,
  rawMessage: null,
  issuerCumulative: null,
  alertStatus: null,
};

/** 조회를 계산 엔진이 이해하는 가짜 거래로 바꾼다. */
function toPseudoTransaction(query: PurchaseQuery): Transaction {
  return {
    id: '__pseudo__',
    title: query.merchant,
    merchant: query.merchant,
    rawAmount: query.amount,
    currency: 'KRW',
    krwAmount: query.amount,
    approvedAt: query.at ?? new Date().toISOString(),
    issuer: null,
    last4: null,
    cardId: null,
    category: query.category ?? null,
    paymentKind: '일시불',
    installmentMonths: null,
    canceled: false,
    rawMessage: null,
    issuerCumulative: null,
    alertStatus: null,
  };
}

/** 이 룰의 남은 월 한도. null이면 무제한. */
function remainingRuleCap(
  snapshot: CardMonthlySnapshot,
  rule: BenefitRule,
): number | null {
  const cap = resolveCap(rule.capPerMonth, snapshot.appliedTier);
  if (cap === null) return null;
  // 한도를 공유하는 룰은 usage가 capGroup 키로 합쳐져 있다. ruleId로만
  // 찾으면 이미 쓴 금액을 못 보고 남은 한도를 통째로 있다고 착각한다.
  const key = rule.capGroup ?? rule.id;
  const usage = snapshot.benefitUsage.find((u) => u.ruleId === key);
  return Math.max(0, cap - (usage?.used ?? 0));
}

/** 카드 통합 한도의 남은 금액. null이면 무제한. */
function remainingTotalCap(snapshot: CardMonthlySnapshot): number | null {
  if (snapshot.totalBenefitCap === null) return null;
  return Math.max(0, snapshot.totalBenefitCap - snapshot.totalBenefitUsed);
}

/**
 * 카드 한 장이 이 결제에 줄 혜택을 계산한다.
 * 남은 한도를 반영하므로 "지금 실제로 받을 금액"이다.
 */
export function estimateBenefit(
  card: Card,
  snapshot: CardMonthlySnapshot,
  query: PurchaseQuery,
): Recommendation {
  const pseudo = toPseudoTransaction(query);
  // 이번 달 이미 소진한 횟수를 반영해 룰을 고른다. 이게 없으면
  // 월 5회를 다 쓴 편의점 할인을 계속 추천하게 된다.
  const counters = restoreCounters(card, snapshot);
  const rule = selectRule(card, pseudo, snapshot.appliedTier, counters);

  const base: Omit<Recommendation, 'reason' | 'performanceNote' | 'performanceImpact'> = {
    cardId: card.id,
    cardName: card.shortName,
    slot: card.slot,
    ruleLabel: rule?.label ?? null,
    ruleType: rule?.type ?? null,
    rateLabel: rule ? formatRate(rule.rate) : null,
    expectedBenefit: 0,
    grossBenefit: 0,
    cappedAmount: 0,
    cappedBy: 'none',
    effectiveRate: 0,
  };

  // 세금·상품권 같은 제외 항목인지 먼저 판정한다. 혜택 안내와 실적 안내가
  // 같은 판정을 봐야 두 줄이 서로 다른 말을 하지 않는다.
  const verdict = judgeTransaction(card, pseudo);

  /**
   * 실적 안내를 만든다.
   *
   * 받을 혜택액을 인자로 받는 이유: 탄탄대로 Trendy는 **할인을 실제로 받은
   * 이용건**만 실적에서 빠진다. 한도가 소진돼 0원이면 실적에는 그대로 잡히므로,
   * 금액을 모르고는 어느 쪽인지 말할 수 없다.
   */
  const performance = (benefit: number) =>
    describePerformanceImpact(card, snapshot, query.amount, {
      verdict,
      benefitedExclusion:
        rule !== null && benefit > 0 && excludesSpendFromPerformance(card, rule),
    });

  // 구간이 0인 이유가 '미달'인지 '몰라서'인지 구분한다.
  // 지난달 거래가 없으면 실적을 계산할 수 없을 뿐, 실제 카드는 혜택을
  // 주고 있을 수 있다. '미달'이라고 단정하면 멀쩡한 카드를 쓰지 말라고
  // 권하게 된다.
  const tierUnknown = snapshot.previousSpendSource === 'unknown';
  const noTier = card.performance.required && (snapshot.appliedTier?.threshold ?? 0) === 0;
  const noTierReason = tierUnknown
    ? '지난달 거래 기록이 없어 전월실적을 알 수 없습니다 (설정에서 직접 입력)'
    : '전월 실적 미달로 혜택이 적용되지 않습니다';

  if (!rule) {
    return {
      ...base,
      reason: noTier ? noTierReason : '이 가맹점에 적용되는 혜택이 없습니다',
      ...performance(0),
    };
  }

  // 구간이 없으면 그 사실을 먼저 말한다.
  // 이 검사가 없으면 "통합 한도를 이미 다 썼습니다"로 나온다 — 한도 계산상
  // 틀린 말은 아니지만, 사용자가 해야 할 일(실적 채우기 / 실적 입력)을 가린다.
  if (noTier) {
    return { ...base, reason: noTierReason, ...performance(0) };
  }

  // 세금·상품권 같은 제외 항목에는 혜택이 붙지 않는다.
  // 이 검사를 빼먹으면 catch-all 룰(쿠팡와우 그 외 1.2%, ZERO 전 가맹점 1%)이
  // 지방세 결제에 달라붙어 "세금은 쿠팡와우로!"라고 권하게 된다.
  if (verdict !== '인정' && !rule.applyToExcludedSpend) {
    return {
      ...base,
      reason: `${verdict.replace('제외-', '')} 항목이라 혜택 대상이 아닙니다`,
      ...performance(0),
      // 실적 줄은 비운다. 바로 윗줄이 이미 제외 항목이라고 말했으므로
      // 같은 이유를 두 번 쓰게 된다.
      performanceNote: null,
    };
  }

  const gross = Math.floor(query.amount * rule.rate);
  // '할인 전 이용금액' 상한. 추천도 원장과 같은 식으로 깎아야 화면 두 곳이
  // 서로 다른 금액을 말하지 않는다.
  const eligibleAmount =
    rule.maxEligibleAmountPerTx !== undefined
      ? Math.min(query.amount, rule.maxEligibleAmountPerTx)
      : query.amount;
  let amount = Math.floor(eligibleAmount * rule.rate);
  let cappedBy: Recommendation['cappedBy'] = amount < gross ? 'per-tx' : 'none';

  if (rule.capPerTx !== undefined && amount > rule.capPerTx) {
    amount = rule.capPerTx;
    cappedBy = 'per-tx';
  }

  const ruleRemaining = remainingRuleCap(snapshot, rule);
  if (ruleRemaining !== null && amount > ruleRemaining) {
    amount = ruleRemaining;
    cappedBy = 'per-month';
  }

  const totalRemaining = remainingTotalCap(snapshot);
  if (totalRemaining !== null && amount > totalRemaining) {
    amount = totalRemaining;
    cappedBy = 'total';
  }

  return {
    ...base,
    expectedBenefit: amount,
    grossBenefit: gross,
    cappedAmount: gross - amount,
    cappedBy,
    effectiveRate: query.amount > 0 ? amount / query.amount : 0,
    reason: describeReason(rule, cappedBy, ruleRemaining, totalRemaining),
    ...performance(amount),
  };
}

/**
 * 요율을 표시용 문자열로.
 * 포맷 규칙은 format.ts의 percent() 한 곳에만 둔다 — 두 군데서 따로
 * 반올림하면 같은 값이 화면마다 다르게 보인다.
 */
export function formatRate(rate: number): string {
  return percent(rate);
}

/**
 * 왜 이 금액인지 설명한다.
 *
 * 한도에 걸리지 않았다면 null을 돌려준다 — 요율은 이미 룰 이름
 * ('커피 10% 할인')에 들어 있어서, 여기서 또 말하면
 * "커피 10% 할인 · 10% 할인"처럼 같은 말을 두 번 하게 된다.
 */
function describeReason(
  rule: BenefitRule,
  cappedBy: Recommendation['cappedBy'],
  ruleRemaining: number | null,
  totalRemaining: number | null,
): string | null {
  switch (cappedBy) {
    case 'per-tx':
      return '건당 한도에서 잘림';
    case 'per-month':
      return ruleRemaining === 0
        ? '이번 달 이 혜택의 한도를 이미 다 썼습니다'
        : '남은 한도까지만 적용';
    case 'total':
      return totalRemaining === 0
        ? '카드 통합 한도를 이미 다 썼습니다'
        : '통합 한도 남은 만큼만 적용';
    default:
      return null;
  }
}

/**
 * 이 결제가 실적에 미치는 영향을 설명한다.
 *
 * 당장의 할인액이 작아도 다음 구간을 넘길 수 있다면 그게 더 큰 이득일 수
 * 있다. 숫자로 합산하지는 않는다 — 다음 달에 실제로 그 혜택을 쓸지는
 * 알 수 없으므로, 판단 재료만 제공한다.
 *
 * **먼저 이 결제가 실적에 잡히기는 하는지부터 따진다.** 예전에는 금액만 보고
 * "이 결제로 40만원 구간 달성"이라고 했는데, 그 결제가 세금이거나 하이패스면
 * (applyToExcludedSpend 룰) 실적에는 1원도 안 잡힌다. 탄탄대로 Trendy는 더
 * 나쁘다 — 할인을 받는 바로 그 이유로 매출 전체가 실적에서 빠지므로,
 * 원래 문구는 사실을 정확히 거꾸로 말하고 있었다.
 */
function describePerformanceImpact(
  card: Card,
  snapshot: CardMonthlySnapshot,
  amount: number,
  context: { verdict: PerformanceVerdict; benefitedExclusion: boolean },
): Pick<Recommendation, 'performanceNote' | 'performanceImpact'> {
  // 무실적 카드는 실적이라는 개념 자체가 없다.
  if (!card.performance.required) {
    return { performanceNote: null, performanceImpact: 'none' };
  }

  // 할인을 받는 순간 매출 전체가 실적에서 빠지는 혜택 (탄탄대로 Trendy).
  // 20% 할인보다 40만 구간을 놓치는 손해가 더 클 수 있어 반드시 알려야 한다.
  if (context.benefitedExclusion) {
    return {
      performanceNote: `이 할인을 받으면 결제액 전체가 실적에서 빠집니다${remainingTail(snapshot)}`,
      performanceImpact: 'excluded',
    };
  }

  if (context.verdict !== '인정') {
    return {
      performanceNote: `${context.verdict.replace('제외-', '')} 항목이라 이 카드 실적에는 안 잡힙니다`,
      performanceImpact: 'excluded',
    };
  }

  if (!snapshot.nextTier) return { performanceNote: null, performanceImpact: 'counts' };

  const remaining = snapshot.remainingToNextTier;
  if (amount >= remaining) {
    const cap = snapshot.nextTier.totalBenefitCap;
    return {
      performanceNote:
        cap === null
          ? `이 결제로 ${snapshot.nextTier.label} 구간 달성`
          : `이 결제로 ${snapshot.nextTier.label} 구간 달성 → 다음 달 한도 ${cap.toLocaleString('ko-KR')}원`,
      performanceImpact: 'counts',
    };
  }

  // 근접했을 때만 알린다. 100만원 남은 상황에서 "94만원 남음"은 정보가 아니다.
  if (remaining - amount <= 100_000) {
    return {
      performanceNote: `이 결제 후 ${snapshot.nextTier.label} 구간까지 ${(remaining - amount).toLocaleString('ko-KR')}원`,
      performanceImpact: 'counts',
    };
  }

  return { performanceNote: null, performanceImpact: 'counts' };
}

/** "…빠집니다 (40만원 구간까지 120,000원 그대로)" — 손해의 크기를 숫자로 보여준다. */
function remainingTail(snapshot: CardMonthlySnapshot): string {
  if (!snapshot.nextTier) return '';
  return ` (${snapshot.nextTier.label} 구간까지 ${snapshot.remainingToNextTier.toLocaleString('ko-KR')}원 그대로)`;
}

/**
 * 모든 활성 카드를 예상 혜택 내림차순으로 정렬한다.
 *
 * 동점이면 **실적을 채워 주는** 카드를 앞세운다 — 같은 값이면 구간에
 * 가까워지는 쪽이 낫다. 안내 문구가 있다고 다 좋은 소식이 아니므로
 * (실적에서 빠진다는 경고도 문구다) impact까지 함께 본다.
 */
export function recommendCards(
  cards: Card[],
  snapshots: CardMonthlySnapshot[],
  query: PurchaseQuery,
): Recommendation[] {
  const snapshotById = new Map(snapshots.map((s) => [s.cardId, s]));

  return cards
    .map((card) => {
      const snapshot = snapshotById.get(card.id);
      return snapshot ? estimateBenefit(card, snapshot, query) : null;
    })
    .filter((r): r is Recommendation => r !== null)
    .sort((a, b) => {
      if (b.expectedBenefit !== a.expectedBenefit) {
        return b.expectedBenefit - a.expectedBenefit;
      }
      const builds = (r: Recommendation) =>
        r.performanceImpact === 'counts' && r.performanceNote ? 1 : 0;
      return builds(b) - builds(a);
    });
}

// ---------------------------------------------------------------------------
// 놓친 혜택
// ---------------------------------------------------------------------------

export interface MissedBenefit {
  transactionId: string;
  merchant: string;
  amount: number;
  approvedAt: string;
  usedCardId: CardId;
  usedCardName: string;
  actualBenefit: number;
  /** 더 나았을 카드 */
  bestCardId: CardId;
  bestCardName: string;
  bestBenefit: number;
  bestRuleLabel: string | null;
  /** 놓친 금액 */
  delta: number;
}

/**
 * 이미 결제한 거래를 다른 카드로 했다면 얼마를 더 받았을지 계산한다.
 *
 * ⚠️ 이건 **추정치**다. 실제로 다른 카드를 썼다면 그 카드의 한도 소진
 * 순서도 달라졌을 테니, 여기서 나온 숫자가 그대로 실현되지는 않는다.
 * 월말 시점의 남은 한도를 기준으로 계산하므로 보수적인 쪽에 가깝다.
 * 화면에서 반드시 '추정'임을 밝힐 것.
 */
export function findMissedBenefits(
  cards: Card[],
  snapshots: CardMonthlySnapshot[],
  transactions: Transaction[],
  options: { minDelta?: number } = {},
): MissedBenefit[] {
  const minDelta = options.minDelta ?? 500;
  const snapshotById = new Map(snapshots.map((s) => [s.cardId, s]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const missed: MissedBenefit[] = [];

  for (const tx of transactions) {
    // 취소 전표(음수)는 '더 나은 카드'를 따질 결제가 아니다. 금액이 음수라
    // 추천 엔진에 넣으면 혜택도 음수로 나와 엉뚱한 카드를 권하게 된다.
    if (!tx.cardId || tx.canceled || isReversal(tx)) continue;
    const usedSnapshot = snapshotById.get(tx.cardId);
    const usedCard = cardById.get(tx.cardId);
    if (!usedSnapshot || !usedCard) continue;

    const actual =
      usedSnapshot.appliedBenefits.find((b) => b.transactionId === tx.id)?.netAmount ?? 0;

    const query: PurchaseQuery = {
      merchant: tx.merchant ?? tx.title,
      amount: tx.krwAmount,
      category: tx.category,
      at: tx.approvedAt,
    };

    let best: Recommendation | null = null;
    for (const card of cards) {
      if (card.id === tx.cardId) continue;
      const snapshot = snapshotById.get(card.id);
      if (!snapshot) continue;
      const estimate = estimateBenefit(card, snapshot, query);
      if (!best || estimate.expectedBenefit > best.expectedBenefit) best = estimate;
    }

    if (!best) continue;
    const delta = best.expectedBenefit - actual;
    if (delta < minDelta) continue;

    missed.push({
      transactionId: tx.id,
      merchant: tx.title,
      amount: tx.krwAmount,
      approvedAt: tx.approvedAt,
      usedCardId: tx.cardId,
      usedCardName: usedCard.shortName,
      actualBenefit: actual,
      bestCardId: best.cardId,
      bestCardName: best.cardName,
      bestBenefit: best.expectedBenefit,
      bestRuleLabel: best.ruleLabel,
      delta,
    });
  }

  return missed.sort((a, b) => b.delta - a.delta);
}
