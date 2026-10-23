"use client";

import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useState } from "react";

import api from "@/kernel/core/api/api";
import { useAuth } from "@/kernel/core/auth/AuthContext";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { PasswordField } from "@/kernel/core/components/ui/PasswordField";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { useUserDepartments } from "@/kernel/core/hooks/useUserDepartments";

import type { MeResponse } from "@/kernel/core/auth/types";

/** Mirrors the backend column length, so the field stops before the server refuses it. */
const MAX_LENGTH = {
  username: 50,
  email: 255,
  fullName: 100,
  phone: 20,
  title: 100,
};

const PHONE_PATTERN = /^[0-9+().\-\s]+$/;

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormValues {
  username: string;
  email: string;
  fullName: string;
  phone: string;
  department: string;
  title: string;
  currentPassword: string;
}

/**
 * A 409 names the identity column the server refused, so the message lands on that field
 * instead of a toast that leaves the user guessing which of the two was taken.
 */
function resolveTakenIdentity(err: unknown): "username" | "email" | null {
  if (!isAxiosError(err) || err.response?.status !== 409) return null;
  const message = (err.response.data as { message?: string | string[] })
    ?.message;
  const text = Array.isArray(message) ? message.join(" ") : (message ?? "");
  if (text.includes("Username")) return "username";
  if (text.includes("Email")) return "email";
  return null;
}

/** A 400 on this endpoint is the email change refused for a wrong current password. */
function isWrongPassword(err: unknown): boolean {
  if (!isAxiosError(err) || err.response?.status !== 400) return false;
  const message = (err.response.data as { message?: string | string[] })
    ?.message;
  const text = Array.isArray(message) ? message.join(" ") : (message ?? "");
  return text.includes("Current password is incorrect");
}

export function EditProfileModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("auth");
  const { user, applySessionUpdate } = useAuth();
  const { showSuccess, showError } = useNotification();
  const departments = useUserDepartments();
  // The profile screen mounts this modal only while it is open, so the session's own values
  // are the form's initial state; seeding them from an effect would render the form once
  // empty and once filled on every open.
  const [values, setValues] = useState<FormValues>(() => ({
    username: user?.username ?? "",
    email: user?.email ?? "",
    fullName: user?.fullName ?? "",
    phone: user?.phone ?? "",
    department: user?.department ?? "",
    title: user?.title ?? "",
    currentPassword: "",
  }));
  const [errors, setErrors] = useState<Partial<FormValues>>({});
  const [loading, setLoading] = useState(false);

  const setField = (field: keyof FormValues) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // The email is where a password reset link lands, so a new one is confirmed with the
  // current password; the field appears only once the address actually differs.
  const emailChanged =
    values.email.trim().toLowerCase() !== (user?.email ?? "").toLowerCase();

  const handleSubmit = async () => {
    const nextErrors: Partial<FormValues> = {};
    if (!values.fullName.trim()) nextErrors.fullName = t("fullNameRequired");
    if (values.phone.trim() && !PHONE_PATTERN.test(values.phone.trim())) {
      nextErrors.phone = t("phoneInvalid");
    }
    const username = values.username.trim();
    if (!username || !USERNAME_PATTERN.test(username) || username.length < 3) {
      nextErrors.username = t("usernameInvalid");
    }
    const email = values.email.trim();
    if (!email || !EMAIL_PATTERN.test(email)) {
      nextErrors.email = t("emailInvalid");
    }
    if (emailChanged && !values.currentPassword) {
      nextErrors.currentPassword = t("currentPasswordRequired");
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.patch<MeResponse>(
        apiRoutes.auth.updateProfile,
        {
          fullName: values.fullName.trim(),
          phone: values.phone.trim() || null,
          department: values.department || null,
          title: values.title.trim() || null,
          username: values.username.trim(),
          email: email.toLowerCase(),
          ...(emailChanged ? { currentPassword: values.currentPassword } : {}),
        },
      );
      applySessionUpdate(data);
      showSuccess(t("profileUpdated"));
      onClose();
    } catch (err) {
      const taken = resolveTakenIdentity(err);
      if (taken) {
        setErrors({ [taken]: t(`${taken}Taken`) });
      } else if (isWrongPassword(err)) {
        setErrors({ currentPassword: t("currentPasswordIncorrect") });
      } else {
        showError(t("requestFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("editProfile")}
      onSubmit={handleSubmit}
      submitLabel={t("saveProfile")}
      submitDisabled={loading}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput
          label={t("username")}
          name="username"
          placeholder={t("placeholders.username")}
          value={values.username}
          onChange={(e) => setField("username")(e.target.value)}
          error={errors.username}
          maxLength={MAX_LENGTH.username}
          required
        />
        <FormInput
          label={t("email")}
          name="email"
          placeholder={t("placeholders.email")}
          type="email"
          value={values.email}
          onChange={(e) => setField("email")(e.target.value)}
          error={errors.email}
          maxLength={MAX_LENGTH.email}
          required
        />
        <FormInput
          label={t("fullName")}
          name="fullName"
          placeholder={t("placeholders.fullName")}
          value={values.fullName}
          onChange={(e) => setField("fullName")(e.target.value)}
          error={errors.fullName}
          maxLength={MAX_LENGTH.fullName}
          required
          span2
        />
        <FormInput
          label={t("phone")}
          name="phone"
          placeholder={t("placeholders.phone")}
          value={values.phone}
          onChange={(e) => setField("phone")(e.target.value)}
          error={errors.phone}
          maxLength={MAX_LENGTH.phone}
        />
        <FormSelect
          label={t("department")}
          name="department"
          placeholder={t("placeholders.department")}
          value={values.department}
          onChange={(e) => setField("department")(e.target.value)}
          options={departments.options}
          allowClear
        />
        <FormInput
          label={t("jobTitle")}
          name="title"
          placeholder={t("placeholders.jobTitle")}
          value={values.title}
          onChange={(e) => setField("title")(e.target.value)}
          maxLength={MAX_LENGTH.title}
          span2
        />
        {emailChanged && (
          <div className="sm:col-span-2">
            <PasswordField
              label={t("currentPassword")}
              name="currentPassword"
              value={values.currentPassword}
              onChange={(e) => setField("currentPassword")(e.target.value)}
              error={errors.currentPassword}
              autoComplete="current-password"
              hint={t("emailChangeHint")}
              required
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
