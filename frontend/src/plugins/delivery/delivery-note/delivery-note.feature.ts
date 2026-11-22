import { DeliveryNotePermission } from "@plugins/delivery/delivery-note/permissions/delivery-note-permission.keys";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const deliveryNoteFeature: ErpFrontendFeature = {
  key: "delivery-note",
  plugin: "delivery",
  sectionTitle: "sidebarDelivery",
  items: [
    {
      featureKey: "delivery-note",
      href: "/delivery/notes",
      icon: "truck",
      label: "notesMenu",
      activeMatch: ["/delivery/orders"],
      permissions: [DeliveryNotePermission.read, "delivery_note:*"],
    },
    {
      // Has no link of its own (it is reached from a note or an order); the entry is what lets
      // the module shell admit the order delivery page to a role that is not an administrator.
      featureKey: "delivery-note",
      href: "/delivery/orders",
      icon: "truck",
      label: "orderDeliveryMenu",
      permissions: [DeliveryNotePermission.read, "delivery_note:*"],
      hidden: true,
    },
  ],
};
