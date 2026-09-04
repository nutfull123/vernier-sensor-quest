import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vernier Sensor Quest",
  description: "เกมวิทยาศาสตร์สำหรับ Go Direct Temperature และ GDX-ACC",
  icons: {
    icon: "./favicon.svg",
    shortcut: "./favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
