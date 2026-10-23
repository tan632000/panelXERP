"use client";

import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";
import { useEffect } from "react";

// Windows ships no country-flag glyphs, so flag emojis render as two letters
// ("VN"). The polyfill loads a flags-only font only on browsers that need it;
// the font is self-hosted so the app does not depend on an external CDN.
export function CountryFlagPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis(
      "Twemoji Country Flags",
      "/fonts/TwemojiCountryFlags.woff2",
    );
  }, []);

  return null;
}
