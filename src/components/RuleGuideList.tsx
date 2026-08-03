import type { RuleGuide } from '@/lib/rule-guide';

/**
 * "이 혜택, 어디서 어떻게 써야 받나".
 *
 * 특히 **횟수**를 눈에 띄게 둔다. 금액 한도가 남아 있어도 횟수를 다 쓰면
 * 더 못 받는데, 바만 보면 여유가 있는 것처럼 보인다. 신한 Daily Plan은
 * 영역마다 일 1회·월 5회라 이 함정에 그대로 걸린다.
 */
export function RuleGuideList({ guides }: { guides: RuleGuide[] }) {
  if (guides.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {guides.map((g) => (
        <li key={g.ruleId}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {g.label}
              {g.estimated && (
                <span className="ml-1 text-[10px]" style={{ color: 'var(--status-serious)' }}>
                  (추정)
                </span>
              )}
            </span>
            {g.counts && <CountBadge counts={g.counts} />}
          </div>

          <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {g.targets.join(' · ')}
            {g.moreTargets > 0 && (
              <span style={{ color: 'var(--text-muted)' }}> 외 {g.moreTargets}곳</span>
            )}
          </p>

          {g.conditions.length > 0 && (
            <p className="mt-0.5 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {g.conditions.join(' · ')}
            </p>
          )}

          {/*
            결제하기 전에 알아야 뜻이 있는 한 줄이다. 20% 할인을 받는 대신
            그 결제액이 다음 달 실적에서 통째로 빠지므로, 구간이 빠듯한
            달에는 이 카드를 안 쓰는 게 이득일 수 있다.
          */}
          {g.excludesPerformanceSpend && (
            <p
              className="mt-1 text-[10px] leading-relaxed"
              style={{ color: 'var(--status-serious)' }}
            >
              ⚠ 이 할인을 받으면 결제액 전체가 다음 달 실적에서 빠집니다
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 남은 횟수.
 *
 * 쓴 횟수가 아니라 **남은 횟수**를 앞세운다. "2회 사용"보다 "3회 남음"이
 * 지금 결제해도 되는지에 바로 답한다.
 */
function CountBadge({ counts }: { counts: NonNullable<RuleGuide['counts']> }) {
  const { perDay, perMonth, used, exhausted } = counts;

  const parts: string[] = [];
  if (perMonth !== undefined) {
    parts.push(exhausted ? `월 ${perMonth}회 모두 사용` : `월 ${perMonth - used}회 남음`);
  }
  if (perDay !== undefined) parts.push(`일 ${perDay}회`);

  return (
    <span
      className="shrink-0 rounded px-1.5 py-px text-[10px] font-medium whitespace-nowrap"
      style={
        exhausted
          ? {
              background: 'color-mix(in oklab, var(--status-serious) 16%, transparent)',
              color: 'var(--status-serious)',
            }
          : { background: 'var(--surface)', color: 'var(--text-secondary)' }
      }
    >
      {parts.join(' · ')}
    </span>
  );
}
