import Link from 'next/link';
import type { Card, CardMonthlySnapshot } from '@/lib/types';
import { Meter, type MeterTick } from './Meter';
import { UsageRow } from './UsageRow';
import { CardFace } from './CardFace';
import { issuerLabel } from '@/config/issuers';
import { guidesFor } from '@/lib/rule-guide';
import { performanceSeverity } from '@/lib/severity';
import { monthShort, won, wonShort } from '@/lib/format';
import { nextMonthKey, previousMonthKey } from '@/lib/date';

/**
 * 카드 위젯은 두 가지 형태로 나뉜다.
 *
 *  실적형 (탄탄대로 · Amex Blue · Discount Plan · 신한EV)
 *    → 실적 바 + 영역별 혜택 바
 *  무실적형 (쿠팡와우 · ZERO Ed2)
 *    → 혜택 바만. ZERO는 적립 한도조차 없어 분모가 없으므로 바 대신 숫자만.
 *
 * 무실적 카드에 실적 바를 그리면 영원히 0%로 남아 "뭔가 잘못됐다"는
 * 오해만 준다. 분모가 없으면 바를 그리지 않는 것이 맞다.
 *
 * 색 규칙 — 바가 하는 일에 따라 다르다.
 *   실적 바  심각도색. 못 채우면 다음 달 혜택이 깎이므로 상태 신호다.
 *   혜택 바  **카드 정체성색**. 차오르는 건 혜택을 받았다는 뜻이지 나쁜 게
 *            아니다. 소진은 색이 아니라 '소진' 라벨로 알린다.
 *
 * 라이트 모드에서 aqua·yellow·magenta는 표면 대비 3:1 미만이라 팔레트 검증이
 * '가시 라벨 필요' 경고를 낸다. 모든 바에 영역 이름과 금액이 텍스트로 붙어
 * 있으므로 색만으로 정보를 나르지 않는다 — 그 조건을 만족한다.
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
      className="overflow-hidden rounded-2xl border"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        // 카드끼리 붙어 보이지 않도록 아주 옅은 그림자를 준다.
        // 테두리를 진하게 하면 안쪽 구분선과 경쟁해서 오히려 시끄럽다.
        boxShadow: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 8px rgb(0 0 0 / 0.03)',
      }}
    >
      {/* 카드 색 마커. 폭을 꽉 채우면 '100% 찬 바'로 읽히므로 짧게 둔다 —
          이 화면의 가로 막대는 전부 데이터다. 짧은 조각은 탭 표시로 읽힌다. */}
      <div aria-hidden style={{ height: 3, width: 36, background: seriesColor }} />

      <div className="p-4 sm:p-5">
        <Header card={card} snapshot={snapshot} seriesColor={seriesColor} />

        {card.performance.required && (
          <PerformanceSection snapshot={snapshot} card={card} daysRemaining={daysRemaining} />
        )}

        <BenefitSection card={card} snapshot={snapshot} seriesColor={seriesColor} />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

/**
 * 카드 이름 + 구간 배지 + 이번 달 혜택 금액.
 *
 * 혜택 금액은 stat 값 크기(20px)로 둔다. 예전에는 카드마다 2xl로 그려서
 * 화면에 히어로 숫자가 일곱 개가 됐고, 그 바람에 대시보드 총합이 묻혔다.
 * 히어로 숫자는 화면당 하나다.
 *
 * 금액에 붙는 달은 **이름으로 못 박는다.** '이번 달 받은 혜택' 바로 아래에
 * '7월 실적 …' 줄이 오면, 그 줄이 금액의 설명처럼 읽혀서 숫자까지 지난달
 * 것으로 보인다. 실제로는 이번 달 금액이고 아랫줄은 한도의 근거일 뿐이다.
 * 그래서 달 이름을 앞에 박고, 근거 줄에는 '한도 기준'을 명시한다.
 */
