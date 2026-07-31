/**
 * 카드 × 월 스냅샷 조립기.
 *
 * 실적과 혜택은 **한 달 어긋나 있다**. 이 파일이 그 어긋남을 처리하는
 * 유일한 지점이므로, 여기 로직이 틀리면 화면 전체가 틀린다.
 *
 *   이번 달 실적  → 다음 달 구간을 결정      (currentSpend, reachedTier)
 *   지난달 실적  → 이번 달 구간을 이미 결정  (previousSpend, appliedTier)
 */

import type {
  Card,
  PerformanceVerdict,
  CardMonthlySnapshot,
  SpendTier,
  Transaction,
} from '@/lib/types';
import { monthRangeUtc, previousMonthKey, toMonthKey, type MonthKey } from '@/lib/date';
import {
  type PerformanceResult,
  computePerformance,
  remainingToNextTier,
  resolveNextTier,
  resolveTier,
} from './performance';
import { computeBenefits } from './benefits';

/** 해당 카드·해당 월(KST)의 거래만 골라낸다. */
export function filterTransactions(
  transactions: Transaction[],
  cardId: string,
  month: MonthKey,
): Transaction[] {
  const { startUtc, endUtc } = monthRangeUtc(month);
  return transactions.filter((tx) => {
    if (tx.cardId !== cardId) return false;
    const t = new Date(tx.approvedAt).getTime();
    return t >= startUtc.getTime() && t < endUtc.getTime();
  });
}

/**
 * 카드사가 문자에 찍어준 공식 누계 중 **가장 최근 값**을 고른다.
 * 누계는 단조 증가하므로 최신 거래의 값이 곧 그 달의 현재 누계다.
 */
function latestIssuerCumulative(transactions: Transaction[]): number | null {
  const withValue = transactions
    .filter((tx) => tx.issuerCumulative !== null)
    .sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
  return withValue[0]?.issuerCumulative ?? null;
}

/**
 * 실적을 계산하되, "이 혜택을 받은 건은 실적에서 뺀다"는 약관을 반영한다.
 *
 * 탄탄대로 약관: "이용실적 제외 대상 — 'Trendy서비스' 받은 이용건(해당 매출 전체)".
 * 어떤 거래가 Trendy 할인을 받았는지는 혜택 계산이 끝나야 알 수 있으므로
 * 2패스로 돈다.
 *
 *   1패스  일반 제외 규칙만으로 실적을 판정한다 (혜택 계산의 입력)
 *   혜택   1패스 판정을 써서 할인을 매긴다
 *   2패스  할인 받은 건을 실적에서 빼고 다시 센다
 *
 * 혜택은 다시 계산하지 않는다 — 할인은 그대로 받고, 빠지는 건 실적뿐이다.
 * 이 정책이 없는 카드는 1패스 결과를 그대로 쓴다.
 *
 * **1패스 판정을 따로 돌려준다.** 최종 혜택 계산은 반드시 이 값을 써야 한다.
 * 2패스 판정을 쓰면 스스로를 죽인다 — Trendy 할인을 받아서 실적에서 빠졌는데,
 * 그 '제외' 판정을 보고 혜택 엔진이 다시 할인을 거부해 0원이 된다.
 */
interface AdjustedPerformance {
  result: PerformanceResult;
  /** 혜택 계산에 넘길 판정 (보정 전) */
  baseVerdicts: Map<string, PerformanceVerdict>;
}

function adjustedPerformance(
  card: Card,
  transactions: Transaction[],
  appliedTier: SpendTier | null,
  month: MonthKey,
): AdjustedPerformance {
  const first = computePerformance(card, transactions);
  const groups = card.performance.excludeBenefitedGroups;
  if (!groups?.length) return { result: first, baseVerdicts: first.verdicts };

  const benefits = computeBenefits({
    card,
    transactions,
    appliedTier,
    verdicts: first.verdicts,
    month,
  });

  const targets = new Set(groups);
  const excluded = new Set(
    benefits.appliedBenefits
      .filter((b) => b.netAmount > 0)
      .filter((b) => {
        const rule = card.benefits.find((r) => r.id === b.ruleId);
        return targets.has(b.ruleId) || (rule?.capGroup ? targets.has(rule.capGroup) : false);
      })
      .map((b) => b.transactionId),
  );
  if (excluded.size === 0) return { result: first, baseVerdicts: first.verdicts };

  return {
    result: computePerformance(card, transactions, {
      forceExclude: excluded,
      forceExcludeVerdict: '제외-기타',
    }),
    baseVerdicts: first.verdicts,
  };
}

