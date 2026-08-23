import type { Metadata, Viewport } from "next";
import { AppChrome } from "@/components/AppChrome";
import { LocaleProvider } from "@/components/LocaleProvider";
import { InstallBanner, ServiceWorkerRegistrar } from "@/components/PwaBits";
import "./globals.css";

export const metadata: Metadata = {
  title: "CNPAF Collect",
  description: "Field intelligence for CNPAF and Winston Lab",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CNPAF Collect", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f5c4c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <LocaleProvider>
          <ServiceWorkerRegistrar />
          <AppChrome>
            <InstallBanner />
            {children}
          </AppChrome>
        </LocaleProvider>
      </body>
    </html>
  );
}
