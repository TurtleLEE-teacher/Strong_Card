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

/*
 * 혜택 한도 바에는 심각도색을 쓰지 않는다 (예전의 benefitSeverity 제거).
 *
 * 이유 두 가지.
 *  1. 뜻이 뒤집힌다. 실적 바의 빨강은 "모자라다", 혜택 바의 빨강은 "다 받았다"다.
 *     같은 램프로 칠하면 정반대 상태가 같은 색으로 나온다.
 *  2. 카드 여섯 장의 영역 한도가 대부분 100%에 닿아 화면 전체가 빨개졌고,
 *     그 바람에 정작 급한 실적 미달 경고가 묻혔다.
 *
 * 지금은 혜택 바가 **카드 정체성색**을 쓰고, 소진은 '소진' 라벨로 알린다.
 * → components/UsageRow.tsx
 */
