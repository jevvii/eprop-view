import type { Metadata } from "next";
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
};

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
      <body className="min-h-full flex flex-col bg-[#F6F6F6] text-black">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
