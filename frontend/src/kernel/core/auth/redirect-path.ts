/** The home page, which forwards the reader to the first screen they may open. */
export const DEFAULT_POST_LOGIN_PATH = "/";

const LOCALE_PREFIX_RE = /^\/(vi|en)(?=\/|$)/;

/**
 * Where every sign-in lands: the home page of the current locale, which forwards to the first
 * screen the account's role may open. A sign-in never resumes the page an earlier session left.
 */
export function getPostLoginFallback(currentPathname: string): string {
  const locale = currentPathname.match(LOCALE_PREFIX_RE)?.[1];
  if (locale && locale !== "vi") {
    return `/${locale}`;
  }
  return DEFAULT_POST_LOGIN_PATH;
}
