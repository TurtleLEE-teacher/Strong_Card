/**
 * 전월실적 계산 엔진.
 *
 * 핵심 규칙:
 * - 산정 기간: 해당 월 1일 00:00 ~ 말일 23:59:59 (KST), **승인일 기준**
 * - 취소·환불 건은 무조건 제외
 * - 카드별 제외 규칙(세금·상품권·무승인 전표 등)을 적용
 * - 계산은 오직 `krwAmount`(원화 환산액)로만 한다
 */

import type {
  Card,
  ExclusionRule,
  ExclusionSummary,
  PerformanceVerdict,
  SpendTier,
  Transaction,
} from '@/lib/types';
import { normalizeMerchant } from '@/config/merchants';

export interface PerformanceResult {
  /** 실적으로 인정된 금액 */
  includedSpend: number;
  /** 제외된 금액 */
  excludedSpend: number;
  exclusions: ExclusionSummary[];
  /** 거래별 판정 (Notion 역기입 및 상세 화면용) */
  verdicts: Map<string, PerformanceVerdict>;
}

/**
 * 거래 1건이 실적에 산입되는지 판정한다.
 * 제외되면 그 사유를, 산입되면 '인정'을 돌려준다.
 */
export function judgeTransaction(card: Card, tx: Transaction): PerformanceVerdict {
  // 1. 취소·환불은 카드 무관 무조건 제외
  if (tx.canceled || tx.paymentKind === '취소·환불') {
    return '제외-취소';
  }

  // 2. 해외결제 산입 여부
  if (!card.performance.countsForeignSpend && tx.paymentKind === '해외') {
    return '제외-기타';
  }

  // 3. 카드별 제외 규칙
  const haystack = normalizeMerchant(
    [tx.title, tx.merchant].filter(Boolean).join(' '),
  );

  for (const rule of card.performance.exclusions) {
    if (matchesExclusion(rule, haystack, tx)) {
      return rule.verdict;
    }
  }

  return '인정';
}

function matchesExclusion(
  rule: ExclusionRule,
  normalizedMerchant: string,
  tx: Transaction,
): boolean {
  if (rule.keywords?.length) {
    for (const kw of rule.keywords) {
      if (normalizedMerchant.includes(normalizeMerchant(kw))) return true;
    }
  }
  if (rule.categories?.length && tx.category) {
    if (rule.categories.includes(tx.category)) return true;
  }
  return false;
}

/**
 * 한 달치 거래에서 실적을 집계한다.
 * `transactions`는 **이미 해당 월·해당 카드로 필터링돼 있어야 한다.**
 */
export function computePerformance(card: Card, transactions: Transaction[]): PerformanceResult {
  let includedSpend = 0;
  let excludedSpend = 0;
  const verdicts = new Map<string, PerformanceVerdict>();
  const buckets = new Map<PerformanceVerdict, { amount: number; count: number }>();

  for (const tx of transactions) {
    const verdict = judgeTransaction(card, tx);
    verdicts.set(tx.id, verdict);

    if (verdict === '인정') {
      includedSpend += tx.krwAmount;
    } else {
      excludedSpend += tx.krwAmount;
      const b = buckets.get(verdict) ?? { amount: 0, count: 0 };
      b.amount += tx.krwAmount;
      b.count += 1;
      buckets.set(verdict, b);
    }
  }

  const exclusions: ExclusionSummary[] = [...buckets.entries()]
    .map(([verdict, b]) => ({ verdict, amount: b.amount, count: b.count }))
    .sort((a, b) => b.amount - a.amount);

  return { includedSpend, excludedSpend, exclusions, verdicts };
}

/**
 * 실적 금액으로 달성 구간을 찾는다.
 * tiers는 threshold 오름차순이라고 가정한다.
 */
export function resolveTier(card: Card, spend: number): SpendTier | null {
  const tiers = card.performance.tiers;
  if (tiers.length === 0) return null;

  let reached: SpendTier | null = null;
  for (const tier of tiers) {
    if (spend >= tier.threshold) reached = tier;
    else break;
  }
  return reached;
}

/** 아직 못 넘은 다음 구간. 최상위 구간이면 null. */
export function resolveNextTier(card: Card, spend: number): SpendTier | null {
  for (const tier of card.performance.tiers) {
    if (spend < tier.threshold) return tier;
  }
  return null;
}

/** 다음 구간까지 남은 금액. 다음 구간이 없으면 0. */
export function remainingToNextTier(card: Card, spend: number): number {
  const next = resolveNextTier(card, spend);
  return next ? Math.max(0, next.threshold - spend) : 0;
}
