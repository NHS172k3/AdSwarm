import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdSwarm Campaign Studio",
  description: "Plan, negotiate, launch, and audit autonomous advertising campaigns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
