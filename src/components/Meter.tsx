/**
 * 진행률 미터 — 이 앱의 주력 시각 요소.
 *
 * 마크 규격:
 *  - 굵기 10px (얇은 마크), 데이터 끝은 4px 라운드, 베이스라인 쪽은 각지게
 *  - 트랙은 채움색의 옅은 단계(같은 램프) — 상태가 바 전체에서 읽히도록
 *
 * 채움색은 바가 하는 **일**에 따라 갈린다.
 *  - 실적 바 → 심각도(accent → warning → critical). 못 채우면 손해라는 상태.
 *  - 혜택 바 → 카드 정체성 색(color prop). 차오르는 것 자체는 나쁜 게 아니라
 *    혜택을 받았다는 뜻이다. 소진은 색이 아니라 라벨로 알린다.
 *
 * 둘을 같은 빨강 램프로 칠하면 정반대 뜻이 같은 색으로 나온다 — 실적 빨강은
 * "모자라다", 혜택 빨강은 "다 받았다"다. 화면이 온통 빨개지면서 뜻도 뒤집힌다.
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
  /**
   * 채움색을 직접 지정한다. severity보다 우선한다.
   *
   * 혜택 바처럼 **정체성**(어느 카드인가)을 나타내는 바에 쓴다. 심각도 색은
   * 상태를 뜻하도록 아껴 둬야 하고, 카드 색은 개체를 따라가야 한다.
   */
  color?: string;
  ticks?: MeterTick[];
  /** 접근성용 설명 */
  ariaLabel: string;
  height?: number;
}

export function Meter({
  ratio,
  severity = 'accent',
  color: explicitColor,
  ticks,
  ariaLabel,
  height = 10,
}: MeterProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const color = explicitColor ?? SEVERITY_COLOR[severity];

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
