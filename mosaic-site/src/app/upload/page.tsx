import { Suspense } from "react";
import UploadClient from "./UploadClient";

export default function UploadPage() {
  return (
    <Suspense fallback={<Shell><p style={{ color: "#c9a84c" }}>Loading…</p></Shell>}>
      <UploadClient />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d0d" }}>
      {children}
    </div>
  );
}
