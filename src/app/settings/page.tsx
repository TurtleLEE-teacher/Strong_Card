import Link from 'next/link';
import { ACTIVE_CARDS } from '@/config/cards';
import { PushSetup } from '@/components/PushSetup';
import { getDashboardData } from '@/lib/data';
import { dateTimeShort, won } from '@/lib/format';
import { WARNING_DAYS } from '@/lib/alerts/rules';

export const revalidate = 300;

export default async function SettingsPage() {
  const { unmapped, isDemo, error } = await getDashboardData();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-16 sm:px-6">
      <Link href="/" className="mb-5 inline-block text-xs" style={{ color: 'var(--text-muted)' }}>
        ← 대시보드
      </Link>

      <h1 className="mb-6 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        설정
      </h1>

      <Panel title="알림">
        <PushSetup vapidPublicKey={vapidPublicKey} />
        {!vapidPublicKey && (
          <p className="mt-3 text-[11px]" style={{ color: 'var(--status-serious)' }}>
            VAPID 공개키가 없습니다. <code>npx web-push generate-vapid-keys</code>로 생성한 뒤
            환경변수에 넣어야 알림이 동작합니다.
          </p>
        )}

        <ul className="mt-4 space-y-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          <li>· 혜택이 적용되면 바로 알립니다</li>
          <li>· 실적이 모자라면 월말 D-{WARNING_DAYS.join(' / D-')}에 알립니다</li>
          <li>· 실적 구간을 달성하면 알립니다</li>
          <li>· 혜택 한도를 80% / 100% 쓰면 알립니다</li>
        </ul>
      </Panel>

      {/*
        미분류를 조용히 삼키면 혜택 누락을 영원히 못 찾는다.
        여기서 계속 보이게 두는 것이 이 화면의 존재 이유다.
      */}
      <Panel title={`카드 미매핑 거래 ${unmapped.length}건`}>
        {unmapped.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            모든 거래가 카드에 매핑되었습니다.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--status-serious)' }}>
              원문에서 카드 뒷 4자리를 찾지 못한 거래입니다. 이 거래들은{' '}
              <strong>어떤 카드의 실적에도 반영되지 않습니다.</strong> 노션에서 `카드 뒷4자리`를
              직접 채우면 다음 동기화 때 반영됩니다.
            </p>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {unmapped.slice(0, 30).map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                      {tx.title}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {dateTimeShort(tx.approvedAt)}
                      {tx.issuer && ` · ${tx.issuer}`}
                      {tx.last4 && ` · ${tx.last4} (등록되지 않은 카드)`}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] tabular" style={{ color: 'var(--text-primary)' }}>
                    {won(tx.krwAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="등록된 카드">
        <ul className="space-y-2">
          {ACTIVE_CARDS.map((card) => (
            <li key={card.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: `var(--series-${card.slot})` }}
              />
              <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--text-primary)' }}>
                {card.name}
              </span>
              <span className="shrink-0 text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
                {card.last4.join(', ')}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          카드를 추가하거나 뒷 4자리를 바꾸려면 <code>src/config/cards/</code>를 수정하세요.
        </p>
      </Panel>

      <Panel title="데이터 소스">
        {isDemo ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--status-warning)' }}>
            <strong>데모 데이터</strong>
            {error ? ` — Notion 연결 실패: ${error}` : ' — NOTION_API_KEY가 설정되지 않았습니다.'}
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--status-good)' }}>
            Notion에 연결됨
          </p>
        )}
      </Panel>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-3 rounded-2xl border p-4 sm:p-5"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
