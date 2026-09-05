import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { RepoProvider } from "@/lib/providers/RepoProvider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "NOMADE",
  description:
    "Administrador de gastos operativos de la flota de Nomad Sailors: mantenimiento, combustible, amarre/marina/permisos y otros gastos. Simple, rápido y mobile-first.",
  applicationName: "NOMADE",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NOMADE",
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
