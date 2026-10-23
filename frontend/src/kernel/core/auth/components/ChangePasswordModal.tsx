"use client";

import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import { useState } from "react";

import api from "@/kernel/core/api/api";
import {
  checkPasswordRules,
  isStrongEnoughPassword,
  PASSWORD_RULES,
} from "@/kernel/core/auth/password-rules";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { PasswordField } from "@/kernel/core/components/ui/PasswordField";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";

type Translate = (key: string) => string;

/** The masked placeholder every password box in this modal shows while empty. */
const PASSWORD_PLACEHOLDER = "*".repeat(8);

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/**
 * A 400 covers "wrong current password", "same as the current one" and a rejected new
 * password alike; the backend tells them apart only in the message text.
 */
function resolveError(err: unknown, t: Translate): FieldErrors {
  if (!isAxiosError(err) || err.response?.status !== 400) {
    return { currentPassword: t("requestFailed") };
  }
  const message = (err.response.data as { message?: string | string[] })
    ?.message;
  const text = Array.isArray(message) ? message.join(" ") : (message ?? "");
  if (text.includes("Current password is incorrect")) {
    return { currentPassword: t("currentPasswordIncorrect") };
  }
  if (text.includes("differ from the current one")) {
    return { newPassword: t("newPasswordSameAsCurrent") };
  }
  return { newPassword: t("passwordTooWeak") };
}

function validate(
  values: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
  t: Translate,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.currentPassword) {
    errors.currentPassword = t("currentPasswordRequired");
  }

  if (!values.newPassword) {
    errors.newPassword = t("newPasswordRequired");
  } else if (!isStrongEnoughPassword(values.newPassword)) {
    errors.newPassword = t("passwordTooWeak");
  } else if (values.newPassword === values.currentPassword) {
    errors.newPassword = t("newPasswordSameAsCurrent");
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = t("confirmPasswordRequired");
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = t("passwordMismatch");
  }

  return errors;
}

/** The live per-rule breakdown, so the user sees which requirement is still missing. */
function PasswordRulesChecklist({ value, t }: { value: string; t: Translate }) {
  const passed = checkPasswordRules(value);

  return (
    <ul className="space-y-1">
      {PASSWORD_RULES.map((rule) => (
        <li
          key={rule}
          className={`flex items-center gap-1.5 ${
            passed[rule] ? "text-success-text" : "text-text-tertiary"
          }`}
        >
          <Icon name={passed[rule] ? "circle-check" : "circle-x"} size={14} />
          {t(`passwordRules.${rule}`)}
        </li>
      ))}
    </ul>
  );
}

export function ChangePasswordModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("auth");
  const { showSuccess } = useNotification();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const close = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
    onClose();
  };

  const handleSubmit = async () => {
    const values = { currentPassword, newPassword, confirmPassword };
    const nextErrors = validate(values, t);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await api.post(apiRoutes.auth.changePassword, {
        currentPassword,
        newPassword,
      });
      showSuccess(t("changePasswordSuccess"));
      close();
    } catch (err) {
      setErrors(resolveError(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={t("changePassword")}
      onSubmit={handleSubmit}
      submitLabel={t("changePassword")}
      submitDisabled={loading}
    >
      <div className="space-y-4">
        <PasswordField
          label={t("currentPassword")}
          name="currentPassword"
          placeholder={PASSWORD_PLACEHOLDER}
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            clearError("currentPassword");
          }}
          error={errors.currentPassword}
          autoComplete="current-password"
          required
        />
        <PasswordField
          label={t("newPassword")}
          name="newPassword"
          placeholder={PASSWORD_PLACEHOLDER}
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            clearError("newPassword");
          }}
          error={errors.newPassword}
          hint={<PasswordRulesChecklist value={newPassword} t={t} />}
          autoComplete="new-password"
          required
        />
        <PasswordField
          label={t("confirmPassword")}
          name="confirmPassword"
          placeholder={PASSWORD_PLACEHOLDER}
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            clearError("confirmPassword");
          }}
          error={errors.confirmPassword}
          autoComplete="new-password"
          required
        />
        <p className="text-xs text-text-tertiary">{t("changePasswordHint")}</p>
      </div>
    </Modal>
  );
}
