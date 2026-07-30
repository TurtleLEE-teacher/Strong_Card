import type { BenefitUsage } from '@/lib/types';
import { Meter } from './Meter';
import { won } from '@/lib/format';

/**
 * 혜택 영역 한 줄 — 대시보드 위젯과 카드 상세가 **같은 컴포넌트**를 쓴다.
 *
 * 예전에는 두 화면이 각자 그렸고, 그래서 같은 데이터가 한쪽은 파란 바
 * 다른 쪽은 빨간 바로 나왔다. 그 순간 사용자는 둘 다 믿지 않게 된다.
 *
 * 색은 **카드 정체성색**이다. 심각도색이 아니다.
 * 한도가 차오르는 건 혜택을 그만큼 받았다는 뜻이지 나쁜 상태가 아니다.
 * 소진은 색이 아니라 '소진' 라벨로 알린다 — 상태색은 아이콘·라벨과 함께
 * 쓰라는 규칙이기도 하고, 영역 여섯 개가 전부 빨개지면 정작 급한
 * 실적 미달 경고가 묻히기 때문이기도 하다.
 */
export function UsageRow({
  usage,
  seriesColor,
  showCount = false,
}: {
  usage: BenefitUsage;
  seriesColor: string;
  /** 적용 건수를 라벨 옆에 붙인다. 상세 화면에서만 쓴다. */
  showCount?: boolean;
}) {
  const isFull = usage.cap !== null && usage.cap > 0 && (usage.ratio ?? 0) >= 1;

  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {usage.label}
          {showCount && usage.txCount > 0 && (
            <span style={{ color: 'var(--text-muted)' }}> · {usage.txCount}건</span>
          )}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {isFull && (
            <span
              className="rounded px-1 py-px text-[10px] font-medium"
              style={{
                background: 'color-mix(in oklab, var(--status-serious) 16%, transparent)',
                color: 'var(--status-serious)',
              }}
            >
              소진
            </span>
          )}
          {/* 단위는 분모에만 붙인다. 둘 다 붙이면 좁은 폭에서 줄이 밀리고,
              아예 없으면 화면의 다른 금액과 표기가 갈린다. */}
          <span className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
            {usage.cap === null
              ? won(usage.used)
              : `${usage.used.toLocaleString('ko-KR')} / ${won(usage.cap)}`}
          </span>
        </span>
      </div>
      {/* 한도 없는 룰은 분모가 없으므로 바를 그리지 않는다.
          0% 바를 그리면 "혜택을 못 받았다"는 반대 뜻으로 읽힌다. */}
      {usage.cap !== null && (
        <Meter
          height={6}
          ratio={usage.ratio ?? 0}
          color={seriesColor}
          ariaLabel={`${usage.label} ${won(usage.used)} / 한도 ${won(usage.cap)}${
            isFull ? ' (소진)' : ''
          }`}
        />
      )}
    </li>
  );
}
