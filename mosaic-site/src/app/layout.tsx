import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "1,000,000 Trump Supporters — The Mosaic",
  description:
    "Join 1,000,000 supporters. Pay $2, upload your face, and become part of a historic mosaic portrait of Donald Trump.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trumpmosaic.com"
  ),
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "1,000,000 Trump Supporters — The Mosaic",
    description:
      "Be part of a once-in-a-lifetime portrait. 1,000,000 supporters. One historic gift to President Trump.",
    type: "website",
    images: [
      {
        url: "/trump-portrait.jpg",
        width: 1351,
        height: 1351,
        alt: "Trump Mosaic Portrait",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "1,000,000 Trump Supporters — The Mosaic",
    description:
      "Be part of a once-in-a-lifetime portrait. 1,000,000 supporters. One historic gift to President Trump.",
    images: ["/trump-portrait.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
      <Script
        data-goatcounter="https://trumpmosaic.goatcounter.com/count"
        src="//gc.zgo.at/count.js"
        strategy="afterInteractive"
      />
    </html>
  );
}
