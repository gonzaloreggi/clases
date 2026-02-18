import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Herramientas de parseo",
  description: "Parseo IVA, SUSS, ARCIBA, SICORE GANANCIAS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
