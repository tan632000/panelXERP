"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-tertiary p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        Đã xảy ra lỗi
      </h1>
      <p className="max-w-md text-center text-sm text-text-secondary">
        {error.message}
      </p>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Thử lại
      </button>
    </div>
  );
}
