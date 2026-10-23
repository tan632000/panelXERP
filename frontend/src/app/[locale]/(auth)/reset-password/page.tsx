"use client";

import { isAxiosError } from "axios";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";

import api from "@/kernel/core/api/api";
import { isStrongEnoughPassword } from "@/kernel/core/auth/password-rules";
import { AuthCard } from "@/kernel/core/components/ui/AuthCard";
import { Button } from "@/kernel/core/components/ui/Button";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { PasswordField } from "@/kernel/core/components/ui/PasswordField";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { Link, useRouter } from "@/kernel/i18n/navigation";

function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { showSuccess } = useNotification();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStrongEnoughPassword(newPassword)) {
      setError(t("passwordTooWeak"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setError("");
    setLoading(true);
    try {
      await api.post(apiRoutes.auth.resetPassword, { token, newPassword });
      showSuccess(t("resetPasswordSuccess"));
      router.replace("/login");
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setError(status === 400 ? t("resetLinkInvalid") : t("requestFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthCard title={t("resetPasswordTitle")}>
        <div className="space-y-6">
          <p className="text-sm text-danger-text">{t("resetLinkMissing")}</p>
          <div className="flex justify-center">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-brand hover:underline"
            >
              {t("forgotPasswordTitle")}
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("resetPasswordTitle")}
      description={t("resetPasswordIntro")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label={t("newPassword")}
          name="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          hint={t("passwordRule")}
          autoComplete="new-password"
          required
        />
        <PasswordField
          label={t("confirmPassword")}
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        {error && <p className="text-sm text-danger-text">{error}</p>}
        <div className="flex justify-center pt-2">
          <Button type="submit" loading={loading} className="px-8">
            {t("resetPasswordTitle")}
          </Button>
        </div>
        <div className="flex justify-center">
          <Link
            href="/login"
            className="text-sm text-text-secondary hover:underline"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}

/**
 * The token arrives as a query parameter, and `useSearchParams` opts its whole subtree out of
 * prerendering — the boundary keeps that to the form instead of failing the build.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState variant="fullscreen" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
