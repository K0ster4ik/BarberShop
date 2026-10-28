import { PageSkeleton } from "@/components/admin/page-skeleton";

// Запасная граница для страниц админки. Основной шаблон — <Suspense> внутри самой
// страницы вокруг компонента, который проверяет роль и грузит данные (DESIGN.md, раздел 4).
export default function AdminPageLoading() {
  return <PageSkeleton />;
}
