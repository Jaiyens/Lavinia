import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Backdrop } from "@/components/Backdrop";
import { SmoothScroll } from "@/components/SmoothScroll";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = "https://terra.farm";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Terra, An AI-native operating system for farms",
    template: "%s · Terra",
  },
  description:
    "Terra unifies the fragmented data of a farm into one operational layer, then puts AI agents and computer-vision cameras to work, so growers spot problems and make critical decisions before they cost money.",
  keywords: [
    "agriculture AI",
    "farm operating system",
    "computer vision farming",
    "precision agriculture",
    "Central Valley",
    "Fresno ag tech",
  ],
  authors: [{ name: "Terra" }],
  openGraph: {
    title: "Terra, An AI-native operating system for farms",
    description:
      "One layer that unifies the messy data of a farm into a model of the operation, then lets agents act on it within your control.",
    url: siteUrl,
    siteName: "Terra",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terra, An AI-native operating system for farms",
    description:
      "The Brain unifies your farm's data. The Eyes ground it in the physical field. Built for the largest ag county in America.",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-ink flex flex-col overflow-x-hidden">
        <SmoothScroll>
          <Backdrop />
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
