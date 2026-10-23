import type { ErpFrontendPlugin } from "../../platform/plugins/plugin.contract";
import { {name}Navigation } from "./navigation";

export const {name}FrontendPlugin = {
  key: "{name}",
  name: "{NamePascal}",
  navigationModuleKey: "{name}",
  navigation: {name}Navigation,
} satisfies ErpFrontendPlugin;
