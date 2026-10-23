"use client";

import { isAxiosError } from "axios";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { resolvePostLoginPath } from "@/kernel/core/auth/redirect-path";
import { SessionCookieError } from "@/kernel/core/auth/tokens";
import { Button } from "@/kernel/core/components/ui/Button";
import { FormField } from "@/kernel/core/components/ui/FormField";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { appConfig } from "@/kernel/core/config/app.config";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { Link } from "@/kernel/i18n/navigation";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { showError } = useNotification();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    router.replace(
      resolvePostLoginPath(window.location.search, window.location.pathname),
    );
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      let message = t("loginFailed");
      if (err instanceof SessionCookieError) {
        message = t("sessionCookieFailed");
      } else if (status === 401 || status === 400) {
        message = t("invalidCredentials");
      }
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return <LoadingState variant="fullscreen" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-secondary bg-surface-primary p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-wider text-text-tertiary">
            {appConfig.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            Đăng nhập
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Tên đăng nhập / Email"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <FormField
            label="Mật khẩu"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="cursor-pointer text-text-tertiary transition-colors hover:text-text-secondary"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
              </button>
            }
          />
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-text-secondary hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <div className="flex justify-center pt-2">
            <Button type="submit" loading={loading} className="px-8">
              Đăng nhập
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
