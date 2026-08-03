import { notFound } from 'next/navigation';
import { DashboardView } from '@/components/views/DashboardView';
import { EARLIEST_MONTH, isFutureMonth, isMonthKey } from '@/lib/date';

/**
 * 지난달 대시보드.
 *
 * 달을 쿼리스트링(`/?month=…`)이 아니라 **경로**로 받는다. searchParams를
 * 읽는 순간 페이지가 요청 시점 렌더로 내려가면서 ISR 캐시가 통째로 없어지고,
 * 그러면 화면을 열 때마다 Notion을 긁는다 — 3 req/s 제한이 있는 API다.
 * 경로 세그먼트는 달마다 따로 캐시되므로 `/`와 같은 300초 규칙이 그대로 산다.
 */
export const revalidate = 300;

/**
 * 빈 배열을 돌려준다.
 *
 * 빌드 시점에 미리 만들 달은 없지만(어차피 지난달은 몇 개 안 열어 본다),
 * **이 함수가 아예 없으면 라우트가 통째로 요청 시점 렌더가 되어 ISR이
 * 꺼진다.** 빈 배열이면 처음 열 때 한 번 만들고 그 뒤 300초 동안 캐시된다.
 */
export function generateStaticParams() {
  return [];
}

export default async function MonthDashboardPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;

  // 형식이 깨진 값은 monthRangeUtc가 조용히 옆 달로 넘겨 버린다.
  // 없는 달을 그럴듯한 화면으로 보여주느니 404가 낫다.
  if (!isMonthKey(month) || month < EARLIEST_MONTH || isFutureMonth(month)) notFound();

  return <DashboardView month={month} />;
}
