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
  Transaction,
  TxCategory,
} from '@/lib/types';
import { resolveCap, selectRule } from './benefits';
import { judgeTransaction } from './performance';

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
}

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
  const usage = snapshot.benefitUsage.find((u) => u.ruleId === rule.id);
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
  const rule = selectRule(card, pseudo, snapshot.appliedTier);

  const base: Omit<Recommendation, 'reason' | 'performanceNote'> = {
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

  const performanceNote = describePerformanceImpact(card, snapshot, query.amount);

  if (!rule) {
    return {
      ...base,
      reason:
        card.performance.required && (snapshot.appliedTier?.threshold ?? 0) === 0
          ? '전월 실적 미달로 혜택이 적용되지 않습니다'
          : '이 가맹점에 적용되는 혜택이 없습니다',
      performanceNote,
    };
  }

  // 세금·상품권 같은 제외 항목에는 혜택이 붙지 않는다.
  // 이 검사를 빼먹으면 catch-all 룰(쿠팡와우 그 외 1.2%, ZERO 전 가맹점 1%)이
  // 지방세 결제에 달라붙어 "세금은 쿠팡와우로!"라고 권하게 된다.
  const verdict = judgeTransaction(card, pseudo);
  if (verdict !== '인정' && !rule.applyToExcludedSpend) {
    return {
      ...base,
      reason: `${verdict.replace('제외-', '')} 항목이라 혜택 대상이 아닙니다`,
      // 실적에도 안 잡히므로 실적 안내를 띄우면 거짓말이 된다.
      performanceNote: null,
    };
  }

  const gross = Math.floor(query.amount * rule.rate);
  let amount = gross;
  let cappedBy: Recommendation['cappedBy'] = 'none';

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
    performanceNote,
  };
}

/**
 * 요율을 표시용 문자열로. 반올림으로 값을 왜곡하지 않는다.
 * 0.012 → '1.2%', 0.2 → '20%', 0.002 → '0.2%'
 */
export function formatRate(rate: number): string {
  const pct = rate * 100;
  return `${Number(pct.toFixed(2))}%`;
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
 */
function describePerformanceImpact(
  card: Card,
  snapshot: CardMonthlySnapshot,
  amount: number,
): string | null {
  if (!card.performance.required || !snapshot.nextTier) return null;

  const remaining = snapshot.remainingToNextTier;
  if (amount >= remaining) {
    const cap = snapshot.nextTier.totalBenefitCap;
    return cap === null
      ? `이 결제로 ${snapshot.nextTier.label} 구간 달성`
      : `이 결제로 ${snapshot.nextTier.label} 구간 달성 → 다음 달 한도 ${cap.toLocaleString('ko-KR')}원`;
  }

  // 근접했을 때만 알린다. 100만원 남은 상황에서 "94만원 남음"은 정보가 아니다.
  if (remaining - amount <= 100_000) {
    return `이 결제 후 ${snapshot.nextTier.label} 구간까지 ${(remaining - amount).toLocaleString('ko-KR')}원`;
  }

  return null;
}

/**
 * 모든 활성 카드를 예상 혜택 내림차순으로 정렬한다.
 *
 * 동점이면 실적 영향이 있는 카드를 앞세운다 — 같은 값이면 실적을
 * 채우는 쪽이 낫다.
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
      const aHasNote = a.performanceNote ? 1 : 0;
      const bHasNote = b.performanceNote ? 1 : 0;
      return bHasNote - aHasNote;
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
    if (!tx.cardId || tx.canceled) continue;
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
