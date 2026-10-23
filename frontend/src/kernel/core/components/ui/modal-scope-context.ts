"use client";

import { createContext } from "react";

/**
 * True inside the body of a `Modal`.
 *
 * A table in a create/edit modal scrolls in its own bounded box — both axes — so its
 * horizontal bar sits right under the visible rows instead of after the last one, and
 * scrolling the table never hands over to the modal body.
 */
export const ModalScopeContext = createContext(false);
