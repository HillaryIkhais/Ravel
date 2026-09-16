import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAVEL - Play While AI Builds",
  description: "While AI builds, you try to break it. RAVEL turns the time between AI builds into a game of adversarial testing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
      </body>
    </html>
  );
}
