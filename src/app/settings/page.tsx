import Link from 'next/link';
import { ACTIVE_CARDS, CARDS_BY_ID } from '@/config/cards';
import { PushSetup } from '@/components/PushSetup';
import { excludesSpendFromPerformance } from '@/lib/engine/performance';
import { getDashboardData } from '@/lib/data';
import { dateTimeShort, won } from '@/lib/format';
import { previousMonthKey } from '@/lib/date';
import { WARNING_DAYS } from '@/lib/alerts/rules';
import { ThemeToggle } from '@/components/ThemeToggle';
import { brandDisplayName } from '@/config/merchants';

export const revalidate = 300;

/**
 * 아직 검증되지 않은 숫자를 모은다.
 * 구간표와 혜택 룰 각각의 `confidence`를 본다.
 */
function collectUnverified() {
  const items: { key: string; cardName: string; label: string; detail: string }[] = [];

  for (const card of ACTIVE_CARDS) {
    if (card.performance.required && card.performance.tierConfidence !== 'confirmed') {
      items.push({
        key: `${card.id}:tiers`,
        cardName: card.shortName,
        label: '실적 구간표',
        detail: card.performance.tiers
          .filter((t) => t.threshold > 0)
          .map((t) => `${t.label} → ${t.totalBenefitCap?.toLocaleString('ko-KR') ?? '무제한'}원`)
          .join(' · '),
      });
    }

    for (const rule of card.benefits) {
      if (rule.confidence === 'confirmed') continue;
      items.push({
        key: `${card.id}:${rule.id}`,
        cardName: card.shortName,
        label: rule.label,
        detail: `요율 ${Number((rule.rate * 100).toFixed(2))}%`,
      });
    }
  }

  return items;
}

