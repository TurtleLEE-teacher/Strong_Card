import Link from 'next/link';
import type { Card, CardMonthlySnapshot } from '@/lib/types';
import { Meter, type MeterTick } from './Meter';
import { benefitSeverity, performanceSeverity } from '@/lib/severity';
import { monthShort, won, wonShort } from '@/lib/format';
import { previousMonthKey } from '@/lib/date';

/**
 * 카드 위젯은 두 가지 형태로 나뉜다.
 *
 *  실적형 (탄탄대로 · Amex Blue · Discount Plan · 신한EV)
 *    → 실적 바 + 혜택 바 2단
 *  무실적형 (쿠팡와우 · ZERO Ed2)
 *    → 혜택 바만. ZERO는 적립 한도조차 없어 분모가 없으므로 바 대신 숫자만.
 *
 * 무실적 카드에 실적 바를 그리면 영원히 0%로 남아 "뭔가 잘못됐다"는
 * 오해만 준다. 분모가 없으면 바를 그리지 않는 것이 맞다.
 */

interface Props {
  card: Card;
  snapshot: CardMonthlySnapshot;
  /** 이번 달 남은 일수. 실적 미달 경고 색을 정하는 데 쓴다. */
  daysRemaining: number;
}

export function CardWidget({ card, snapshot, daysRemaining }: Props) {
  const seriesColor = `var(--series-${card.slot})`;

  return (
    <article
      className="rounded-2xl border p-4 sm:p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* 색 스와치는 카드명 옆에 붙는다. 색만으로 식별을 요구하지 않는다. */}
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ background: seriesColor }}
          />
          <div className="min-w-0">
            <Link
              href={`/card/${card.id}`}
              className="block truncate text-[15px] font-semibold hover:underline"
              style={{ color: 'var(--text-primary)' }}
            >
              {card.shortName}
            </Link>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
              {card.issuer} · {card.last4.join(', ')}
            </p>
          </div>
        </div>

        {card.performance.required ? (
          <TierBadge snapshot={snapshot} />
        ) : (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
          >
            무실적
          </span>
        )}
      </header>

      {card.performance.required && (
        <PerformanceSection snapshot={snapshot} card={card} daysRemaining={daysRemaining} />
      )}

      <BenefitSection card={card} snapshot={snapshot} />
    </article>
  );
}

// ---------------------------------------------------------------------------

function TierBadge({ snapshot }: { snapshot: CardMonthlySnapshot }) {
  const tier = snapshot.appliedTier;
  const missed = !tier || tier.threshold === 0;

  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: missed
          ? 'color-mix(in oklab, var(--status-critical) 12%, var(--surface-alt))'
          : 'var(--surface-alt)',
        color: missed ? 'var(--status-critical)' : 'var(--text-secondary)',
      }}
    >
      {missed ? '실적 미달' : `${tier.label} 구간`}
    </span>
  );
}

// ---------------------------------------------------------------------------

