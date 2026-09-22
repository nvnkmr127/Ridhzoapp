import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import { Toaster } from "@/components/ui/toaster";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Ridhzo CRM",
  description: "Lead capture, instant alerts, and one-tap messaging.",
  applicationName: "Ridhzo",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Ridhzo" },
  icons: {
    icon: [
      {
        url: "/logos/Ridhzo-Logo-Final_Logo-Icon-Dark.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/logos/Ridhzo-Logo-Final_Logo-Icon-Light.png",
        media: "(prefers-color-scheme: dark)",
      },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logos/Ridhzo-Logo-Final_AppIcon-Dark.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/logos/Ridhzo-Logo-Final_AppIcon-Dark.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster />
        <ServiceWorkerRegister />
        <SpeedInsights />
      </body>
    </html>
  );
}
