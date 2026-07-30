/**
 * KST(UTC+9) 기준 월 경계 유틸.
 *
 * 카드 실적은 "전월 1일 00:00 ~ 말일 23:59:59, 승인일 기준"으로 산정된다.
 * Notion은 UTC ISO로 값을 주므로, 월 경계를 잘못 잡으면 매월 1일과 말일
 * 밤 9시 이후 결제가 통째로 옆 달로 새어나간다.
 *
 * 한국은 서머타임이 없으므로 고정 +9시간 오프셋이 정확하다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 'YYYY-MM' 형태의 월 키 */
export type MonthKey = string;

/** UTC ISO 문자열을 KST 기준 'YYYY-MM'으로 변환한다. */
export function toMonthKey(isoUtc: string): MonthKey {
  const kst = new Date(new Date(isoUtc).getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 현재 시각의 KST 월 키 */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return toMonthKey(now.toISOString());
}

/** 'YYYY-MM' → 직전 달 */
export function previousMonthKey(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' → 다음 달 */
export function nextMonthKey(month: MonthKey): MonthKey {
  const [y, m] = month.split('-').map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * KST 기준 해당 월의 시작·끝을 UTC 시각으로 돌려준다.
 * end는 다음 달 1일 00:00 KST (exclusive).
 */
export function monthRangeUtc(month: MonthKey): { startUtc: Date; endUtc: Date } {
  const [y, m] = month.split('-').map(Number);
  // KST 00:00 = UTC 전날 15:00
  const startUtc = new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
  const endUtc = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  return { startUtc, endUtc };
}

/** 해당 월의 일수 (KST 기준) */
export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * 이번 달이 끝나기까지 남은 일수 (KST 기준).
 * 실적 미달 경고를 D-7 / D-3 / D-1에 보내기 위해 쓴다.
 * 말일 당일이면 0.
 */
export function daysRemainingInMonth(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const today = kst.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return last - today;
}

/**
 * UTC ISO에서 KST 기준 '시'(0~23)를 뽑는다.
 *
 * 신한 Discount Plan처럼 승인 시각대에 따라 할인 영역이 갈리는 카드가 있다.
 * (DAY 카페·음식점 07~15시 / NIGHT 편의점·배달앱 18~22시)
 * UTC 시각으로 판정하면 9시간이 어긋나 전혀 다른 영역이 적용된다.
 */
export function kstHour(isoUtc: string): number {
  return new Date(new Date(isoUtc).getTime() + KST_OFFSET_MS).getUTCHours();
}

/**
 * KST 시각이 [startHour, endHour) 구간에 드는지.
 * 자정을 넘는 구간(22~02시 등)도 처리한다.
 */
export function isWithinHours(isoUtc: string, startHour: number, endHour: number): boolean {
  const hour = kstHour(isoUtc);
  return startHour <= endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

/** UTC ISO를 KST 'YYYY-MM-DD' 로 */
export function toKstDateString(isoUtc: string): string {
  const kst = new Date(new Date(isoUtc).getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

/**
 * 룰의 유효기간이 해당 **월과 겹치는지**.
 *
 * 월별 혜택 현황 목록에서 쓴다. 거래 단위 판정(isRuleEffective)과 달리,
 * 아직 시작하지 않았거나 이미 끝난 룰을 목록에서 통째로 감추기 위한 것이다.
 * 이걸 안 하면 프로모션 종료 후에나 발효될 룰이 "0 / 20,000원"으로 표시돼
 * 혜택을 못 받고 있는 것처럼 읽힌다.
 */
export function isRuleEffectiveInMonth(
  month: MonthKey,
  effectiveFrom?: string,
  effectiveUntil?: string,
): boolean {
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;

  if (effectiveFrom && effectiveFrom > monthEnd) return false;
  if (effectiveUntil && effectiveUntil < monthStart) return false;
  return true;
}

/** 룰의 유효기간(effectiveFrom/Until)이 해당 거래일에 유효한지 */
export function isRuleEffective(
  isoUtc: string,
  effectiveFrom?: string,
  effectiveUntil?: string,
): boolean {
  const date = toKstDateString(isoUtc);
  if (effectiveFrom && date < effectiveFrom) return false;
  if (effectiveUntil && date > effectiveUntil) return false;
  return true;
}
