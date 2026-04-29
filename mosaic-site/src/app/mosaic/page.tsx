import { Suspense } from "react";
import MosaicViewerClient from "./MosaicViewerClient";

export const metadata = {
  title: "The Mosaic — 1,000,000 Trump Supporters",
  description: "Explore the photomosaic portrait. Zoom in to see each supporter's face.",
};

export default function MosaicPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#0d0d0d", color: "#c9a84c" }}
        >
          Loading mosaic…
        </div>
      }
    >
      <MosaicViewerClient />
    </Suspense>
  );
}
