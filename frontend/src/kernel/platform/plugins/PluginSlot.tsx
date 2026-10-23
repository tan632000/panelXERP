"use client";

import React from "react";

import { getSlotContributions } from "@kernel/platform/plugins/slot.registry";

import type {
  SlotContribution,
  SlotName,
} from "@kernel/platform/plugins/slot.types";

export interface PluginSlotProps<TContext> {
  name: SlotName;
  /** Everything a contributor is allowed to know about this host. */
  context: TContext;
}

/**
 * Renders whatever enabled plugins contribute to `name`, in registry order.
 *
 * This is the seam that lets a host screen show another plugin's UI without importing it. A direct
 * cross-plugin import binds the two at build time, so the host still pulls in the contributor even
 * when `NEXT_PUBLIC_ENABLED_PLUGINS` leaves it out; a slot resolves through the enabled list, so a
 * disabled contributor renders nothing.
 *
 * Renders nothing at all when no plugin contributes — hosts that need their own chrome only when
 * something is inside should ask `hasSlotContributions` first.
 */
export function PluginSlot<TContext>({
  name,
  context,
}: PluginSlotProps<TContext>) {
  const contributions = getSlotContributions(name);
  if (contributions.length === 0) return null;

  return (
    <>
      {contributions.map((contribution) => {
        // Safe by contract: the host names the slot and therefore owns its context type, and a
        // contributor declares the same type on the way in. The registry is where that type is
        // erased, so this is where it comes back.
        const { Component } =
          contribution as unknown as SlotContribution<TContext>;
        return <Component key={contribution.id} {...context} />;
      })}
    </>
  );
}
