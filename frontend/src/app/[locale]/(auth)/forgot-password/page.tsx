"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import api from "@/kernel/core/api/api";
import { AuthCard } from "@/kernel/core/components/ui/AuthCard";
import { Button } from "@/kernel/core/components/ui/Button";
import { FormField } from "@/kernel/core/components/ui/FormField";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { Link } from "@/kernel/i18n/navigation";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post(apiRoutes.auth.forgotPassword, { email: email.trim() });
      // The endpoint answers the same for an unknown address on purpose, and so does this
      // screen — a "no such account" here would leak the same thing the API refuses to.
      setSent(true);
    } catch {
      setError(t("requestFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t("forgotPasswordTitle")}
      description={sent ? undefined : t("forgotPasswordIntro")}
    >
      {sent ? (
        <div className="space-y-6">
          <p className="text-sm text-text-secondary">{t("resetLinkSent")}</p>
          <div className="flex justify-center">
            <Link
              href="/login"
              className="text-sm font-semibold text-brand hover:underline"
            >
              {t("backToLogin")}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label={t("email")}
            name="email"
            type="email"
            placeholder={t("placeholders.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <div className="flex justify-center pt-2">
            <Button type="submit" loading={loading} className="px-8">
              {t("sendResetLink")}
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
      )}
    </AuthCard>
  );
}
