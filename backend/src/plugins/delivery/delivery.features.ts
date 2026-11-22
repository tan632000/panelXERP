import { AcceptanceModule } from '@plugins/delivery/acceptance/acceptance.module';
import { acceptancePermissions } from '@plugins/delivery/acceptance/permissions/acceptance.permissions';
import { DeliveryNoteModule } from '@plugins/delivery/delivery-note/delivery-note.module';
import { deliveryNotePermissions } from '@plugins/delivery/delivery-note/permissions/delivery-note.permissions';
import { InstallationModule } from '@plugins/delivery/installation/installation.module';
import { installationPermissions } from '@plugins/delivery/installation/permissions/installation.permissions';
import { qcChecklistPermissions } from '@plugins/delivery/qc-checklist/permissions/qc-checklist.permissions';
import { QcChecklistModule } from '@plugins/delivery/qc-checklist/qc-checklist.module';
import { qcInspectionPermissions } from '@plugins/delivery/qc-inspection/permissions/qc-inspection.permissions';
import { QcInspectionModule } from '@plugins/delivery/qc-inspection/qc-inspection.module';

import type { ErpFeature } from '@kernel/platform/features/feature.contract';

/**
 * The checklist items come from a data migration, so there is no seed here: staging and
 * production run only the core seed scope.
 */
export const QC_CHECKLIST_FEATURE: ErpFeature = {
  key: 'qc-checklist',
  plugin: 'delivery',
  module: QcChecklistModule,
  permissions: qcChecklistPermissions,
};

export const QC_INSPECTION_FEATURE: ErpFeature = {
  key: 'qc-inspection',
  plugin: 'delivery',
  module: QcInspectionModule,
  permissions: qcInspectionPermissions,
};

export const DELIVERY_NOTE_FEATURE: ErpFeature = {
  key: 'delivery-note',
  plugin: 'delivery',
  module: DeliveryNoteModule,
  permissions: deliveryNotePermissions,
};

export const INSTALLATION_FEATURE: ErpFeature = {
  key: 'installation',
  plugin: 'delivery',
  module: InstallationModule,
  permissions: installationPermissions,
};

export const ACCEPTANCE_FEATURE: ErpFeature = {
  key: 'acceptance',
  plugin: 'delivery',
  module: AcceptanceModule,
  permissions: acceptancePermissions,
};

/** Delivery feature catalog — a feature left out of ENABLED_FEATURES loses its routes and migrations. */
export const DELIVERY_FEATURES: ErpFeature[] = [
  QC_CHECKLIST_FEATURE,
  QC_INSPECTION_FEATURE,
  DELIVERY_NOTE_FEATURE,
  INSTALLATION_FEATURE,
  ACCEPTANCE_FEATURE,
];
