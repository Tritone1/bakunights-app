const SITE_URL = "https://wheretogo.az";
const DEFAULT_IMAGE = `${SITE_URL}/wheretogo-hero-wide.png`;

type PageMetadata = {
  title: string;
  description: string;
  path?: string;
  image?: string | null;
  type?: "website" | "restaurant";
  index?: boolean;
  structuredData?: Record<string, unknown> | null;
};

function upsertMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function setPageMetadata({
  title,
  description,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  index = true,
  structuredData = null,
}: PageMetadata) {
  const canonicalUrl = absoluteUrl(path);
  const imageUrl = image && !image.startsWith("data:") ? absoluteUrl(image) : DEFAULT_IMAGE;
  document.title = title;
  upsertMeta('meta[name="description"]', "name", "description", description);
  upsertMeta('meta[name="robots"]', "name", "robots", index ? "index, follow" : "noindex, nofollow");
  upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", "WhereToGo");
  upsertMeta('meta[property="og:type"]', "property", "og:type", type);
  upsertMeta('meta[property="og:title"]', "property", "og:title", title);
  upsertMeta('meta[property="og:description"]', "property", "og:description", description);
  upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
  upsertMeta('meta[property="og:image"]', "property", "og:image", imageUrl);
  upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
  upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
  upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", imageUrl);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  document.getElementById("page-structured-data")?.remove();
  if (structuredData) {
    const script = document.createElement("script");
    script.id = "page-structured-data";
    script.type = "application/ld+json";
    script.text = JSON.stringify(structuredData).replace(/</g, "\\u003c");
    document.head.appendChild(script);
  }
}

export function defaultMetadata(language: "en" | "az" | "ru", path = "/") {
  const localized = language === "az"
    ? {
      title: "WhereToGo — Möhtəşəm yemək. Möhtəşəm təkliflər. Hər gün.",
      description: "WhereToGo hər gün möhtəşəm yeməklər və təkliflər tapmağa kömək edir.",
    }
    : language === "ru"
      ? {
        title: "WhereToGo — Отличная еда. Отличные предложения. Каждый день.",
        description: "WhereToGo помогает каждый день находить отличную еду и выгодные предложения.",
      }
      : {
        title: "WhereToGo — Great Food. Great Deals. Every Day.",
        description: "Discover restaurants, menus and live food deals near you with WhereToGo.",
      };
  return { ...localized, path };
}
