const STOP_WORDS = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "you",
  "our",
  "are",
  "was",
  "were",
  "to",
  "of",
  "in",
  "on",
  "at",
  "a",
  "an",
  "by",
  "is",
  "it",
  "as",
  "be",
  "we",
  "us",
  "new",
  "trip",
  "trips",
  "collection",
  "collections",
  "list",
  "lists",
  "general",
  "idea",
  "ideas",
]);

const CATEGORY_HINTS: Record<string, string[]> = {
  travel: ["travel", "destination"],
  fashion: ["fashion", "style"],
};

const COLOR_PALETTE = [
  "#0f172a",
  "#1e293b",
  "#0b3b5e",
  "#1f2a44",
  "#2b3655",
  "#0f3d3e",
  "#3b1f2b",
  "#2d1f3b",
  "#1f3b2d",
  "#3b2f1f",
];

const IMAGE_MIN_WIDTH = 600;
const IMAGE_MIN_HEIGHT = 320;
const IMAGE_MIN_RATIO = 1.3;
const IMAGE_MAX_RATIO = 2.2;
const IMAGE_MIN_BYTES = 25_000;
const COVER_PRIORITY: Record<string, number> = {
  gradient: 1,
  unsplash: 2,
  wikipedia: 2,
  og: 3,
  manual: 100,
};
const OG_BLOCKLIST = new Set([
  "booking.com",
  "expedia.com",
  "hotels.com",
  "priceline.com",
  "tripadvisor.com",
  "kayak.com",
]);

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickPaletteColor(seed: number, offset: number): string {
  const idx = (seed + offset) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

function toAbsoluteUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function normalizeQueryText(input: string): string[] {
  const cleaned = (input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => {
      if (!word) return false;
      if (STOP_WORDS.has(word)) return false;
      if (/^\d+$/.test(word)) return false;
      if (word.length <= 1) return false;
      return true;
    });
}

function expandKeywords(tokens: string[]): string[] {
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    if (token === "newjeans") expanded.add("jeans");
    if (
      token.endsWith("s") &&
      token.length > 4 &&
      !token.endsWith("ss") &&
      !token.endsWith("is")
    ) {
      expanded.add(token.slice(0, -1));
    }
  }

  if (expanded.has("japan")) {
    expanded.add("japanese");
    expanded.add("tokyo");
    expanded.add("kyoto");
  }
  if (expanded.has("japanese")) {
    expanded.add("japan");
  }
  if (expanded.has("newjeans")) {
    expanded.add("denim");
    expanded.add("style");
  }
  if (expanded.has("jeans")) expanded.add("denim");
  if (expanded.has("paris")) {
    expanded.add("city");
    expanded.add("eiffel");
    expanded.add("tower");
  }
  if (expanded.has("nyc")) {
    expanded.add("new");
    expanded.add("york");
    expanded.add("city");
  }
  if (expanded.has("travel")) expanded.add("destination");
  return Array.from(expanded);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseMetaContent(html: string, property: string): string {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return match?.[1]?.trim() || "";
}

function parseNumberMeta(html: string, property: string): number | null {
  const value = parseMetaContent(html, property);
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function isImageRatioValid(width: number, height: number): boolean {
  if (!width || !height) return false;
  if (width < IMAGE_MIN_WIDTH || height < IMAGE_MIN_HEIGHT) return false;
  const ratio = width / height;
  return ratio >= IMAGE_MIN_RATIO && ratio <= IMAGE_MAX_RATIO;
}

export async function extractOgImage(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(pageUrl, { method: "GET" }, 6000);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = await response.text();
    const imageRaw =
      parseMetaContent(html, "og:image:secure_url") || parseMetaContent(html, "og:image");
    if (!imageRaw) return null;
    const imageUrl = toAbsoluteUrl(imageRaw, pageUrl);
    if (!/^https?:\/\//i.test(imageUrl)) return null;

    const width = parseNumberMeta(html, "og:image:width");
    const height = parseNumberMeta(html, "og:image:height");
    if (width && height && !isImageRatioValid(width, height)) return null;

    const head = await fetchWithTimeout(imageUrl, { method: "HEAD" }, 5000);
    if (head.ok) {
      const imageType = head.headers.get("content-type") || "";
      if (!imageType.startsWith("image/")) return null;
      const bytes = Number.parseInt(head.headers.get("content-length") || "0", 10);
      if (bytes && bytes < IMAGE_MIN_BYTES) return null;
    }

    return imageUrl;
  } catch {
    return null;
  }
}

export function buildCoverQuery(name: string, type: string): string {
  const normalizedType = String(type || "").trim().toLowerCase();
  const typeHints = CATEGORY_HINTS[normalizedType] || [];
  const tokens = normalizeQueryText([name, ...typeHints].join(" "));
  const expanded = expandKeywords(tokens);
  if (!expanded.length) return "abstract texture";
  return expanded.slice(0, 7).join(" ");
}

export async function getUnsplashCover(query: string): Promise<string | null> {
  const accessKey = Deno.env.get("UNSPLASH_ACCESS_KEY") || "";
  if (!accessKey) {
    console.warn("collection-cover: UNSPLASH_ACCESS_KEY missing; skipping Unsplash lookup");
    return null;
  }
  const url =
    "https://api.unsplash.com/search/photos" +
    `?query=${encodeURIComponent(query)}` +
    "&orientation=landscape&content_filter=high&per_page=1";
  try {
    const response = await fetchWithTimeout(
      url,
      { method: "GET", headers: { Authorization: `Client-ID ${accessKey}` } },
      6000
    );
    if (!response.ok) {
      console.warn(
        `collection-cover: Unsplash lookup failed with status ${response.status} for query "${query}"`
      );
      return null;
    }
    const data = await response.json();
    const result = data?.results?.[0];
    const imageUrl = result?.urls?.regular || result?.urls?.full || "";
    return imageUrl || null;
  } catch (error) {
    console.warn(
      `collection-cover: Unsplash lookup threw for query "${query}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export async function getWikipediaCover(query: string): Promise<string | null> {
  const trimmed = String(query || "").trim();
  if (!trimmed) return null;
  const url =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query&format=json&formatversion=2&generator=search&gsrlimit=6" +
    "&prop=pageimages&piprop=thumbnail&pithumbsize=1280" +
    `&gsrsearch=${encodeURIComponent(trimmed)}`;
  try {
    const response = await fetchWithTimeout(url, { method: "GET" }, 6000);
    if (!response.ok) return null;
    const data = await response.json();
    const pages = Array.isArray(data?.query?.pages) ? data.query.pages : [];
    for (const page of pages) {
      const imageUrl = String(page?.thumbnail?.source || "").trim();
      if (/^https?:\/\//i.test(imageUrl)) {
        return imageUrl;
      }
    }
    return null;
  } catch (error) {
    console.warn(
      `collection-cover: Wikipedia lookup threw for query "${query}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export function makeGradientCover(seed: string): string {
  const hash = hashSeed(seed || "stash");
  const colorA = pickPaletteColor(hash, 0);
  const colorB = pickPaletteColor(hash, 3);
  const colorC = pickPaletteColor(hash, 6);
  return `linear-gradient(135deg, ${colorA} 0%, ${colorB} 50%, ${colorC} 100%)`;
}

export async function pickCoverForCollection({
  name,
  type,
  items,
  seed,
}: {
  name: string;
  type: string;
  items: Array<{ url?: string | null }>;
  seed: string;
}): Promise<{ coverImageUrl: string; coverImageSource: string }> {
  const recentLinks = (items || []).filter((item) => item.url).slice(0, 3);
  const skipOg = recentLinks.some((item) => {
    try {
      const hostname = new URL(item.url || "").hostname.replace(/^www\./, "");
      return OG_BLOCKLIST.has(hostname);
    } catch {
      return false;
    }
  });
  if (!skipOg) {
    for (const item of recentLinks) {
      const url = item.url || "";
      const ogImage = await extractOgImage(url);
      if (ogImage) {
        return { coverImageUrl: ogImage, coverImageSource: "og" };
      }
    }
  }

  const query = buildCoverQuery(name, type);
  const unsplashUrl = await getUnsplashCover(query);
  if (unsplashUrl) {
    return { coverImageUrl: unsplashUrl, coverImageSource: "unsplash" };
  }

  const wikipediaUrl = await getWikipediaCover(query);
  if (wikipediaUrl) {
    return { coverImageUrl: wikipediaUrl, coverImageSource: "wikipedia" };
  }

  return { coverImageUrl: makeGradientCover(seed), coverImageSource: "gradient" };
}

export function preferCover({
  currentUrl,
  currentSource,
  nextUrl,
  nextSource,
}: {
  currentUrl?: string | null;
  currentSource?: string | null;
  nextUrl: string;
  nextSource: string;
}): { coverImageUrl: string; coverImageSource: string } {
  if (!currentUrl) {
    return { coverImageUrl: nextUrl, coverImageSource: nextSource };
  }
  const currentRank = COVER_PRIORITY[currentSource || "gradient"] || 0;
  const nextRank = COVER_PRIORITY[nextSource || "gradient"] || 0;
  if (nextRank >= currentRank) {
    return { coverImageUrl: nextUrl, coverImageSource: nextSource };
  }
  return {
    coverImageUrl: currentUrl,
    coverImageSource: currentSource || "gradient",
  };
}
