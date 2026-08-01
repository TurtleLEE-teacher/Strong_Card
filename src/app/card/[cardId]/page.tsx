import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTIVE_CARDS, CARDS_BY_ID } from '@/config/cards';
import { findMissedBenefits } from '@/lib/engine/recommend';
import { getDashboardData } from '@/lib/data';
import { Meter } from '@/components/Meter';
import { UsageRow, type UsageContribution } from '@/components/UsageRow';
import { CardFace } from '@/components/CardFace';
import { issuerLabel } from '@/config/issuers';
import { guidesFor } from '@/lib/rule-guide';
import { performanceSeverity } from '@/lib/severity';
import { dateTimeShort, monthLabel, monthShort, won, wonShort } from '@/lib/format';
import { previousMonthKey } from '@/lib/date';
import type { CardId } from '@/lib/types';

export const revalidate = 300;

export function generateStaticParams() {
  return ACTIVE_CARDS.map((c) => ({ cardId: c.id }));
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  const card = CARDS_BY_ID[cardId as CardId];
  if (!card) notFound();

  const { month, snapshots, transactions, daysRemaining } = await getDashboardData();
  const snapshot = snapshots.find((s) => s.cardId === card.id);
  if (!snapshot) notFound();

  const benefitByTx = new Map(snapshot.appliedBenefits.map((b) => [b.transactionId, b]));
  const monthTx = transactions
    .filter((tx) => tx.cardId === card.id)
    .filter((tx) => {
      const key = new Date(new Date(tx.approvedAt).getTime() + 9 * 3600_000)
        .toISOString()
        .slice(0, 7);
      return key === month;
    })
    .sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());

  // 이 카드로 결제했지만 다른 카드가 더 나았을 건들
  const missed = findMissedBenefits(ACTIVE_CARDS, snapshots, monthTx);
  const missedTotal = missed.reduce((sum, m) => sum + m.delta, 0);

  const seriesColor = `var(--series-${card.slot})`;

  // 영역별로 "어떤 결제가 이 혜택을 만들었나"를 모은다.
  // BenefitUsage.ruleId는 공유 한도(capGroup)면 그룹 키라서, 그 그룹에 속한
  // 룰 전부의 거래를 합쳐야 한 영역의 내역이 된다.
  const txById = new Map(monthTx.map((tx) => [tx.id, tx]));
  const contributionsFor = (usage: (typeof snapshot.benefitUsage)[number]): UsageContribution[] => {
    const ruleIds = usage.capGroup
      ? new Set(card.benefits.filter((r) => r.capGroup === usage.capGroup).map((r) => r.id))
      : new Set([usage.ruleId]);
    return snapshot.appliedBenefits
      // 0원이 된 건도 남긴다 — '왜 혜택을 못 받았나'가 오히려 더 궁금한
      // 정보이고, 빼면 위의 '·N건' 표기와 목록 길이가 어긋난다.
      .filter((b) => ruleIds.has(b.ruleId))
      .map((b) => {
        const tx = txById.get(b.transactionId);
        return tx
          ? {
              transactionId: b.transactionId,
              title: tx.title,
              approvedAt: tx.approvedAt,
              krwAmount: tx.krwAmount,
              netAmount: b.netAmount,
              ruleLabel: b.ruleLabel,
              cappedBy: b.cappedBy,
            }
          : null;
      })
      .filter((x): x is UsageContribution => x !== null)
      .sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-16 sm:px-6">
      <Link
        href="/"
        className="mb-5 inline-block text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        ← 대시보드
      </Link>

      <header className="mb-6 flex items-start gap-3">
        <span className="mt-0.5">
          <CardFace issuer={card.issuer} last4={card.last4} seriesColor={seriesColor} />
        </span>
        <div className="min-w-0">
          {/* 카드사를 먼저 크게. 상품명은 그 아래. */}
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {issuerLabel(card.issuer)}
          </p>
          <h1 className="text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {card.name}
          </h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {card.last4.join(', ')} · 연회비 {won(card.annualFee)} · {monthLabel(month)}
          </p>
        </div>
      </header>

      {/* 실적과 혜택이 한 달 어긋나 있다는 걸 이 화면에서 가장 명확히 보여준다 */}
      <Panel title="실적 흐름">
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label={`${monthShort(previousMonthKey(month))} 실적 (이번 달 혜택을 결정함)`}
            value={
              snapshot.previousSpendSource === 'unknown' ? '기록 없음' : won(snapshot.previousSpend)
            }
            note={
              // 지난달 거래가 없으면 '미달'이 아니라 '모름'이다.
              snapshot.previousSpendSource === 'unknown'
                ? '거래 기록이 없어 구간을 알 수 없음'
                : snapshot.appliedTier
                  ? `${snapshot.appliedTier.label} 구간 적용 중${
                      snapshot.previousSpendSource === 'manual' ? ' (직접 입력)' : ''
                    }`
                  : '실적 미달'
            }
          />
          <Stat
            label={`${monthShort(month)} 실적 (다음 달 혜택을 결정함)`}
            value={won(snapshot.currentSpend)}
            note={
              snapshot.nextTier
                ? `${snapshot.nextTier.label}까지 ${won(snapshot.remainingToNextTier)}`
                : '최고 구간 달성'
            }
          />
        </div>

        {card.performance.required && snapshot.nextTier && (
          <div className="mt-4">
            <Meter
              ratio={snapshot.currentSpend / snapshot.nextTier.threshold}
              // 대시보드와 반드시 같은 판정을 써야 한다. 같은 데이터가 화면마다
              // 다른 색으로 보이면 사용자는 둘 다 믿지 않게 된다.
              severity={performanceSeverity(
                snapshot.currentSpend / snapshot.nextTier.threshold,
                false,
                daysRemaining,
              )}
              ticks={card.performance.tiers
                .filter((t) => t.threshold > 0 && t.threshold <= snapshot.nextTier!.threshold)
                .map((t) => ({
                  at: t.threshold / snapshot.nextTier!.threshold,
                  label: wonShort(t.threshold),
                  reached: snapshot.currentSpend >= t.threshold,
                }))}
              ariaLabel="이번 달 실적 진행률"
            />
          </div>
        )}
      </Panel>

      {/*
        놓친 혜택 — 이 카드로 결제했지만 다른 카드가 더 나았을 건.
        추정치임을 반드시 밝힌다. 실제로 다른 카드를 썼다면 그 카드의
        한도 소진 순서도 달라졌을 테니 이 숫자가 그대로 실현되지는 않는다.
      */}
      {missed.length > 0 && (
        <Panel title={`놓친 혜택 (추정) ${won(missedTotal)}`}>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {missed.slice(0, 10).map((m) => (
              <li key={m.transactionId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                    {m.merchant}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {dateTimeShort(m.approvedAt)} · {m.bestCardName}
                    {m.bestRuleLabel && `의 ${m.bestRuleLabel}`}였다면
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className="text-[13px] font-semibold tabular"
                    style={{ color: 'var(--status-serious)' }}
                  >
                    +{won(m.delta)}
                  </p>
                  <p className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
                    {won(m.actualBenefit)} → {won(m.bestBenefit)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            월말 시점의 남은 한도를 기준으로 계산한 <strong>추정치</strong>입니다. 실제로 다른
            카드를 썼다면 그 카드의 한도 소진 순서도 달라지므로 이 금액이 그대로 실현되지는
            않습니다.
          </p>
        </Panel>
      )}

      {/* 대시보드 위젯은 상위 4개만 보여주므로, 전체는 여기서 확인한다 */}
      {snapshot.benefitUsage.length > 0 && (
        <Panel title="혜택별 소진 현황" subtitle="영역을 눌러 어떤 결제로 받았는지 펼쳐 보세요">
          <ul className="space-y-3">
            {snapshot.benefitUsage.map((usage) => (
              <UsageRow
                key={usage.ruleId}
                usage={usage}
                seriesColor={seriesColor}
                showCount
                tierUnknown={snapshot.previousSpendSource === 'unknown'}
                guides={guidesFor(card, usage, snapshot.ruleCounts)}
                contributions={contributionsFor(usage)}
              />
            ))}
          </ul>
        </Panel>
      )}

      {snapshot.exclusions.length > 0 && (
        <Panel title="실적 제외 내역">
          <ul className="space-y-1.5">
            {snapshot.exclusions.map((ex) => (
              <li key={ex.verdict} className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {ex.verdict.replace('제외-', '')} · {ex.count}건
                </span>
                <span className="tabular" style={{ color: 'var(--text-primary)' }}>
                  {won(ex.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {snapshot.issuerReportedSpend !== null && (
        <Panel title="카드사 누계 대조">
          <div className="space-y-1.5 text-xs">
            <Row label="우리 계산" value={won(snapshot.currentSpend)} />
            <Row label="카드사 문자 누계" value={won(snapshot.issuerReportedSpend)} />
            <Row
              label="차이"
              value={won(snapshot.reconciliationDelta ?? 0)}
              tone={
                Math.abs(snapshot.reconciliationDelta ?? 0) > 1000 ? 'serious' : 'muted'
              }
            />
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            차이가 크면 환율이 아니라 실적 제외 규칙을 먼저 의심하세요.
          </p>
        </Panel>
      )}

      <Panel title={`${monthShort(month)} 거래 ${monthTx.length}건`}>
        {monthTx.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            이번 달 거래가 없습니다.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {monthTx.map((tx) => {
              const benefit = benefitByTx.get(tx.id);
              const miss = snapshot.noBenefit[tx.id];
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                      {tx.title}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {dateTimeShort(tx.approvedAt)}
                      {benefit && ` · ${benefit.ruleLabel}`}
                    </p>
                    {/*
                      혜택이 0원이면 **왜** 그런지 적는다. 이게 없으면
                      "왜 안 먹었지"에 앱이 답을 못 하고, 사용자는 앱이
                      고장 났는지 조건을 못 맞춘 건지 구분할 수 없다.
                    */}
                    {!benefit?.netAmount && miss && (
                      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--status-serious)' }}>
                        {miss.reason}
                        {miss.ruleLabel && ` — ${miss.ruleLabel}`}
                        {miss.detail && ` (${miss.detail})`}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] tabular" style={{ color: 'var(--text-primary)' }}>
                      {won(tx.krwAmount)}
                    </p>
                    {benefit && benefit.netAmount > 0 && (
                      <p
                        className="text-[11px] tabular"
                        style={{ color: 'var(--status-good)' }}
                      >
                        −{won(benefit.netAmount)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-3 rounded-2xl border p-4 sm:p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </p>
      {note && (
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {note}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'serious';
}) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className="tabular"
        style={{
          color: tone === 'serious' ? 'var(--status-serious)' : 'var(--text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
