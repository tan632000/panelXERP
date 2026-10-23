import authEn from "@kernel/langs/en/auth.json";
import commonEn from "@kernel/langs/en/common.json";
import metadataEn from "@kernel/langs/en/metadata.json";
import modalEn from "@kernel/langs/en/modal.json";
import permissionEn from "@kernel/langs/en/permission.json";
import statusEn from "@kernel/langs/en/status.json";
import systemEn from "@kernel/langs/en/system.json";
import authVi from "@kernel/langs/vi/auth.json";
import commonVi from "@kernel/langs/vi/common.json";
import metadataVi from "@kernel/langs/vi/metadata.json";
import modalVi from "@kernel/langs/vi/modal.json";
import permissionVi from "@kernel/langs/vi/permission.json";
import statusVi from "@kernel/langs/vi/status.json";
import systemVi from "@kernel/langs/vi/system.json";

export const enMessages = {
  auth: authEn,
  system: systemEn,
  permission: permissionEn,
  common: commonEn,
  metadata: metadataEn,
  modal: modalEn,
  status: statusEn,
} as const;

export const viMessages = {
  auth: authVi,
  system: systemVi,
  permission: permissionVi,
  common: commonVi,
  metadata: metadataVi,
  modal: modalVi,
  status: statusVi,
} as const;