function Header({
  card,
  snapshot,
  seriesColor,
}: {
  card: Card;
  snapshot: CardMonthlySnapshot;
  seriesColor: string;
}) {
  const sourceMonth = monthShort(previousMonthKey(snapshot.month));
  const basis = !card.performance.required
    ? '실적 조건 없음'
    : snapshot.previousSpendSource === 'unknown'
      ? `한도 기준 · ${sourceMonth} 거래 기록 없음 — 실적 확인 필요`
      : `한도 기준 · ${sourceMonth} 실적 ${snapshot.appliedTier?.label ?? '미달'}${
          snapshot.previousSpendSource === 'manual' ? ' (직접 입력)' : ''
        }`;

  return (
    <header>
      <div className="flex items-start justify-between gap-3">
        {/* 카드사를 앞세운다. 지갑에서 카드를 고를 때 먼저 보는 게 카드사다. */}
        <Link href={`/card/${card.id}`} className="flex min-w-0 items-center gap-2.5 group">
          <CardFace issuer={card.issuer} last4={card.last4} seriesColor={seriesColor} />
          <span className="min-w-0">
            <span
              className="block truncate text-[15px] font-semibold leading-tight group-hover:underline"
              style={{ color: 'var(--text-primary)' }}
            >
              {issuerLabel(card.issuer)}
            </span>
            <span
              className="block truncate text-xs leading-tight"
              style={{ color: 'var(--text-secondary)' }}
            >
              {card.shortName}
            </span>
          </span>
        </Link>
        {card.performance.required ? <TierBadge snapshot={snapshot} /> : <Chip>무실적</Chip>}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {monthShort(snapshot.month)}에 받은 혜택
          </p>
          <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {basis}
          </p>
        </div>
        {/* 큰 숫자에는 tabular를 쓰지 않는다 — 자간이 헐거워 보인다. */}
        <p
          className="shrink-0 text-xl font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {won(snapshot.totalBenefitUsed)}
        </p>
      </div>
    </header>
  );
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'critical';
}) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={
        tone === 'critical'
          ? {
              background: 'color-mix(in oklab, var(--status-critical) 12%, var(--surface-alt))',
              color: 'var(--status-critical)',
            }
          : { background: 'var(--surface-alt)', color: 'var(--text-secondary)' }
      }
    >
      {children}
    </span>
  );
}

function TierBadge({ snapshot }: { snapshot: CardMonthlySnapshot }) {
  const tier = snapshot.appliedTier;
  const missed = !tier || tier.threshold === 0;
  // 지난달 거래가 없으면 '미달'이 아니라 '모름'이다. 단정하면 거짓말이 된다.
  const unknown = snapshot.previousSpendSource === 'unknown';
  return (
    <Chip tone={missed && !unknown ? 'critical' : 'neutral'}>
      {unknown ? '실적 확인 필요' : missed ? '실적 미달' : `${tier!.label} 구간`}
    </Chip>
  );
}

// ---------------------------------------------------------------------------

/**
 * 카드 안의 하위 블록.
 *
 * 실적과 혜택은 성격이 완전히 다른 정보다(하나는 다음 달을 위한 목표,
 * 하나는 이번 달에 받은 결과). 구분선 하나로 나누면 긴 목록 속에서 둘이
 * 섞여 보인다. 각자 옅은 면을 깔아 덩어리로 읽히게 한다.
 */
