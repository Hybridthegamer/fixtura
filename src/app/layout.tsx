import type { ReactNode } from "react";
import { Anton, Inter_Tight } from "next/font/google";
import "@/app/globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-body",
});

// Geist Mono — local font with system fallback
// Place font files at public/fonts/GeistMono-*.woff2

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${interTight.variable}`}
      suppressHydrationWarning
    >
      <head>
        <style>{`
          @font-face {
            font-family: 'Geist Mono';
            src: url('/fonts/GeistMono-Regular.woff2') format('woff2');
            font-weight: 400;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: 'Geist Mono';
            src: url('/fonts/GeistMono-Medium.woff2') format('woff2');
            font-weight: 500;
            font-style: normal;
            font-display: swap;
          }
        `}</style>
      </head>
      <body className="min-h-dvh bg-ink text-floodlight font-body antialiased">
        {children}
      </body>
    </html>
  );
}