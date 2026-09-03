"use client";

import { Buffer } from "buffer";
import { AuthProvider } from "@/lib/auth-context";

if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

export default function Providers({ children }: any) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}