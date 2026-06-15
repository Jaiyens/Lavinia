import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Terra, the operating system for the farm",
  description:
    "Terra makes a grower's PG&E account legible: every meter, rate, and billing cycle in one place, and the money hiding in it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="bg-bg text-ink min-h-full">{children}</body>
    </html>
  );
}