function PerformanceSection({
  card,
  snapshot,
  daysRemaining,
}: {
  card: Card;
  snapshot: CardMonthlySnapshot;
  daysRemaining: number;
}) {
  const { currentSpend, nextTier, reachedTier, remainingToNextTier } = snapshot;

  // 분모는 '다음 구간'이다. 최상위 사다리를 분모로 쓰면 바가 늘 작아 보여
  // "얼마 남았나"라는 이 바의 본래 질문이 묻힌다.
  const goal = nextTier?.threshold ?? reachedTier?.threshold ?? 0;
  const ratio = goal > 0 ? currentSpend / goal : 1;

  const ticks: MeterTick[] = goal
    ? card.performance.tiers
        .filter((t) => t.threshold > 0 && t.threshold <= goal)
        .map((t) => ({
          at: t.threshold / goal,
          label: wonShort(t.threshold),
          reached: currentSpend >= t.threshold,
        }))
    : [];

  const severity = performanceSeverity(ratio, !nextTier, daysRemaining);

  return (
    <section className="mb-5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          다음 달 혜택을 위한 이번 달 실적
        </h3>
        <p className="shrink-0 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {won(currentSpend)}
          </span>
          {goal > 0 && ` / ${wonShort(goal)}`}
        </p>
      </div>

      <Meter
        ratio={ratio}
        severity={severity}
        ticks={ticks}
        ariaLabel={`이번 달 실적 ${won(currentSpend)}, 목표 ${won(goal)}`}
      />

      <p className="mt-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {!nextTier ? (
          <>최고 구간 달성 — 더 채울 필요 없습니다</>
        ) : (
          <>
            <strong style={{ color: 'var(--text-primary)' }}>{nextTier.label}</strong> 구간까지{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{won(remainingToNextTier)}</strong>{' '}
            남음
            {daysRemaining <= 7 && ` · ${daysRemaining}일 남음`}
          </>
        )}
      </p>

      {snapshot.excludedSpend > 0 && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          실적 제외 {won(snapshot.excludedSpend)}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function BenefitSection({ card, snapshot }: { card: Card; snapshot: CardMonthlySnapshot }) {
  const { totalBenefitUsed, totalBenefitCap, appliedTier, month } = snapshot;
  const sourceMonth = monthShort(previousMonthKey(month));

  const heading = card.performance.required
    ? `이번 달 받은 혜택 (${sourceMonth} 실적 ${appliedTier?.label ?? '미달'})`
    : '이번 달 받은 혜택';

  const allUsage = snapshot.benefitUsage
    .filter((u) => u.used > 0 || (u.cap !== null && u.cap > 0))
    .sort((a, b) => b.used - a.used);
  const activeUsage = allUsage.slice(0, 4);
  const hiddenCount = allUsage.length - activeUsage.length;

  // 통합 한도가 없다고 해서 한도가 없는 게 아니다. 쿠팡와우(4만/1.2만)와
  // Amex Blue(각 5천)는 통합 한도만 없고 룰별 한도는 엄연히 있다.
  // 진짜로 한도가 하나도 없는 건 현대 ZERO뿐이다.
  const hasAnyCap = totalBenefitCap !== null || allUsage.some((u) => u.cap !== null);
  const ratio =
    totalBenefitCap !== null && totalBenefitCap > 0 ? totalBenefitUsed / totalBenefitCap : 0;
  const severity = benefitSeverity(totalBenefitCap !== null ? ratio : null);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {heading}
        </h3>
        {totalBenefitCap !== null && (
          <p className="shrink-0 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {won(totalBenefitUsed)}
            </span>
            {` / ${wonShort(totalBenefitCap)}`}
          </p>
        )}
      </div>

      {totalBenefitCap !== null ? (
        <>
          <Meter
            ratio={ratio}
            severity={severity}
            ariaLabel={`이번 달 혜택 ${won(totalBenefitUsed)}, 한도 ${won(totalBenefitCap)}`}
          />
          {ratio >= 1 && (
            <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--status-critical)' }}>
              한도 소진 — 이 카드로 더 써도 혜택이 없습니다
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {won(totalBenefitUsed)}
          </p>
          {!hasAnyCap && (
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              적립 한도 없음
            </p>
          )}
        </>
      )}

      {activeUsage.length > 0 && (
        // 라벨을 바 옆에 두면 '스타벅스·이디야 20% 할인' 같은 이름이 잘린다.
        // 라벨/수치를 윗줄에, 바를 아랫줄에 두면 폭에 관계없이 온전히 보인다.
        <ul className="mt-3 space-y-2.5">
          {activeUsage.map((usage) => (
            <li key={usage.ruleId}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {usage.label}
                </span>
                <span
                  className="shrink-0 text-[11px] tabular"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {usage.cap === null
                    ? won(usage.used)
                    : `${usage.used.toLocaleString('ko-KR')} / ${usage.cap.toLocaleString('ko-KR')}`}
                </span>
              </div>
              {/* 한도 없는 룰은 분모가 없으므로 바를 그리지 않는다.
                  0% 바를 그리면 "혜택을 못 받았다"는 반대 뜻으로 읽힌다. */}
              {usage.cap !== null && (
                <Meter
                  height={6}
                  ratio={usage.ratio ?? 0}
                  severity={benefitSeverity(usage.ratio)}
                  ariaLabel={`${usage.label} ${won(usage.used)} / 한도 ${won(usage.cap)}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 && (
        <Link
          href={`/card/${card.id}`}
          className="mt-2.5 inline-block text-[11px] hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          혜택 {hiddenCount}개 더 보기 →
        </Link>
      )}

      {snapshot.reconciliationDelta !== null &&
        Math.abs(snapshot.reconciliationDelta) > 1000 && (
          <p className="mt-3 text-[11px]" style={{ color: 'var(--status-serious)' }}>
            ⚠ 카드사 누계 {won(snapshot.issuerReportedSpend ?? 0)}와{' '}
            {won(Math.abs(snapshot.reconciliationDelta))} 차이 — 제외 규칙 점검 필요
          </p>
        )}
    </section>
  );
}
