import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const srcDir = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // `vitest --changed` (CI) runs the whole suite when one of these changed. Setting the list
    // replaces Vitest's defaults, so they are repeated here next to the shared setup file.
    forceRerunTriggers: [
      "**/package.json/**",
      "**/vitest.config.*/**",
      "**/vite.config.*/**",
      "**/src/test/**",
    ],
    setupFiles: ["./src/test/setup.ts"],
    // The company identity is build-time env (see ../.env.example); pin it so print tests
    // assert real letterhead output.
    env: {
      NEXT_PUBLIC_COMPANY_NAME_VI: "PANELXERP DEMO COMPANY",
      NEXT_PUBLIC_COMPANY_NAME_EN: "PANELXERP DEMO CO., LTD",
      NEXT_PUBLIC_COMPANY_SHORT_NAME_VI: "panelXERP Demo Company",
      NEXT_PUBLIC_COMPANY_SHORT_NAME_EN: "panelXERP Demo Company",
      NEXT_PUBLIC_COMPANY_ADDRESS_VI: "Số 1 Đường Demo, Hà Nội",
      NEXT_PUBLIC_COMPANY_ADDRESS_EN: "1 Demo Street, Hanoi",
      NEXT_PUBLIC_COMPANY_PHONE: "+84 24 0000 0000",
      NEXT_PUBLIC_COMPANY_TAX_CODE: "0000000000",
    },
  },
  resolve: {
    alias: {
      "@": srcDir,
      "@kernel": path.resolve(srcDir, "kernel"),
      "@plugins": path.resolve(srcDir, "plugins"),
    },
  },
});
