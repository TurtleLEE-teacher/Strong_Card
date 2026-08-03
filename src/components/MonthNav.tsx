import Link from 'next/link';
import {
  EARLIEST_MONTH,
  currentMonthKey,
  nextMonthKey,
  previousMonthKey,
  type MonthKey,
} from '@/lib/date';
import { monthLabel } from '@/lib/format';

/**
 * 월 이동 — 화면 제목 자리에 붙는다.
 *
 * 이 앱은 결제 직후에 여는 앱이라 기본은 언제나 이번 달이다. 지난달은
 * "그때 얼마나 받았더라"를 확인하러 가끔 들어가는 곳이므로, 화살표 두 개
 * 이상을 쓰지 않는다. 달력 팝업이나 드롭다운은 이 빈도에 비해 과하다.
 *
 * **다음 달로는 못 간다.** 오지 않은 달은 거래가 없어 모든 카드가 0원으로
 * 뜨는데, 그건 '혜택을 못 받았다'와 화면상 구분이 안 된다. 갈 수 없는
 * 방향은 버튼을 없애는 대신 흐리게 남긴다 — 사라지면 옆 버튼이 자리를
 * 옮겨서 연타할 때 손이 헛나간다.
 */
export function MonthNav({
  month,
  /**
   * 그 달의 주소. `lib/routes.ts`의 dashboardHref·cardHref를 그대로 넘긴다.
   *
   * 서버 컴포넌트끼리 주고받는 값이라 함수를 넘겨도 직렬화 경계를 넘지
   * 않는다. 접두사 문자열로 받으면 이번 달만 주소가 다른 규칙을 여기서
   * 한 번 더 쓰게 되고, 그 규칙이 두 벌이 되는 순간 갈라진다.
   */
  href,
  /**
   * 이 달 이름이 그 화면의 제목인가.
   *
   * 대시보드에서는 달이 곧 제목이지만 카드 상세에서는 카드 이름이 제목이다.
   * 양쪽 다 h1으로 그리면 상세 화면에 h1이 둘 생겨 스크린리더가 문서 구조를
   * 잘못 읽는다.
   */
  asHeading = false,
}: {
  month: MonthKey;
  href: (month: MonthKey) => string;
  asHeading?: boolean;
}) {
  const now = currentMonthKey();
  const prev = previousMonthKey(month);
  const next = nextMonthKey(month);
  const canGoBack = prev >= EARLIEST_MONTH;
  const canGoForward = next <= now;

  return (
    <div className="flex items-center gap-1">
      <Arrow href={canGoBack ? href(prev) : null} label={`${monthLabel(prev)}로`}>
        ‹
      </Arrow>
      {asHeading ? (
        <h1 className="text-lg font-semibold tabular" style={{ color: 'var(--text-primary)' }}>
          {monthLabel(month)}
        </h1>
      ) : (
        <span className="text-sm font-semibold tabular" style={{ color: 'var(--text-primary)' }}>
          {monthLabel(month)}
        </span>
      )}
      <Arrow href={canGoForward ? href(next) : null} label={`${monthLabel(next)}로`}>
        ›
      </Arrow>

      {/*
        지난달을 보다가 이번 달로 돌아오는 길. 화살표만 있으면 6월에서
        이번 달까지 두세 번을 눌러야 하고, 그 사이에 자기가 몇 월을 보고
        있는지 놓친다.
      */}
      {month !== now && (
        <Link
          href={href(now)}
          className="ml-1 rounded-full px-2 py-0.5 text-[11px] hover:underline"
          style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
        >
          이번 달
        </Link>
      )}
    </div>
  );
}

function Arrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const shared =
    'flex size-6 shrink-0 items-center justify-center rounded-full text-sm leading-none';

  if (!href) {
    return (
      <span aria-hidden className={shared} style={{ color: 'var(--border)' }}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={`${shared} transition-colors hover:bg-[var(--surface-alt)]`}
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </Link>
  );
}
