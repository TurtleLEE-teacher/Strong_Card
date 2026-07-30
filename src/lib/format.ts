/** 표시 포맷 유틸. 화면 전체가 이 함수들만 쓰도록 통일한다. */

/** 12345 → '12,345원' */
export function won(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

/**
 * 큰 금액을 만/억 단위로 줄인다. 620000 → '62만'
 * 바 옆 라벨처럼 자리가 좁은 곳에서 쓴다.
 */
export function wonShort(value: number): string {
  const v = Math.round(value);
  if (v === 0) return '0원';
  if (Math.abs(v) >= 100_000_000) {
    return `${trim(v / 100_000_000)}억`;
  }
  if (Math.abs(v) >= 10_000) {
    return `${trim(v / 10_000)}만`;
  }
  return `${v.toLocaleString('ko-KR')}원`;
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 0.62 → '62%' */
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** '2026-07' → '2026년 7월' */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월`;
}

/** '2026-07' → '7월' */
export function monthShort(month: string): string {
  const m = month.split('-')[1];
  return `${Number(m)}월`;
}

/** UTC ISO → 'M/D HH:mm' (KST) */
export function dateTimeShort(isoUtc: string): string {
  const kst = new Date(new Date(isoUtc).getTime() + 9 * 60 * 60 * 1000);
  const mm = kst.getUTCMonth() + 1;
  const dd = kst.getUTCDate();
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}
