import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Koulen } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const koulen = Koulen({
  variable: "--font-koulen",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EPROP VIEW",
  description: "Environmental Property Risk Assessment Dashboard",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#346BDA',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
 className={`${geistSans.variable} ${geistMono.variable} ${koulen.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
