import Link from 'next/link';
import { ACTIVE_CARDS } from '@/config/cards';
import { getDashboardData } from '@/lib/data';
import { recommendCards, type Recommendation } from '@/lib/engine/recommend';
import { percent, won } from '@/lib/format';
import type { TxCategory } from '@/lib/types';

export const revalidate = 300;

const CATEGORIES: TxCategory[] = [
  '식비', '카페', '교통', '생활', '의료', '교육', '여가', '구독', '업무', '금융', '기타',
];

/**
 * "이 결제, 어느 카드로?"
 *
 * GET 폼으로 만든다. 자바스크립트 없이도 동작하고, 결과 URL을 그대로
 * 공유·북마크할 수 있다. 계산은 전부 서버에서 한다.
 */
export default async function RecommendPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; amount?: string; category?: string }>;
}) {
  const params = await searchParams;
  const merchant = params.merchant?.trim() ?? '';
  const amount = Number(params.amount ?? '');
  const category = (params.category as TxCategory) || null;

  const hasQuery = merchant.length > 0 && Number.isFinite(amount) && amount > 0;

  let results: Recommendation[] = [];
  if (hasQuery) {
    const { snapshots } = await getDashboardData();
    results = recommendCards(ACTIVE_CARDS, snapshots, { merchant, amount, category });
  }

  const best = results[0];
  const hasAnyBenefit = best && best.expectedBenefit > 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-16 sm:px-6">
      <Link href="/" className="mb-5 inline-block text-xs" style={{ color: 'var(--text-muted)' }}>
        ← 대시보드
      </Link>

      <h1 className="mb-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        이 결제, 어느 카드로?
      </h1>
      <p className="mb-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        남은 한도까지 반영해 실제로 받을 금액으로 줄을 세웁니다.
      </p>

      <form
        method="GET"
        className="mb-4 rounded-2xl border p-4 sm:p-5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="space-y-3">
          <Field label="가맹점">
            <input
              name="merchant"
              defaultValue={merchant}
              required
              placeholder="예: 스타벅스 강남점"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </Field>

          <div className="flex gap-3">
            <Field label="금액 (원)" className="flex-1">
              <input
                name="amount"
                type="number"
                inputMode="numeric"
                min={1}
                defaultValue={Number.isFinite(amount) && amount > 0 ? amount : ''}
                required
                placeholder="20000"
                className="w-full rounded-lg border px-3 py-2 text-sm tabular outline-none"
                style={{
                  background: 'var(--surface-alt)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </Field>

            <Field label="카테고리 (선택)" className="flex-1">
              <select
                name="category"
                defaultValue={category ?? ''}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{
                  background: 'var(--surface-alt)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">—</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <button
          type="submit"
          className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ background: 'var(--meter-accent)', color: '#fff' }}
        >
          추천받기
        </button>

        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          가맹점명을 못 알아보면 카테고리로 대신 판단합니다.
        </p>
      </form>

      {hasQuery && (
        <>
          {hasAnyBenefit ? (
            <div
              className="mb-3 rounded-2xl border p-4 sm:p-5"
              style={{
                background: `color-mix(in oklab, var(--series-${best.slot}) 8%, var(--surface))`,
                borderColor: `color-mix(in oklab, var(--series-${best.slot}) 35%, transparent)`,
              }}
            >
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                추천
              </p>
              <div className="mt-1 flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: `var(--series-${best.slot})` }}
                />
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {best.cardName}
                </h2>
              </div>
              <p
                className="mt-2 text-3xl font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {won(best.expectedBenefit)}
                <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                  {best.ruleType === 'discount' ? '할인' : '적립'}
                </span>
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {best.ruleLabel}
              </p>
              {best.reason && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--status-serious)' }}>
                  {best.reason}
                </p>
              )}
              {best.performanceNote && (
                <p className="mt-2 text-xs font-medium" style={{ color: 'var(--status-good)' }}>
                  ↑ {best.performanceNote}
                </p>
              )}
            </div>
          ) : (
            <div
              className="mb-3 rounded-2xl border p-4 text-xs leading-relaxed sm:p-5"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>
                이 결제에 혜택을 주는 카드가 없습니다.
              </strong>
              <br />
              가맹점명을 다르게 적어보거나 카테고리를 지정해 보세요. 브랜드 사전에 없는
              가맹점일 수 있습니다.
            </div>
          )}

          <section
            className="rounded-2xl border p-4 sm:p-5"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <h2 className="mb-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              카드별 비교
            </h2>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {results.map((r) => (
                <li key={r.cardId} className="flex items-start gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{ background: `var(--series-${r.slot})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      {r.cardName}
                    </p>
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                      {r.ruleLabel ?? r.reason}
                    </p>
                    {r.ruleLabel && r.reason && (
                      <p
                        className="text-[11px] leading-snug"
                        style={{ color: 'var(--status-serious)' }}
                      >
                        {r.reason}
                      </p>
                    )}
                    {r.performanceNote && (
                      <p className="text-[11px]" style={{ color: 'var(--status-good)' }}>
                        {r.performanceNote}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className="text-[13px] font-semibold tabular"
                      style={{
                        color:
                          r.expectedBenefit > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {won(r.expectedBenefit)}
                    </p>
                    {r.expectedBenefit > 0 && (
                      <p className="text-[11px] tabular" style={{ color: 'var(--text-muted)' }}>
                        {percent(r.effectiveRate)}
                      </p>
                    )}
                    {r.cappedAmount > 0 && (
                      <p className="text-[11px] tabular" style={{ color: 'var(--status-serious)' }}>
                        −{won(r.cappedAmount)} 한도
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
