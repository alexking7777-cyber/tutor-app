import { AuthNav } from "@/components/AuthNav";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Heritage voice tutor",
  description: "Heritage language and etiquette voice tutor for families",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-white/40 bg-white/50 px-4 py-3 backdrop-blur-sm">
          <AuthNav />
        </header>
        {children}
      </body>
    </html>
  );
}