export default async function SettingsPage() {
  const { unmapped, snapshots, transactions, month, isDemo, error } = await getDashboardData();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  const unverified = collectUnverified();

  /*
   * 노션에서 브랜드를 지정해 둔 가맹점.
   *
   * 지정이 먹었는지 확인할 자리가 있어야 한다. 노션에 적어 놓고 화면에서
   * 아무 변화가 없으면, 잘못 적은 건지 앱이 아직 못 읽은 건지 알 길이 없다.
   */
  const designated = [
    ...new Map(
      transactions
        .filter((tx) => tx.brand)
        .map((tx) => [
          `${tx.merchant?.trim() || tx.title}`,
          {
            merchant: tx.merchant?.trim() || tx.title,
            brand: tx.brandLabel ?? brandDisplayName(tx.brand!),
          },
        ]),
    ).values(),
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-16 sm:px-6">
      <Link href="/" className="mb-5 inline-block text-xs" style={{ color: 'var(--text-muted)' }}>
        ← 대시보드
      </Link>

      <h1 className="mb-6 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        설정
      </h1>

      {/*
        전월실적은 이 앱의 모든 숫자가 걸린 값이다. Notion에 지난달 거래가
        없으면 계산할 수 없고, 그 상태를 감추면 화면이 통째로 거짓말을 한다.
        무엇이 비었는지, 어떻게 채우는지를 여기서 다 보여준다.
      */}
      <Panel title="전월실적">
        <ul className="space-y-2">
          {snapshots
            .filter((s) => CARDS_BY_ID[s.cardId].performance.required)
            .map((s) => {
              const card = CARDS_BY_ID[s.cardId];
              const unknown = s.previousSpendSource === 'unknown';
              return (
                <li key={s.cardId} className="flex items-baseline justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>{card.shortName}</span>
                  <span className="shrink-0 text-right">
                    <span
                      className="tabular"
                      style={{ color: unknown ? 'var(--status-serious)' : 'var(--text-primary)' }}
                    >
                      {unknown ? '기록 없음' : won(s.previousSpend)}
                    </span>
                    <span className="ml-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {s.previousSpendSource === 'manual'
                        ? '직접 입력'
                        : s.previousSpendSource === 'computed'
                          ? '거래로 계산'
                          : '확인 필요'}
                    </span>
                  </span>
                </li>
              );
            })}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          &#39;기록 없음&#39;은 실적이 <strong>0원이라는 뜻이 아니라</strong>{' '}Notion에 그 달
          거래가 없어 계산할 수 없다는 뜻입니다. 거래가 쌓이면 자동으로 계산값으로 바뀝니다.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          급하면 카드사 앱에서 본 금액을 <strong>월을 지정해</strong> 넣을 수 있습니다. Vercel
          &gt; Settings &gt; Environment Variables에 저장하면 자동 재배포됩니다.
        </p>
        <pre
          className="mt-2 max-w-full overflow-x-auto rounded-lg p-2.5 text-[10px] leading-relaxed break-all whitespace-pre-wrap"
          style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
        >
          MANUAL_MONTHLY_SPEND=&#123;&quot;{previousMonthKey(month)}&quot;:&#123;
          {snapshots
            .filter((s) => CARDS_BY_ID[s.cardId].performance.required)
            .map((s) => `"${s.cardId}":0`)
            .join(',')}
          &#125;&#125;
        </pre>
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <strong>월을 못 박는 이유:</strong> &#39;전월실적&#39;으로 넣으면 같은 값이 달이 바뀔
          때마다 다른 달을 뜻하게 되어 조용히 틀려집니다. 월을 적어 두면 그 달 화면에서만
          쓰이고, 다음 달은 알아서 다음 값을 찾습니다.
        </p>
      </Panel>

      {/*
        "혜택을 받으면 실적에서 빠지는 결제"가 어디인지 한 자리에 모은다.

        이 규칙은 카드마다 다르고, 같은 카드 안에서도 영역마다 다르다
        (탄탄대로는 Trendy만 빠지고 Daily는 그대로 인정된다). 화면 여기저기
        흩어져 있으면 "내 주유 6만원은 실적에 들어간 건가"에 답할 데가 없다.
      */}
      <Panel title="혜택을 받으면 실적에서 빠지는 결제">
        <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          아래 영역에서 할인을 받으면 <strong>결제액 전체</strong>가 다음 달 실적에서 빠집니다.
          할인은 그대로 받습니다 — 빠지는 건 실적뿐입니다. 여기 없는 영역은 할인을 받아도
          결제액이 실적에 그대로 인정됩니다.
        </p>
        <ul className="space-y-2">
          {ACTIVE_CARDS.map((card) => {
            const excluded = card.benefits.filter((rule) =>
              excludesSpendFromPerformance(card, rule),
            );
            return (
              <li key={card.id} className="flex items-start justify-between gap-3 text-xs">
                <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {card.shortName}
                </span>
                <span className="min-w-0 text-right">
                  {excluded.length === 0 ? (
                    <span className="text-[11px]" style={{ color: 'var(--status-good)' }}>
                      전부 실적 인정
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--status-serious)' }}>
                      {excluded.map((r) => r.label).join(' · ')}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          근거는 각 카드 약관의 <strong>이용실적 제외 대상</strong> 문구입니다. 탄탄대로는
          &#39;Trendy서비스 받은 이용건&#39;만 제외 대상이라, 같은 카드라도 주유·대중교통·커피
          같은 Daily 서비스 할인은 결제액이 실적에 그대로 남습니다.
        </p>
      </Panel>

      <Panel title="화면">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            테마
          </p>
          <ThemeToggle />
        </div>
      </Panel>

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

      {/*
        이름만으로는 브랜드를 알 수 없는 가맹점이 있다 — 자영 주유소는 간판(폴)과
        상호가 따로 논다. 사람만 아는 사실이라 노션에서 받고, 받았다는 것을 여기서
        되돌려 보여 준다.
      */}
      <Panel title={`노션에서 지정한 가맹점 브랜드 ${designated.length}곳`}>
        <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          노션 거래 DB의 <strong>브랜드</strong> 열에서 고르면 됩니다. 상호에 브랜드가
          없는 가맹점(예: <span className="whitespace-nowrap">판교서일주유소</span> =
          GS칼텍스)을 알려주는 칸입니다. 한 번만 지정하면 같은 가맹점의 다른 달 거래에도
          적용되고, 이름 사전보다 우선합니다. 열이 안 보이면 다음 동기화 때 생깁니다.
        </p>
        {designated.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            아직 지정한 가맹점이 없습니다.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {designated.map((d) => (
              <li key={d.merchant} className="flex items-center gap-3 py-2">
                <span
                  className="min-w-0 flex-1 truncate text-[13px]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {d.merchant}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--status-good)' }}>
                  {d.brand}
                </span>
              </li>
            ))}
          </ul>
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

      {/*
        추정치를 확정인 척 보여주면 사용자는 틀린 숫자를 믿게 된다.
        어떤 숫자가 아직 검증되지 않았는지 여기서 계속 드러낸다.
      */}
      {unverified.length > 0 && (
        <Panel title={`확인이 필요한 혜택 규칙 ${unverified.length}건`}>
          <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            공개 자료만으로 확정하지 못한 숫자입니다. 카드사 이용대금명세서나 앱의 혜택
            상세와 비교해 다르면 <code>src/config/cards/</code>를 고쳐주세요. 카드 상세의{' '}
            <strong>카드사 누계 대조</strong>도 검증에 도움이 됩니다.
          </p>
          <ul className="space-y-2">
            {unverified.map((item) => (
              <li key={item.key} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: 'var(--status-serious)' }}
                />
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
                    {item.cardName} · {item.label}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

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
