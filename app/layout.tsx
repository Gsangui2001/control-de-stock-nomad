import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { RepoProvider } from "@/lib/providers/RepoProvider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Nomad Stock",
  description:
    "Control de stock de comida y bebida para charters de Nomad Sailors. Simple, rápido y mobile-first.",
  applicationName: "Nomad Stock",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nomad Stock",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f5ba8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <RepoProvider>
            {children}
            <Toaster />
          </RepoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
