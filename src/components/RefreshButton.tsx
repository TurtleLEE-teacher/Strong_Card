'use client';

import { useTransition } from 'react';
import { refreshData } from '@/app/actions';
import { timeShort } from '@/lib/format';

/**
 * 수동 새로고침.
 *
 * ISR 캐시가 300초라 카드를 긁고 바로 앱을 열면 최대 5분 동안 낡은
 * 화면을 본다. 앱을 껐다 켜도 캐시는 그대로여서 사용자가 할 수 있는
 * 일이 없었다 — 결제 직후에 여는 앱에서 이건 치명적이다.
 *
 * 시각을 항상 같이 보여준다. 버튼만 있으면 눌러도 뭐가 달라졌는지 알 수
 * 없고, 이미 최신인데 계속 누르게 된다. 'HH:mm 기준'은 서버에서 만든
 * 문자열이라 hydration이 어긋나지 않는다.
 */
export function RefreshButton({ fetchedAt }: { fetchedAt: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => refreshData())}
      aria-label={`데이터 새로고침 (현재 ${timeShort(fetchedAt)} 기준)`}
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity disabled:opacity-60"
      style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}
    >
      <span aria-hidden className={pending ? 'spin' : undefined}>
        ↻
      </span>
      <span className="tabular">{pending ? '갱신 중' : `${timeShort(fetchedAt)} 기준`}</span>
    </button>
  );
}
