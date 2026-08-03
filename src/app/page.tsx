import { DashboardView } from '@/components/views/DashboardView';

export const revalidate = 300; // Notion API 3req/s 제한 회피

export default async function DashboardPage() {
  return <DashboardView />;
}
