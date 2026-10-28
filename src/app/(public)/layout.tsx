import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { SiteThemeProvider } from "@/components/theme-provider";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <SiteThemeProvider>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </SiteThemeProvider>
  );
}
