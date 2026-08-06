import "@fontsource-variable/manrope";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Afterplay · Creator growth team",
  description: "An autonomous growth team for gaming creators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
