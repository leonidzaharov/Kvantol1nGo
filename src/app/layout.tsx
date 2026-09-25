import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  // База для абсолютных URL в og/canonical. Прод-домен приложения.
  metadataBase: new URL(process.env.APP_URL ?? process.env.AUTH_URL ?? "https://quantorium.vercel.app"),
  title: "Кванториум",
  description: "Геймифицированная образовательная платформа",
};

const themeInitializationScript = `
try {
  if (localStorage.getItem("kvantolingo-theme") === "dark") {
    document.documentElement.dataset.theme = "dark";
  }
} catch {}
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const isStaging = process.env.KVANTO_DEPLOYMENT_ENV === "staging";

  return (
    <html
      lang="ru"
      className={`${nunito.variable} h-full antialiased`}
      data-deployment={isStaging ? "staging" : undefined}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
        <ThemeToggle />
        {children}
        {process.env.VERCEL === "1" && <Analytics />}
        {process.env.VERCEL === "1" && <SpeedInsights />}
      </body>
    </html>
  );
}
