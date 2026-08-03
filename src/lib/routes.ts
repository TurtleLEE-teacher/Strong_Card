/**
 * 화면 주소를 만드는 유일한 자리.
 *
 * 달이 경로에 들어오면서 같은 화면에 주소가 둘이 됐다 — 이번 달은 `/`,
 * 지난달은 `/m/2026-07`. 링크를 만드는 곳마다 이 분기를 손으로 쓰면 어딘가
 * 하나는 빠뜨리고, 지난달을 보다가 카드를 눌렀는데 이번 달 상세가 열린다.
 */

import { currentMonthKey, type MonthKey } from '@/lib/date';

/**
 * 대시보드.
 *
 * 이번 달만 월 키 없는 기본 주소를 쓴다. `/m/2026-08`도 같은 화면을 그리긴
 * 하지만, 달이 바뀌면 그 주소가 지난달로 굳어 버린다 — 홈 화면에 저장한
 * 아이콘이나 북마크가 8월 화면에 영영 머무르게 된다.
 */
export function dashboardHref(month: MonthKey, now: MonthKey = currentMonthKey()): string {
  return month === now ? '/' : `/m/${month}`;
}

/** 카드 상세 */
export function cardHref(
  cardId: string,
  month: MonthKey,
  now: MonthKey = currentMonthKey(),
): string {
  return month === now ? `/card/${cardId}` : `/card/${cardId}/${month}`;
}
