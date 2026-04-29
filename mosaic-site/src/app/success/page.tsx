import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export default function SuccessPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SuccessClient />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d0d" }}>
      <p style={{ color: "#c9a84c" }}>Confirming your payment…</p>
    </div>
  );
}
