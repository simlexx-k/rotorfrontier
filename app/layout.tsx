import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RotorFrontier — Tactical Helicopter Operations",
  description:
    "A browser-native helicopter flight and combat simulator with missions, career progression, and online co-op.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
