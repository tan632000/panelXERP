"use client";

import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { isStrongEnoughPassword } from "@/kernel/core/auth/password-rules";
import { FORM_LABEL_TEXT_CLASS } from "@/kernel/core/components/ui/form-label-styles";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { PasswordField } from "@/kernel/core/components/ui/PasswordField";
import { useUserDepartments } from "@/kernel/core/hooks/useUserDepartments";

import { useRoleLabels } from "@plugins/system/roles/hooks/useRoleLabels";
import {
  useAssignableRoles,
  useCreateAdminUser,
  useUpdateAdminUser,
} from "@plugins/system/users/hooks/api/useAdminUsers";

import type { AdminUser } from "@plugins/system/users/types";

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormValues {
  username: string;
  email: string;
  fullName: string;
  phone: string;
  department: string;
  title: string;
  roleCode: string;
  password: string;
}

/** The form's opening values: an account's own, or an empty sheet for a new one. */
function initialValues(user?: AdminUser | null): FormValues {
  return {
    username: user?.username ?? "",
    email: user?.email ?? "",
    fullName: user?.fullName ?? "",
    phone: user?.phone ?? "",
    department: user?.department ?? "",
    title: user?.title ?? "",
    roleCode: user?.roleCode ?? "",
    password: "",
  };
}

type Translate = (key: string) => string;

/** A 409 names the column the server refused, so the message lands on that field. */
function resolveTakenField(err: unknown): "username" | "email" | null {
  if (!isAxiosError(err) || err.response?.status !== 409) return null;
  const message = (err.response.data as { message?: string | string[] })
    ?.message;
  const text = Array.isArray(message) ? message.join(" ") : (message ?? "");
  if (text.includes("Username")) return "username";
  if (text.includes("Email")) return "email";
  return null;
}

function validate(
  values: FormValues,
  manualPassword: boolean,
  isEdit: boolean,
  t: Translate,
): Partial<FormValues> {
  const errors: Partial<FormValues> = {};
  const username = values.username.trim();

  if (!username) errors.username = t("usernameRequired");
  else if (username.length < 3 || !USERNAME_PATTERN.test(username)) {
    errors.username = t("usernameInvalid");
  }

  if (!values.email.trim()) errors.email = t("emailRequired");
  else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = t("emailInvalid");
  }

  if (!values.fullName.trim()) errors.fullName = t("fullNameRequired");
  if (!values.roleCode) errors.roleCode = t("roleRequired");

  if (!isEdit && manualPassword) {
    if (!values.password) errors.password = t("passwordRequired");
    else if (!isStrongEnoughPassword(values.password)) {
      errors.password = t("passwordTooWeak");
    }
  }

  return errors;
}

export function UserFormModal({
  isOpen,
  onClose,
  user,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Absent means the form creates an account rather than editing one. */
  user?: AdminUser | null;
}) {
  const t = useTranslations("system.users");
  const roles = useAssignableRoles().data ?? [];
  const { labelOfCode } = useRoleLabels();
  const departments = useUserDepartments();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  // The screen mounts this modal only while it is open, and keys it by the account it edits,
  // so the opening values belong in the initial state rather than in an effect that would
  // re-render the form a second time every time it opens.
  const [values, setValues] = useState<FormValues>(() => initialValues(user));
  const [errors, setErrors] = useState<Partial<FormValues>>({});
  // A new account is invited by default: nobody but its holder then knows the password.
  const [manualPassword, setManualPassword] = useState(false);
  const isEdit = Boolean(user);

  const setField = (field: keyof FormValues) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = () => {
    const nextErrors = validate(values, manualPassword, isEdit, t);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload = {
      username: values.username.trim(),
      email: values.email.trim().toLowerCase(),
      fullName: values.fullName.trim(),
      roleCode: values.roleCode,
      phone: values.phone.trim() || null,
      department: values.department || null,
      title: values.title.trim() || null,
    };

    const onError = (error: unknown) => {
      const taken = resolveTakenField(error);
      if (taken) setErrors({ [taken]: t(`toast.${taken}Taken`) });
    };

    if (user) {
      updateUser.mutate(
        { id: user.id, data: payload },
        { onSuccess: onClose, onError },
      );
      return;
    }

    createUser.mutate(
      manualPassword ? { ...payload, password: values.password } : payload,
      { onSuccess: onClose, onError },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t("editTitle") : t("createTitle")}
      onSubmit={handleSubmit}
      submitDisabled={createUser.isPending || updateUser.isPending}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput
          label={t("username")}
          name="username"
          placeholder={t("placeholders.username")}
          value={values.username}
          onChange={(e) => setField("username")(e.target.value)}
          error={errors.username}
          maxLength={50}
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
          maxLength={255}
          required
        />
        <FormInput
          label={t("fullName")}
          name="fullName"
          placeholder={t("placeholders.fullName")}
          value={values.fullName}
          onChange={(e) => setField("fullName")(e.target.value)}
          error={errors.fullName}
          maxLength={100}
          required
        />
        <FormSelect
          label={t("role")}
          name="roleCode"
          value={values.roleCode}
          onChange={(e) => setField("roleCode")(e.target.value)}
          error={errors.roleCode}
          options={roles.map((role) => ({
            value: role.code,
            label: labelOfCode(role.code, role.name),
          }))}
          placeholder={t("placeholders.role")}
          required
        />
        <FormInput
          label={t("phone")}
          name="phone"
          placeholder={t("placeholders.phone")}
          value={values.phone}
          onChange={(e) => setField("phone")(e.target.value)}
          maxLength={20}
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
          maxLength={100}
          span2
        />

        {!isEdit && (
          <div className="sm:col-span-2 space-y-2">
            <p className={`text-sm ${FORM_LABEL_TEXT_CLASS}`}>
              {t("passwordMode")}
            </p>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="passwordMode"
                checked={!manualPassword}
                onChange={() => setManualPassword(false)}
              />
              {t("passwordModeInvite")}
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="radio"
                name="passwordMode"
                checked={manualPassword}
                onChange={() => setManualPassword(true)}
              />
              {t("passwordModeManual")}
            </label>
            {manualPassword && (
              <PasswordField
                label={t("password")}
                name="password"
                placeholder={t("placeholders.password")}
                value={values.password}
                onChange={(e) => setField("password")(e.target.value)}
                error={errors.password}
                autoComplete="new-password"
                required
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
