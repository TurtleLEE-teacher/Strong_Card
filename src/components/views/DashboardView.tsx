import Link from 'next/link';
import { CARDS_BY_ID } from '@/config/cards';
import { CardWidget } from '@/components/CardWidget';
import { MonthNav } from '@/components/MonthNav';
import { RefreshButton } from '@/components/RefreshButton';
import { getDashboardData } from '@/lib/data';
import { byBenefitDesc } from '@/lib/card-status';
import { dashboardHref } from '@/lib/routes';
import { monthShort, won } from '@/lib/format';
import type { MonthKey } from '@/lib/date';

/**
 * 대시보드 본문.
 *
 * `/`(이번 달)와 `/m/[month]`(지난달)가 같은 화면을 그린다. 두 라우트가
 * 각자 그리면 지난달 화면에만 기능이 빠지거나 숫자가 갈라진다 — 이 앱에서
 * 가장 나쁜 실패다.
 */
export async function DashboardView({ month }: { month?: MonthKey }) {
  const {
    month: viewMonth,
    snapshots,
    unmapped,
    daysRemaining,
    isCurrentMonth,
    fetchedAt,
    isDemo,
    error,
  } = await getDashboardData(month);

  const totalBenefit = snapshots.reduce((sum, s) => sum + s.totalBenefitUsed, 0);
  // '총 사용'은 말 그대로 쓴 돈이다 — 실적 인정액(currentSpend)이 아니다.
  // 제외분을 빼고 세면 세금·상품권을 쓴 달에 사용액이 실제보다 작게 나오고,
  // 환원율은 분모가 줄어 부풀려진다. 하이패스 캐시백처럼 제외 거래에도 붙는
  // 혜택이 분자에는 들어가 있으므로 분모도 같은 기준이어야 한다.
  const totalSpend = snapshots.reduce((sum, s) => sum + s.currentSpend + s.excludedSpend, 0);

  // 혜택을 많이 받은 카드부터. 등록 순서는 지갑에 꽂은 순서일 뿐,
  // "이번 달 어느 카드가 일하고 있나"에 답하지 않는다.
  const ordered = byBenefitDesc(snapshots);

  // 지난달 거래가 없어 전월실적을 모르는 카드
  const tierUnknownCards = snapshots.filter(
    (s) => CARDS_BY_ID[s.cardId].performance.required && s.previousSpendSource === 'unknown',
  );

  // 실적이 모자란 채로 월말이 가까운 카드 — 대시보드 상단에서 먼저 알린다.
  // 지난달을 보고 있을 땐 뜻이 없다. 이미 끝난 달을 두고 "더 채우세요"라고
  // 재촉하는 건 할 수 있는 일이 없는 경고다.
  const atRisk = isCurrentMonth
    ? snapshots.filter((s) => {
        const card = CARDS_BY_ID[s.cardId];
        return card.performance.required && s.nextTier !== null;
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-16 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <MonthNav month={viewMonth} href={(m) => dashboardHref(m)} asHeading />
          <div className="flex items-center gap-2">
            {isCurrentMonth && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {daysRemaining === 0 ? '오늘이 말일' : `${daysRemaining}일 남음`}
              </p>
            )}
            {/* 결제 직후에 여는 앱이다. 새로고침은 설정보다 손에 가까워야 한다. */}
            <RefreshButton fetchedAt={fetchedAt} />
            <Link
              href="/settings"
              className="text-xs hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              설정
            </Link>
          </div>
        </div>

        {/* 히어로 숫자는 화면당 하나. 이 앱이 존재하는 이유가 이 숫자다.
            큰 숫자에는 tabular를 쓰지 않는다 — 자간이 헐거워 보인다.

            달을 이름으로 못 박는다. '이번 달'은 읽는 사람이 달력을 떠올려야
            뜻이 서는 말이고, 바로 아래에 '7월 실적 기준'이라는 줄이 따라오면
            이 숫자까지 지난달 것으로 읽힌다. */}
        <p className="mt-5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {monthShort(viewMonth)}에 받은 혜택
          {!isCurrentMonth && ' (마감된 달)'}
        </p>
        <p
          className="text-5xl font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {won(totalBenefit)}
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          총 사용 {won(totalSpend)}
          {totalSpend > 0 &&
            ` · 실질 환원율 ${((totalBenefit / totalSpend) * 100).toFixed(1)}%`}
        </p>

        {/* 결제 직전에 여는 화면이다. 이 앱의 주 행동이므로 칩이 아니라
            폭을 다 쓰는 버튼으로 둔다. 지난달을 보고 있을 땐 추천이 지금
            쓸 카드를 말하는 것이라 화면의 달과 어긋난다 — 감춘다. */}
        {isCurrentMonth && (
          <Link
            href="/recommend"
            className="mt-5 flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--text-primary)', color: 'var(--background)' }}
          >
            <span>이 결제, 어느 카드로?</span>
            <span aria-hidden>→</span>
          </Link>
        )}
      </header>

      {isDemo && (
        <Notice tone="warning">
          <strong>데모 데이터로 표시 중</strong>
          {error ? (
            <> — Notion 연결 실패: {error}</>
          ) : (
            <> — .env.local에 NOTION_API_KEY를 설정하면 실제 거래로 바뀝니다.</>
          )}
        </Notice>
      )}

      {/*
        지난달 거래가 없는 카드 — 실적을 '모르는' 상태다. 이걸 알리지 않으면
        모든 카드가 '실적 미달'로 보이면서 혜택이 0원으로 나오고, 사용자는
        앱이 고장 났다고 생각하게 된다.
      */}
      {tierUnknownCards.length > 0 && (
        <Notice tone="warning">
          <strong>{tierUnknownCards.length}장</strong>의 카드에 지난달 거래 기록이 없어 전월실적을
          알 수 없습니다. 혜택 한도가 0원으로 보이는 건 실적이 모자라서가 아니라 데이터가 없어서
          입니다. 카드사 앱의 전월실적을 <code>MANUAL_MONTHLY_SPEND</code> 환경변수에 넣으면
          정확해집니다 — <Link href="/settings" className="underline">설정</Link>에서 방법을 볼 수
          있습니다.
        </Notice>
      )}

      {unmapped.length > 0 && (
        <Notice tone="serious">
          카드를 식별하지 못한 거래 <strong>{unmapped.length}건</strong> — 원문에서 뒷 4자리를
          찾지 못했습니다. 이 거래들은 어떤 카드의 실적에도 반영되지 않습니다.
        </Notice>
      )}

      {atRisk.length > 0 && daysRemaining !== null && daysRemaining <= 7 && (
        <Notice tone="warning">
          월말까지 {daysRemaining}일 — 실적을 더 채워야 하는 카드 {atRisk.length}장이 있습니다.
        </Notice>
      )}

      <div className="space-y-3">
        {ordered.map((snapshot) => (
          <CardWidget
            key={snapshot.cardId}
            card={CARDS_BY_ID[snapshot.cardId]}
            snapshot={snapshot}
            daysRemaining={daysRemaining}
          />
        ))}
      </div>
    </main>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: 'warning' | 'serious';
  children: React.ReactNode;
}) {
  const color = tone === 'warning' ? 'var(--status-warning)' : 'var(--status-serious)';
  return (
    <div
      className="mb-3 rounded-xl border px-3 py-2.5 text-xs leading-relaxed"
      style={{
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
        background: `color-mix(in oklab, ${color} 10%, var(--surface))`,
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  );
}
