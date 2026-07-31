import type { BenefitUsage } from '@/lib/types';
import { Meter } from './Meter';
import { dateTimeShort, won, wonShort } from '@/lib/format';
import { RuleGuideList } from './RuleGuideList';
import type { RuleGuide } from '@/lib/rule-guide';

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

/** 이 영역의 한도를 깎은 거래 한 건 */
export interface UsageContribution {
  transactionId: string;
  title: string;
  approvedAt: string;
  krwAmount: number;
  /** 이 거래로 받은 혜택 */
  netAmount: number;
  /** 어떤 룰로 걸렸는지 — 영역 안에 여러 룰이 묶여 있을 때 필요하다 */
  ruleLabel: string;
  /** 왜 깎였는지. 0원이 된 이유를 설명하는 데 쓴다. */
  cappedBy: 'none' | 'per-tx' | 'per-month' | 'total';
}

/** 0원이 된 거래에 붙일 이유. 이게 없으면 "왜 안 받았지"를 알 수 없다. */
function cappedReason(c: UsageContribution): string | null {
  if (c.netAmount > 0) return null;
  switch (c.cappedBy) {
    case 'per-month':
      return '월 한도 소진';
    case 'total':
      return '카드 통합 한도 소진';
    case 'per-tx':
      return '건당 한도';
    default:
      return '혜택 없음';
  }
}

export function UsageRow({
  usage,
  seriesColor,
  showCount = false,
  tierUnknown = false,
  guides,
  contributions,
}: {
  usage: BenefitUsage;
  seriesColor: string;
  /** 적용 건수를 라벨 옆에 붙인다. 상세 화면에서만 쓴다. */
  showCount?: boolean;
  /** 전월실적을 모르는 상태. '미달'이라고 단정하지 않는다. */
  tierUnknown?: boolean;
  /**
   * 이 영역을 구성하는 규칙들 — 어디서 어떻게 써야 받는지.
   * 주면 펼침에 '사용 조건'이 함께 나온다.
   */
  guides?: RuleGuide[];
  /**
   * 이 영역의 혜택을 만든 거래들. 주면 줄이 펼침 가능해진다.
   * 대시보드는 주지 않고, 상세 화면만 준다.
   */
  contributions?: UsageContribution[];
}) {
  const isFull = usage.cap !== null && usage.cap > 0 && (usage.ratio ?? 0) >= 1;
  // 사용 조건만 있어도 펼칠 값어치가 있다 — "어디서 써야 받나"가 결제
  // 직전에 가장 궁금한 정보다.
  const expandable = (contributions?.length ?? 0) > 0 || (guides?.length ?? 0) > 0;
  // 금액은 남았는데 횟수를 다 쓴 규칙. 바만 보면 여유가 있어 보여서
  // 이걸 따로 알리지 않으면 헛돈을 쓰게 된다.
  const countExhausted = guides?.filter((g) => g.counts?.exhausted).length ?? 0;
  // 실적 미달이라 아직 안 열린 영역. 지우지 않고 잠긴 채로 보여준다 —
  // "이 카드에 어떤 혜택이 있나"가 가장 궁금한 시점이 바로 이때다.
  const locked = usage.cap === 0 && usage.unlock !== undefined;

  const body = (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {expandable && <span aria-hidden className="mr-1 inline-block chevron">▸</span>}
          {usage.label}
          {showCount && usage.txCount > 0 && (
            <span style={{ color: 'var(--text-muted)' }}> · {usage.txCount}건</span>
          )}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {locked && (
            <span
              className="rounded px-1 py-px text-[10px] font-medium"
              style={{
                background: 'var(--surface-alt)',
                color: 'var(--text-muted)',
              }}
            >
              {tierUnknown ? '확인 필요' : '실적 미달'}
            </span>
          )}
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
          {!isFull && countExhausted > 0 && (
            <span
              className="rounded px-1 py-px text-[10px] font-medium"
              style={{
                background: 'color-mix(in oklab, var(--status-warning) 20%, transparent)',
                color: 'var(--status-serious)',
              }}
            >
              횟수 소진 {countExhausted}
            </span>
          )}
          {/* 단위는 분모에만 붙인다. 둘 다 붙이면 좁은 폭에서 줄이 밀리고,
              아예 없으면 화면의 다른 금액과 표기가 갈린다. */}
          <span className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
            {locked
              ? tierUnknown
                ? `${wonShort(usage.unlock!.threshold)} 이상이면 ${won(usage.unlock!.cap)}`
                : `${wonShort(usage.unlock!.threshold)} 채우면 ${won(usage.unlock!.cap)}`
              : usage.cap === null
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
          // 잠긴 영역은 카드색 대신 회색 트랙만 — 색이 있으면 받고 있는
          // 혜택으로 오해한다.
          color={locked ? 'var(--text-muted)' : seriesColor}
          ariaLabel={`${usage.label} ${won(usage.used)} / 한도 ${won(usage.cap)}${
            isFull ? ' (소진)' : ''
          }`}
        />
      )}
    </>
  );

  if (!expandable) return <li>{body}</li>;

  // 펼침은 <details>로 한다 — 자바스크립트 없이 동작하고, 서버 컴포넌트에서
  // 그대로 쓸 수 있으며, 키보드·스크린리더가 기본으로 지원한다.
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {body}
        </summary>
        <div className="mt-2 ml-3 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
          {guides && guides.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                어디서 어떻게 써야 받나
              </p>
              <RuleGuideList guides={guides} />
            </div>
          )}
          {contributions && contributions.length > 0 && (
            <p className="mb-1.5 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
              이번 달 사용 내역
            </p>
          )}
        <ul className="space-y-1.5">
          {(contributions ?? []).map((c) => (
            <li key={c.transactionId} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span
                  className="block truncate text-[11px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {c.title}
                </span>
                <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {dateTimeShort(c.approvedAt)} · {won(c.krwAmount)} · {c.ruleLabel}
                </span>
              </span>
              {c.netAmount > 0 ? (
                <span
                  className="shrink-0 text-[11px] font-medium tabular"
                  style={{ color: 'var(--status-good)' }}
                >
                  +{won(c.netAmount)}
                </span>
              ) : (
                <span
                  className="shrink-0 text-[10px]"
                  style={{ color: 'var(--status-serious)' }}
                >
                  {cappedReason(c)}
                </span>
              )}
            </li>
          ))}
        </ul>
        </div>
      </details>
    </li>
  );
}
