import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAVEL - Play While AI Builds",
  description: "AI builds the next version while you play the current one. Your hunt becomes the test that shapes what AI builds next.",
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