function Block({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mt-3 rounded-xl p-3"
      style={{ background: 'var(--surface-alt)' }}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

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
  // '다음 달'이 아니라 달 이름을 쓴다. 이 바가 이번 달 지출인지 다음 달
  // 혜택인지 헷갈리는 순간 사다리 전체가 안 읽힌다.
  const targetMonth = monthShort(nextMonthKey(snapshot.month));

  return (
    <Block
      title={`${monthShort(snapshot.month)} 실적 → ${targetMonth} 혜택을 정함`}
      aside={
        <p className="shrink-0 text-xs tabular" style={{ color: 'var(--text-muted)' }}>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {won(currentSpend)}
          </span>
          {goal > 0 && ` / ${wonShort(goal)}`}
        </p>
      }
    >
        <Meter
          ratio={ratio}
          severity={severity}
          ticks={ticks}
          ariaLabel={`이번 달 실적 ${won(currentSpend)}, 목표 ${won(goal)}`}
        />

        <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {!nextTier ? (
            <>최고 구간 달성 — {targetMonth} 혜택은 이미 확정입니다</>
          ) : (
            <>
              {targetMonth}{' '}
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
    </Block>
  );
}

// ---------------------------------------------------------------------------

function BenefitSection({
  card,
  snapshot,
  seriesColor,
}: {
  card: Card;
  snapshot: CardMonthlySnapshot;
  seriesColor: string;
}) {
  const allUsage = snapshot.benefitUsage
    .filter((u) => u.used > 0 || (u.cap !== null && u.cap > 0))
    .sort((a, b) => b.used - a.used);

  // 한도가 있는 영역은 전부 보여준다. 카드사 앱도 영역별로 나눠 보여주고,
  // 그게 이 화면의 핵심 정보다. 잘라내면 "어느 영역이 남았나"에 답을 못 한다.
  // 한도 없는 적립(ZERO 등)만 길어질 수 있어 그쪽만 접는다.
  // 한도가 있는 영역을 먼저, 한도 없는 적립을 뒤에 둔다. 전부 보여준다 —
  // 잘라내면 "어느 영역이 남았나"라는 이 화면의 본래 질문에 답을 못 한다.
  const capped = allUsage.filter((u) => u.cap !== null);
  const uncapped = allUsage.filter((u) => u.cap === null);
  const activeUsage = [...capped, ...uncapped];

  if (activeUsage.length === 0) return null;

  // 이 카드로 이번 달 더 받을 수 있는 금액. "어느 카드를 더 쓸까"에
  // 바로 답하는 숫자라 영역 목록의 요약으로 올린다.
  const headroom = capped.reduce((sum, u) => sum + Math.max(0, (u.cap ?? 0) - u.used), 0);
  const exhausted = capped.filter((u) => (u.ratio ?? 0) >= 1).length;

  return (
    <Block
      title="혜택 영역"
      aside={
        capped.length > 0 ? (
          <p className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {headroom > 0 ? (
              <>
                <span className="tabular">{won(headroom)}</span> 더 받을 수 있음
                {exhausted > 0 && ` · ${exhausted}개 소진`}
              </>
            ) : (
              '모든 영역 소진'
            )}
          </p>
        ) : undefined
      }
    >

        {/* 라벨을 바 옆에 두면 '스타벅스·이디야 20% 할인' 같은 이름이 잘린다.
            라벨/수치를 윗줄에, 바를 아랫줄에 두면 폭에 관계없이 온전히 보인다. */}
        <ul className="space-y-2.5">
          {activeUsage.map((usage) => (
            <UsageRow
              key={usage.ruleId}
              usage={usage}
              seriesColor={seriesColor}
              tierUnknown={snapshot.previousSpendSource === 'unknown'}
              guides={guidesFor(card, usage, snapshot.ruleCounts)}
            />
          ))}
        </ul>

        <Link
          href={`/card/${card.id}`}
          className="mt-3 inline-block text-[11px] hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          어떤 결제로 받았는지 보기 →
        </Link>

        {snapshot.reconciliationDelta !== null &&
          Math.abs(snapshot.reconciliationDelta) > 1000 && (
            <p className="mt-3 text-[11px]" style={{ color: 'var(--status-serious)' }}>
              ⚠ 카드사 누계 {won(snapshot.issuerReportedSpend ?? 0)}와{' '}
              {won(Math.abs(snapshot.reconciliationDelta))} 차이 — 제외 규칙 점검 필요
            </p>
          )}
    </Block>
  );
}
