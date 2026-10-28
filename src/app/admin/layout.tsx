import { AdminThemeProvider } from "@/components/theme-provider";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminThemeProvider>{children}</AdminThemeProvider>;
}
