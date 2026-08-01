import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTIVE_CARDS, CARDS_BY_ID } from '@/config/cards';
import { findMissedBenefits } from '@/lib/engine/recommend';
import { getDashboardData } from '@/lib/data';
import { Meter } from '@/components/Meter';
import { UsageRow, type UsageContribution } from '@/components/UsageRow';
import { CardFace } from '@/components/CardFace';
import { RefreshButton } from '@/components/RefreshButton';
import { issuerLabel } from '@/config/issuers';
import { VERDICT_LABELS } from '@/config/exclusions';
import { resolveBrand } from '@/config/merchants';
import { guidesFor } from '@/lib/rule-guide';
import { performanceSeverity } from '@/lib/severity';
import { dateTimeShort, monthLabel, monthShort, won, wonShort } from '@/lib/format';
import { nextMonthKey, previousMonthKey } from '@/lib/date';
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

  const { month, snapshots, transactions, daysRemaining, fetchedAt } =
    await getDashboardData();
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

  /*
   * 이번 달에 **실제로 혜택이 붙은 결제**만 금액 순으로 모은다.
   *
   * 예전에는 이걸 보려면 혜택 영역을 하나씩 펼치거나, 받은 건과 못 받은
   * 건이 섞인 전체 거래 목록을 눈으로 훑어야 했다. "이번 달에 뭘로 얼마를
   * 받았나"는 이 화면에서 가장 먼저 답해야 할 질문인데 어디에도 한
   * 덩어리로 있지 않았다.
   *
   * 취소로 회수된 건(음수)도 남긴다 — 합계가 왜 줄었는지 설명해야 한다.
   */
  const earned = snapshot.appliedBenefits
    .filter((b) => b.netAmount !== 0)
    .flatMap((benefit) => {
      const tx = txById.get(benefit.transactionId);
      return tx ? [{ benefit, tx }] : [];
    })
    .sort((a, b) => b.benefit.netAmount - a.benefit.netAmount);
  /*
   * 브랜드를 모르는 채로 혜택도 못 받은 가맹점.
   *
   * 두 조건을 **모두** 봐야 신호가 된다. 룰에 안 걸린 것만 모으면 쿠팡와우
   * 처럼 대상이 좁은 카드에서 이번 달 결제 대부분이 올라오고, 브랜드를 모르는
   * 것만 모으면 동네 가게가 끝없이 쌓인다. 겹치는 자리가 "사전에 넣어 두면
   * 다음 달부터 혜택이 붙었을 곳"이다.
   *
   * 이 목록이 없으면 '판교서일주유소'(GS칼텍스 폴인데 이름에 GS가 없다) 같은
   * 가맹점은 사용자가 거래 목록을 눈으로 훑다 우연히 발견하기 전까지 매달
   * 조용히 혜택을 놓친다.
   */
  const unknownMerchants = [
    ...new Set(
      snapshot.unmatchedTransactionIds.flatMap((id) => {
        const tx = txById.get(id);
        if (!tx) return [];
        const name = tx.merchant?.trim() || tx.title;
        return resolveBrand(name) === null ? [name] : [];
      }),
    ),
  ];

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
      {/* 상세에서도 새로고침이 닿아야 한다 — 방금 긁은 카드를 열어 놓고
          대시보드로 나갔다 오게 만들 이유가 없다. */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/" className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ← 대시보드
        </Link>
        <RefreshButton fetchedAt={fetchedAt} />
      </div>

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
            label={`${monthShort(previousMonthKey(month))} 실적 (${monthShort(month)} 혜택을 결정함)`}
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
            label={`${monthShort(month)} 실적 (${monthShort(nextMonthKey(month))} 혜택을 결정함)`}
            value={won(snapshot.currentSpend)}
            note={
              snapshot.nextTier
                ? `${monthShort(nextMonthKey(month))} ${snapshot.nextTier.label} 구간까지 ${won(
                    snapshot.remainingToNextTier,
                  )} 남음`
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
        이번 달에 실제로 뭘로 얼마를 받았나 — 이 화면의 첫 질문이다.
        영역별 소진 현황(아래)은 '한도가 얼마나 찼나'에 답하고, 이 목록은
        '어떤 결제가 그 한도를 채웠나'에 답한다. 둘은 다른 질문이다.
      */}
      <Panel
        title={`${monthShort(month)}에 받은 혜택 ${won(snapshot.totalBenefitUsed)}`}
        subtitle={
          earned.length > 0
            ? `${earned.length}건의 결제에서 받았습니다`
            : undefined
        }
      >
        {earned.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {monthTx.length === 0
              ? `${monthShort(month)} 거래가 아직 없습니다.`
              : `${monthShort(month)}에는 아직 혜택이 붙은 결제가 없습니다. 아래 거래 목록에 건별 이유가 적혀 있습니다.`}
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {earned.map(({ benefit, tx }) => (
              <li key={benefit.transactionId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                    {tx.title}
                  </p>
                  <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {dateTimeShort(tx.approvedAt)} · {won(Math.abs(tx.krwAmount))} ·{' '}
                    {benefit.ruleLabel}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {benefit.netAmount > 0 ? (
                    <p
                      className="text-[13px] font-semibold tabular"
                      style={{ color: 'var(--status-good)' }}
                    >
                      +{won(benefit.netAmount)}
                    </p>
                  ) : (
                    /* 취소로 되돌아간 혜택. 한도가 돌아온 것이라 경고가 아니다. */
                    <p className="text-[13px] tabular" style={{ color: 'var(--text-muted)' }}>
                      −{won(-benefit.netAmount)} 회수
                    </p>
                  )}
                  {/*
                    월 한도에 걸린 것만 알린다.

                    건당 한도(per-tx)는 그 규칙이 원래 그렇게 생긴 것이지
                    사용자가 놓친 게 아니다. 18만원 음식점 결제마다 '한도로
                    17,500원 깎임'이 붙으면 매번 큰 손해를 본 것처럼 읽히는데,
                    실제로는 애초에 건당 1,000원짜리 혜택이다. 반면 월 한도
                    소진은 '이 카드는 이제 그만 쓰라'는 실행 가능한 신호다.
                  */}
                  {benefit.cappedAmount > 0 &&
                    (benefit.cappedBy === 'per-month' || benefit.cappedBy === 'total') && (
                      <p className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
                        {benefit.cappedBy === 'total' ? '통합' : '월'} 한도로{' '}
                        {won(benefit.cappedAmount)} 못 받음
                      </p>
                    )}
                </div>
              </li>
            ))}
          </ul>
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
                  {VERDICT_LABELS[ex.verdict]} · {ex.count}건
                </span>
                <span className="tabular" style={{ color: 'var(--text-primary)' }}>
                  {won(ex.amount)}
                </span>
              </li>
            ))}
          </ul>
          {/* 가맹점 때문이 아니라 '혜택을 받았다'는 이유로 빠진 줄은
              설명이 없으면 오해를 산다 — 앱이 잘못 센 것처럼 보인다. */}
          {snapshot.exclusions.some((ex) => ex.verdict === '제외-혜택') && (
            <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              혜택받은 결제 — 약관상 이 할인을 받은 이용건은 결제액 전체가 실적에서
              빠집니다. 할인은 그대로 받습니다.
            </p>
          )}
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

      {unknownMerchants.length > 0 && (
        <Panel
          title={`이름만으로 못 알아본 가맹점 ${unknownMerchants.length}곳`}
          subtitle="혜택 판정에서만 빠집니다 — 실적 금액에는 그대로 들어갑니다"
        >
          <ul className="flex flex-wrap gap-1.5">
            {unknownMerchants.slice(0, 12).map((name) => (
              <li
                key={name}
                className="rounded-full border px-2.5 py-1 text-[11px]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {name}
              </li>
            ))}
          </ul>
          {unknownMerchants.length > 12 && (
            <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              외 {unknownMerchants.length - 12}곳
            </p>
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            상호에 브랜드가 없는 곳(예: 자영 주유소)은 이름만으로는 어느 브랜드인지
            알 수 없습니다. 아는 곳이 있으면 알려주세요 — 사전에 넣으면 다음 달부터
            혜택이 붙습니다.
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
                    {/* 취소 전표가 되감은 혜택. 한도가 돌아왔다는 뜻이라
                        나쁜 상태가 아니므로 경고색을 쓰지 않는다. */}
                    {benefit && benefit.netAmount < 0 && (
                      <p className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
                        혜택 {won(-benefit.netAmount)} 회수
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
