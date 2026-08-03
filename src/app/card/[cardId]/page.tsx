import { ACTIVE_CARDS } from '@/config/cards';
import { CardDetailView } from '@/components/views/CardDetailView';

export const revalidate = 300;

export function generateStaticParams() {
  return ACTIVE_CARDS.map((c) => ({ cardId: c.id }));
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  return <CardDetailView cardId={cardId} />;
}
