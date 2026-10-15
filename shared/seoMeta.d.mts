export declare function buildBlogDescription(content: string | null | undefined, fallback: string): string;
export declare function resolveBlogDescription(
  metaDescription: string | null | undefined,
  content: string | null | undefined,
  fallback: string,
): string;
export declare const META_DESCRIPTION_MIN_LENGTH: number;
export declare const META_DESCRIPTION_MAX_LENGTH: number;
export declare function sanitizeMetaDescriptionCandidate(raw: unknown): string | null;
export declare const SITE_ORIGIN: string;
export declare const SITE_DESCRIPTION_DEFAULT: string;
export declare function buildCanonicalUrl(pathname: string): string;
export declare function injectPageMeta(
  html: string,
  options: { title: string; description: string; canonicalUrl: string | null; robots: string },
): string;
