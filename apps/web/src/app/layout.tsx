import type { Metadata, Viewport } from "next";
import { Noto_Sans_SC } from "next/font/google";
import { AppChrome } from "@/components/AppChrome";
import { LocaleProvider } from "@/components/LocaleProvider";
import { InstallBanner, ServiceWorkerRegistrar } from "@/components/PwaBits";
import { getInsightRuntimeConfig } from "@/config/server";
import "./globals.css";
import "./adaptive-design.css";

const cnpafSans = Noto_Sans_SC({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-cnpaf",
  weight: "variable",
});

const directionContract = `<!--
THESIS: One CNPAF identity adapts to three real working scenes instead of forcing every role into a generic dashboard.
OWN-WORLD: Institutional blue, human orange, cool archival paper, disciplined rules, compact data typography, and one 12px component radius.
STORY: Volunteers complete reliable field work, reviewers turn submissions into approved evidence, and administrators maintain the system without losing context.
FIRST VIEWPORT: Field users see today's work sheet, reviewers see an evidence docket, and administrators see a dense branded control surface with the primary action in reach.
FORM: Adaptive Evidence System, grounded direction 5, seed 43c0ea9d, recomposed by the user around role-specific surfaces.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export const metadata: Metadata = {
  title: "CNPAF Community",
  description:
    "Secure field collection, review, and research evidence workflows for CNPAF.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "CNPAF Community",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#036EB7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { liveRefreshMs } = getInsightRuntimeConfig();
  return (
    <html
      data-insight-refresh-ms={liveRefreshMs}
      data-scroll-behavior="smooth"
      lang="zh"
      suppressHydrationWarning
    >
      <body className={cnpafSans.variable}>
        <template
          data-impeccable-contract="43c0ea9d"
          dangerouslySetInnerHTML={{ __html: directionContract }}
        />
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
