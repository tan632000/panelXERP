import { appConfig } from "@/kernel/core/config/app.config";

/** The centred card every signed-out screen is drawn in: login, forgot and reset password. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-secondary bg-surface-primary p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-wider text-text-tertiary">
            {appConfig.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm text-text-secondary">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
