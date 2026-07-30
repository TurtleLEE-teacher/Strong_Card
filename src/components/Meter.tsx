/**
 * 진행률 미터 — 이 앱의 주력 시각 요소.
 *
 * 마크 규격:
 *  - 굵기 10px (얇은 마크), 데이터 끝은 4px 라운드, 베이스라인 쪽은 각지게
 *  - 트랙은 채움색의 옅은 단계(같은 램프) — 상태가 바 전체에서 읽히도록
 *  - 채움색은 **심각도**를 나타낸다 (accent → warning → critical)
 *
 * 구간 눈금(ticks)은 실적 바에만 쓴다. 다음 구간이 어디인지 보여주지 않으면
 * "얼마 남았는지"가 숫자로만 남아 바의 의미가 절반으로 준다.
 */

export type MeterSeverity = 'accent' | 'good' | 'warning' | 'critical' | 'neutral';

const SEVERITY_COLOR: Record<MeterSeverity, string> = {
  accent: 'var(--meter-accent)',
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
  neutral: 'var(--text-muted)',
};

export interface MeterTick {
  /** 0~1 위치 */
  at: number;
  label: string;
  reached: boolean;
}

export interface MeterProps {
  /** 0~1. 1을 넘으면 잘린다. */
  ratio: number;
  severity?: MeterSeverity;
  ticks?: MeterTick[];
  /** 접근성용 설명 */
  ariaLabel: string;
  height?: number;
}

export function Meter({
  ratio,
  severity = 'accent',
  ticks,
  ariaLabel,
  height = 10,
}: MeterProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const color = SEVERITY_COLOR[severity];

  return (
    <div className="w-full">
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative w-full overflow-hidden"
        style={{
          height,
          borderRadius: height / 2,
          // 트랙 = 채움색의 옅은 단계. 표면과 섞어 같은 램프를 유지한다.
          background: `color-mix(in oklab, ${color} 16%, var(--surface-alt))`,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
          style={{
            width: `${clamped * 100}%`,
            background: color,
            // 데이터 끝만 둥글게, 베이스라인(왼쪽)은 각지게
            borderRadius: `0 ${height / 2}px ${height / 2}px 0`,
            minWidth: clamped > 0 ? 3 : 0,
          }}
        />

        {ticks?.map((tick) => (
          <span
            key={tick.label}
            aria-hidden
            className="absolute inset-y-0 w-px"
            style={{
              left: `${Math.min(100, tick.at * 100)}%`,
              // 눈금은 데이터가 아니므로 뒤로 물러나 있어야 한다
              background: tick.reached
                ? 'color-mix(in oklab, var(--surface) 70%, transparent)'
                : 'var(--border)',
            }}
          />
        ))}
      </div>

      {ticks && ticks.length > 0 && (
        <div className="relative mt-1 h-3.5">
          {ticks.map((tick) => {
            // 양 끝 눈금은 가운데 정렬하면 바 밖으로 넘쳐 잘린다.
            // 끝에서는 안쪽으로 붙인다.
            const atEnd = tick.at >= 0.97;
            const atStart = tick.at <= 0.03;
            return (
              <span
                key={tick.label}
                className="absolute text-[10px] tabular whitespace-nowrap"
                style={{
                  left: atEnd ? undefined : `${tick.at * 100}%`,
                  right: atEnd ? 0 : undefined,
                  transform: atEnd || atStart ? undefined : 'translateX(-50%)',
                  color: tick.reached ? 'var(--text-secondary)' : 'var(--text-muted)',
                }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
