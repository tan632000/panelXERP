"use client";

import { useEffect } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { getLandingPath } from "@/kernel/core/permissions/landing-path";
import { useRouter } from "@/kernel/i18n/navigation";

/** Forwards the signed-in user to the first screen their permissions open. */
export default function HomePage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, can } = useAuth();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    router.replace(getLandingPath(can));
  }, [isLoading, isAuthenticated, can, router]);

  return <LoadingState variant="fullscreen" />;
}
