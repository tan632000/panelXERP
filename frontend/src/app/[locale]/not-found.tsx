import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-tertiary p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        404 — Không tìm thấy trang
      </h1>
      <p className="text-sm text-text-secondary">
        Trang bạn yêu cầu không tồn tại.
      </p>
      <Link href="/" className="text-sm text-info-text hover:underline">
        Về trang chủ
      </Link>
    </div>
  );
}
