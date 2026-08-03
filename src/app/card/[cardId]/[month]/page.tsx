import { notFound } from 'next/navigation';
import { CardDetailView } from '@/components/views/CardDetailView';
import { EARLIEST_MONTH, isFutureMonth, isMonthKey } from '@/lib/date';

/**
 * 지난달 카드 상세.
 *
 * 대시보드와 같은 이유로 달을 경로로 받는다 — searchParams를 읽으면 ISR이
 * 꺼지고 화면을 열 때마다 Notion을 긁게 된다.
 */
export const revalidate = 300;

/** 빈 배열 — 없으면 ISR이 꺼진다. `/m/[month]`와 같은 이유다. */
export function generateStaticParams() {
  return [];
}

export default async function CardDetailMonthPage({
  params,
}: {
  params: Promise<{ cardId: string; month: string }>;
}) {
  const { cardId, month } = await params;

  if (!isMonthKey(month) || month < EARLIEST_MONTH || isFutureMonth(month)) notFound();

  return <CardDetailView cardId={cardId} month={month} />;
}
