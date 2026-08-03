/**
 * 카드 한 장의 "이번 달 상태"를 한 단어로 요약하는 판정들.
 *
 * 대시보드 위젯과 카드 상세가 각자 `benefitUsage`를 훑어 헤드룸과 소진
 * 개수를 세고 있었다. 같은 질문에 두 벌의 답이 있으면 언젠가 갈라지고,
 * 갈라진 순간 사용자는 둘 다 믿지 않게 된다. 여기 한 곳에만 둔다.
 */

import type { BenefitUsage, CardMonthlySnapshot } from '@/lib/types';

/**
 * 화면에 보여줄 값이 있는 영역.
 *
 * 받은 것도 없고 한도도 0인 줄은 보여줄 게 없다. 한도가 0이어도 `unlock`이
 * 붙어 있으면 '실적 채우면 열린다'는 정보라서 UsageRow가 잠긴 상태로
 * 그린다 — 그건 cap > 0 조건이 아니라 used/cap 어느 쪽이든 값이 있는지로
 * 판단한다.
 */
export function visibleUsage(snapshot: CardMonthlySnapshot): BenefitUsage[] {
  return snapshot.benefitUsage.filter((u) => u.used > 0 || (u.cap !== null && u.cap > 0));
}

/**
 * **한도가 실제로 열려 있는** 영역.
 *
 * cap이 0인 영역은 실적 미달로 잠긴 것이다. 소진 판정에서 반드시 빼야
 * 한다 — 안 빼면 "한도 0원을 0원 다 썼다"가 성립해서, 혜택을 한 푼도 못
 * 받는 실적 미달 카드에 '다 받음' 스티커가 붙는다. 정확히 반대말이다.
 */
export function openUsage(snapshot: CardMonthlySnapshot): BenefitUsage[] {
  return snapshot.benefitUsage.filter((u) => u.cap !== null && u.cap > 0);
}

/** 이 카드로 이번 달 더 받을 수 있는 금액 */
export function remainingBenefit(snapshot: CardMonthlySnapshot): number {
  return openUsage(snapshot).reduce((sum, u) => sum + Math.max(0, (u.cap ?? 0) - u.used), 0);
}

/** 한도를 다 쓴 영역 수 */
export function exhaustedAreaCount(snapshot: CardMonthlySnapshot): number {
  return openUsage(snapshot).filter((u) => (u.ratio ?? 0) >= 1).length;
}

/**
 * 이 카드에서 **받을 수 있는 혜택을 전부 받았는가.**
 *
 * 한도가 열려 있는 영역이 하나도 없으면 false다. 실적 미달 카드와 한도
 * 자체가 없는 카드(ZERO Ed2의 무제한 적립)가 여기 걸리는데, 둘 다 '다
 * 받았다'고 말할 수 있는 상태가 아니다 — 전자는 아직 못 받는 것이고,
 * 후자는 끝이 없어서 다 받는 일이 영영 없다.
 */
export function isFullyEarned(snapshot: CardMonthlySnapshot): boolean {
  const open = openUsage(snapshot);
  if (open.length === 0) return false;
  return open.every((u) => (u.ratio ?? 0) >= 1);
}

/**
 * 카드를 **이번 달 받은 혜택이 많은 순**으로 세운다.
 *
 * 등록 순서(국민 → 삼성 → 신한)는 지갑에 꽂은 순서일 뿐 이 화면의 질문과
 * 아무 상관이 없다. 대시보드가 답해야 할 것은 "이번 달 어느 카드가 일하고
 * 있나"이고, 그 답은 금액순이다.
 *
 * 동점은 받은 순서를 유지한다(Array#sort는 안정 정렬). 0원인 카드끼리
 * 매달 자리가 바뀌면 카드를 위치로 기억할 수 없다.
 *
 * 원본 배열은 건드리지 않는다.
 */
export function byBenefitDesc(snapshots: readonly CardMonthlySnapshot[]): CardMonthlySnapshot[] {
  return [...snapshots].sort((a, b) => b.totalBenefitUsed - a.totalBenefitUsed);
}
