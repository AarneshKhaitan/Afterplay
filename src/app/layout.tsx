import "@fontsource-variable/manrope";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Afterplay | Riff live cohost",
  description: "Riff makes chat part of the show. Afterplay turns the moment into memory, content, and the next experiment.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
