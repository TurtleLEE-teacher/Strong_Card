import type { MeterSeverity } from '@/components/Meter';

/**
 * 미터 심각도 판정. **대시보드와 상세 화면이 반드시 같은 함수를 써야 한다.**
 * 화면마다 따로 판정하면 같은 데이터가 한쪽에선 파란 바, 다른 쪽에선 빨간
 * 바로 보인다. 그 순간 사용자는 둘 중 어느 쪽도 믿지 않게 된다.
 */

/**
 * 실적 바의 색.
 * 월말이 가까운데 다음 구간에 못 미치면 경고 → 위험으로 올린다.
 * 이 색 전환이 곧 "지금 더 써야 한다"는 신호다.
 */
export function performanceSeverity(
  ratio: number,
  atTopTier: boolean,
  daysRemaining: number,
): MeterSeverity {
  if (atTopTier || ratio >= 1) return 'good';
  if (daysRemaining <= 3 && ratio < 0.9) return 'critical';
  if (daysRemaining <= 7 && ratio < 0.9) return 'warning';
  return 'accent';
}

/**
 * 혜택 한도 바의 색.
 * 실적 바와 방향이 반대다 — 차오를수록 나쁘다(= 더 써도 혜택이 없다).
 */
export function benefitSeverity(ratio: number | null): MeterSeverity {
  if (ratio === null) return 'accent';
  if (ratio >= 1) return 'critical';
  if (ratio >= 0.8) return 'warning';
  return 'accent';
}
