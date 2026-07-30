import Link from 'next/link';
import { CARDS_BY_ID } from '@/config/cards';
import { CardWidget } from '@/components/CardWidget';
import { getDashboardData } from '@/lib/data';
import { monthLabel, won } from '@/lib/format';

export const revalidate = 300; // Notion API 3req/s 제한 회피

export default async function DashboardPage() {
  const { month, snapshots, unmapped, daysRemaining, isDemo, error } =
    await getDashboardData();

  const totalBenefit = snapshots.reduce((sum, s) => sum + s.totalBenefitUsed, 0);
  const totalSpend = snapshots.reduce((sum, s) => sum + s.currentSpend, 0);

  // 실적이 모자란 채로 월말이 가까운 카드 — 대시보드 상단에서 먼저 알린다
  const atRisk = snapshots.filter((s) => {
    const card = CARDS_BY_ID[s.cardId];
    return card.performance.required && s.nextTier !== null;
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-16 sm:px-6">
      <header className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {monthLabel(month)}
          </h1>
          <div className="flex items-baseline gap-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {daysRemaining === 0 ? '오늘이 말일' : `${daysRemaining}일 남음`}
            </p>
            <Link
              href="/settings"
              className="text-xs hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              설정
            </Link>
          </div>
        </div>

        {/* 히어로 숫자는 화면당 하나. 이 앱이 존재하는 이유가 이 숫자다. */}
        <p className="mt-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          이번 달 받은 혜택
        </p>
        <p
          className="text-5xl font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {won(totalBenefit)}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          총 사용 {won(totalSpend)}
          {totalSpend > 0 &&
            ` · 실질 환원율 ${((totalBenefit / totalSpend) * 100).toFixed(1)}%`}
        </p>
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

      {unmapped.length > 0 && (
        <Notice tone="serious">
          카드를 식별하지 못한 거래 <strong>{unmapped.length}건</strong> — 원문에서 뒷 4자리를
          찾지 못했습니다. 이 거래들은 어떤 카드의 실적에도 반영되지 않습니다.
        </Notice>
      )}

      {atRisk.length > 0 && daysRemaining <= 7 && (
        <Notice tone="warning">
          월말까지 {daysRemaining}일 — 실적을 더 채워야 하는 카드 {atRisk.length}장이 있습니다.
        </Notice>
      )}

      <div className="space-y-3">
        {snapshots.map((snapshot) => (
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