export function buildSnapshot(
  card: Card,
  allTransactions: Transaction[],
  month: MonthKey,
): CardMonthlySnapshot {
  const prevMonth = previousMonthKey(month);
  const current = filterTransactions(allTransactions, card.id, month);
  const previous = filterTransactions(allTransactions, card.id, prevMonth);

  // --- 지난달 실적 → 이번 달 적용 구간 ---
  // 지난달 실적도 보정 대상이다(탄탄대로 Trendy). 그러려면 지난달에 적용된
  // 구간이 필요하고, 그건 지지난달 실적이 정한다. 거기서 멈춘다 —
  // 더 거슬러 올라가도 이번 달 숫자에 미치는 영향은 무시할 만하다.
  const prevPrev = filterTransactions(allTransactions, card.id, previousMonthKey(prevMonth));
  const prevAppliedTier = resolveTier(card, computePerformance(card, prevPrev).includedSpend);
  const prevPerf = adjustedPerformance(card, previous, prevAppliedTier, prevMonth).result;
  const appliedTier = resolveTier(card, prevPerf.includedSpend);

  // --- 이번 달 실적 (다음 달 구간을 결정) ---
  const { result: perf, baseVerdicts } = adjustedPerformance(card, current, appliedTier, month);
  const reachedTier = resolveTier(card, perf.includedSpend);
  const nextTier = resolveNextTier(card, perf.includedSpend);

  // --- 이번 달 혜택 (적용 구간 기준으로 한도를 건다) ---
  const benefits = computeBenefits({
    card,
    transactions: current,
    appliedTier,
    // 보정 전 판정을 쓴다. 보정 후 판정을 쓰면 Trendy 할인이 스스로를 지운다.
    verdicts: baseVerdicts,
    month,
  });

  const issuerReportedSpend = latestIssuerCumulative(current);

  return {
    cardId: card.id,
    month,

    currentSpend: perf.includedSpend,
    excludedSpend: perf.excludedSpend,
    exclusions: perf.exclusions,
    reachedTier,
    nextTier,
    remainingToNextTier: remainingToNextTier(card, perf.includedSpend),
    issuerReportedSpend,
    reconciliationDelta:
      issuerReportedSpend === null ? null : perf.includedSpend - issuerReportedSpend,

    previousSpend: prevPerf.includedSpend,
    appliedTier,
    benefitUsage: benefits.usage,
    appliedBenefits: benefits.appliedBenefits,
    totalBenefitUsed: benefits.totalUsed,
    totalBenefitCap: benefits.totalCap,

    ruleCounts: benefits.ruleCounts,
    unmatchedTransactionIds: benefits.unmatchedTransactionIds,
    transactionCount: current.length,
  };
}

/** 활성 카드 전체의 스냅샷 */
export function buildAllSnapshots(
  cards: Card[],
  transactions: Transaction[],
  month: MonthKey,
): CardMonthlySnapshot[] {
  return cards.map((card) => buildSnapshot(card, transactions, month));
}

/** 카드에 매핑되지 않은 거래 (뒷4자리 파싱 실패 등) */
export function findUnmappedTransactions(
  transactions: Transaction[],
  month: MonthKey,
): Transaction[] {
  const { startUtc, endUtc } = monthRangeUtc(month);
  return transactions.filter((tx) => {
    if (tx.cardId !== null) return false;
    const t = new Date(tx.approvedAt).getTime();
    return t >= startUtc.getTime() && t < endUtc.getTime();
  });
}

export { toMonthKey };
