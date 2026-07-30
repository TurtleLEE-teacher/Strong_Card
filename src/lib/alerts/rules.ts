/**
 * 알림 규칙 엔진.
 *
 * 순수 함수로만 구성한다 — 스냅샷을 받아 "보내야 할 알림 목록"을 돌려줄 뿐,
 * 실제 발송이나 중복 검사는 하지 않는다. 그래야 테스트가 가능하다.
 *
 * 중복 방지는 `key`(멱등 키)로 한다. 같은 키가 이미 Alert_Log에 있으면
 * 발송기가 건너뛴다. 크론이 몇 번을 돌든 같은 알림은 한 번만 나간다.
 */

import type { CardMonthlySnapshot, Card, CardId } from '@/lib/types';
import type { MonthKey } from '@/lib/date';
import { won } from '@/lib/format';

export type AlertType = '혜택적용' | '실적미달' | '실적달성' | '한도소진임박';

export interface Alert {
  /** 멱등 키. 이 값이 Alert_Log에 있으면 재발송하지 않는다. */
  key: string;
  type: AlertType;
  cardId: CardId;
  month: MonthKey;
  title: string;
  body: string;
  /** 알림 탭 시 열 경로 */
  url: string;
}

/** 실적 미달 경고를 보낼 시점 (월말까지 남은 일수) */
export const WARNING_DAYS = [7, 3, 1] as const;

/** 혜택 한도 소진 경고 임계값 */
export const CAP_WARNING_RATIOS = [0.8, 1] as const;

export interface EvaluateInput {
  card: Card;
  snapshot: CardMonthlySnapshot;
  /** 이번 달 남은 일수 (KST) */
  daysRemaining: number;
}

/**
 * 월 단위 알림(실적 미달·달성·한도 소진)을 평가한다.
 * 거래 단위 알림(혜택 적용)은 transactionAlerts()에서 따로 만든다 —
 * 중복 방지 방식이 다르기 때문이다(거래 행의 `알림 상태` 속성 사용).
 */
export function evaluateMonthlyAlerts({
  card,
  snapshot,
  daysRemaining,
}: EvaluateInput): Alert[] {
  const alerts: Alert[] = [];
  const { month, cardId } = snapshot;
  const url = `/card/${cardId}`;

  // --- 1. 실적 미달 경고 ---
  // 무실적 카드는 채울 실적이 없으므로 대상이 아니다.
  if (card.performance.required && snapshot.nextTier && snapshot.remainingToNextTier > 0) {
    if ((WARNING_DAYS as readonly number[]).includes(daysRemaining)) {
      alerts.push({
        key: `${month}:${cardId}:tier_warning_d${daysRemaining}`,
        type: '실적미달',
        cardId,
        month,
        title: `${card.shortName} 실적 ${won(snapshot.remainingToNextTier)} 남음`,
        body:
          `${snapshot.nextTier.label} 구간까지 ${won(snapshot.remainingToNextTier)} 남았습니다. ` +
          `이번 달 ${daysRemaining}일 남음.`,
        url,
      });
    }
  }

  // --- 2. 실적 구간 달성 ---
  // 실적 미달 구간(threshold 0)은 '달성'이 아니다.
  if (card.performance.required && snapshot.reachedTier && snapshot.reachedTier.threshold > 0) {
    const tier = snapshot.reachedTier;
    const capText =
      tier.totalBenefitCap === null
        ? '한도 없음'
        : `다음 달 혜택 한도 ${won(tier.totalBenefitCap)}`;
    alerts.push({
      key: `${month}:${cardId}:tier_reached_${tier.threshold}`,
      type: '실적달성',
      cardId,
      month,
      title: `${card.shortName} ${tier.label} 구간 달성`,
      body: `${capText}. 이번 달 실적 ${won(snapshot.currentSpend)}.`,
      url,
    });
  }

  // --- 3. 혜택 한도 소진 임박 ---
  //
  // **영역별로** 판정한다. 실제 카드는 통합 한도 하나가 아니라 영역별
  // 한도를 여러 개 갖는다(탄탄대로 6개, Discount Plan 4개). 통합 한도만
  // 보면 어떤 카드에서도 이 알림이 울리지 않는다.
  //
  // 실적 바와 방향이 반대다. 차오를수록 나쁘다 — 더 써도 혜택이 없다는 뜻.
  for (const usage of snapshot.benefitUsage) {
    if (usage.cap === null || usage.cap <= 0) continue;
    const ratio = usage.used / usage.cap;

    for (const threshold of CAP_WARNING_RATIOS) {
      if (ratio < threshold) continue;
      const isFull = threshold === 1;
      alerts.push({
        key: `${month}:${cardId}:cap_${usage.ruleId}_${Math.round(threshold * 100)}`,
        type: '한도소진임박',
        cardId,
        month,
        title: isFull
          ? `${card.shortName} ${usage.label} 한도 소진`
          : `${card.shortName} ${usage.label} ${Math.round(ratio * 100)}% 사용`,
        body: isFull
          ? `${won(usage.cap)}를 다 썼습니다. 이 영역은 더 써도 혜택이 없습니다.`
          : `${won(usage.used)} / ${won(usage.cap)} 사용. ${won(usage.cap - usage.used)} 남음.`,
        url,
      });
    }
  }

  return alerts;
}

/**
 * 거래별 혜택 적용 알림.
 *
 * 중복 방지는 Alert_Log가 아니라 **거래 행의 `알림 상태` 속성**으로 한다.
 * 거래마다 Alert_Log 행을 만들면 로그가 거래량만큼 불어난다.
 */
export function buildBenefitAlert(
  card: Card,
  snapshot: CardMonthlySnapshot,
  transactionId: string,
  merchantTitle: string,
): Alert | null {
  const benefit = snapshot.appliedBenefits.find((b) => b.transactionId === transactionId);
  if (!benefit || benefit.netAmount <= 0) return null;

  const verb = benefit.type === 'discount' ? '할인' : '적립';

  return {
    key: `${snapshot.month}:${card.id}:benefit:${transactionId}`,
    type: '혜택적용',
    cardId: card.id,
    month: snapshot.month,
    title: `${won(benefit.netAmount)} ${verb} 적용`,
    body: `${merchantTitle} · ${benefit.ruleLabel} (${card.shortName})`,
    url: `/card/${card.id}`,
  };
}
