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
  wikimedia: 2,
  wikipedia_summary: 2,
  loremflickr: 2,
  picsum_seeded: 2,
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

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
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
  return buildCoverQueryCandidates(name, type)[0] || "abstract texture";
}

function buildCoverQueryCandidates(name: string, type: string): string[] {
  const normalizedType = String(type || "").trim().toLowerCase();
  const typeHints = CATEGORY_HINTS[normalizedType] || [];
  const tokens = normalizeQueryText([name, ...typeHints].join(" "));
  const expanded = expandKeywords(tokens);
  if (!expanded.length) return ["abstract texture"];

  const first = expanded[0] || "";
  const second = expanded[1] || "";
  const third = expanded[2] || "";
  const hint = typeHints[0] || "";

  return uniqueNonEmpty(
    [
      expanded.slice(0, 7).join(" "),
      first,
      [first, second].filter(Boolean).join(" "),
      [first, third].filter(Boolean).join(" "),
      [first, hint].filter(Boolean).join(" "),
      [first, second, hint].filter(Boolean).join(" "),
      expanded.slice(0, 3).join(" "),
    ].slice(0, 7)
  );
}

function isLikelyHttpImage(value: string): boolean {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isLikelyRasterMime(value: string): boolean {
  const normalized = String(value || "").toLowerCase();
  if (!normalized.startsWith("image/")) return false;
  if (normalized.includes("svg")) return false;
  return true;
}

function buildTopicFallbackImageUrl(query: string, seed: string): {
  coverImageUrl: string;
  coverImageSource: string;
} {
  const tags = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9-]/g, "").trim())
    .filter((word) => word.length > 1)
    .slice(0, 3)
    .join(",");
  const lock = Math.max(1, hashSeed(`${seed}:${query}`) % 100_000);

  if (tags) {
    return {
      coverImageUrl: `https://loremflickr.com/1600/900/${tags}?lock=${lock}`,
      coverImageSource: "loremflickr",
    };
  }

  const fallbackSeed = encodeURIComponent(String(seed || "stash").slice(0, 80));
  return {
    coverImageUrl: `https://picsum.photos/seed/${fallbackSeed}/1600/900`,
    coverImageSource: "picsum_seeded",
  };
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      timeoutMs
    );
    if (!response.ok) return { ok: false };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false };
  }
}

async function getWikipediaSearchTitles(query: string): Promise<string[]> {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];
  const url =
    "https://en.wikipedia.org/w/api.php" +
    "?action=opensearch&namespace=0&limit=5&format=json" +
    `&search=${encodeURIComponent(trimmed)}`;
  const payload = await fetchJsonWithTimeout(url, 6000);
  if (!payload.ok) return [];
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const titles = Array.isArray(rows[1]) ? rows[1] : [];
  return uniqueNonEmpty(titles.map((entry) => String(entry || "").trim()));
}

function toWikipediaSummaryTitle(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_");
}

async function getWikipediaSummaryCoverByTitle(title: string): Promise<string | null> {
  const normalizedTitle = toWikipediaSummaryTitle(title);
  if (!normalizedTitle) return null;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normalizedTitle)}`;
  const payload = await fetchJsonWithTimeout(url, 6000);
  if (!payload.ok) return null;

  const summary = payload.data as Record<string, unknown>;
  const originalImage = summary?.originalimage as Record<string, unknown> | undefined;
  const thumbnail = summary?.thumbnail as Record<string, unknown> | undefined;
  const imageUrl = String(originalImage?.source || thumbnail?.source || "").trim();
  if (!isLikelyHttpImage(imageUrl)) return null;
  return imageUrl;
}

async function getWikipediaSummaryCover(query: string): Promise<string | null> {
  const titles = await getWikipediaSearchTitles(query);
  const fallbackTitles = uniqueNonEmpty([query, ...titles]).slice(0, 2);
  for (const title of fallbackTitles) {
    const image = await getWikipediaSummaryCoverByTitle(title);
    if (image) return image;
  }
  return null;
}

async function getWikimediaCommonsCover(query: string): Promise<string | null> {
  const trimmed = String(query || "").trim();
  if (!trimmed) return null;

  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&format=json&formatversion=2" +
    "&generator=search&gsrnamespace=6&gsrlimit=8" +
    "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1600&iiurlheight=900" +
    `&gsrsearch=${encodeURIComponent(trimmed)}`;
  const payload = await fetchJsonWithTimeout(url, 7000);
  if (!payload.ok) return null;

  const data = payload.data as Record<string, unknown>;
  const queryData = data?.query as Record<string, unknown> | undefined;
  const pages = Array.isArray(queryData?.pages) ? queryData?.pages : [];
  const fallbackCandidates: string[] = [];

  for (const page of pages) {
    const row = page as Record<string, unknown>;
    const imageInfos = Array.isArray(row?.imageinfo) ? row.imageinfo : [];
    const imageInfo = imageInfos[0] as Record<string, unknown> | undefined;
    if (!imageInfo) continue;

    const mime = String(imageInfo?.mime || "").trim().toLowerCase();
    if (mime && !isLikelyRasterMime(mime)) continue;

    const candidateUrl = String(imageInfo?.thumburl || imageInfo?.url || "").trim();
    if (!isLikelyHttpImage(candidateUrl)) continue;

    const width = Number(imageInfo?.thumbwidth || imageInfo?.width || 0);
    const height = Number(imageInfo?.thumbheight || imageInfo?.height || 0);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (isImageRatioValid(width, height)) return candidateUrl;
      fallbackCandidates.push(candidateUrl);
      continue;
    }

    fallbackCandidates.push(candidateUrl);
  }

  return fallbackCandidates[0] || null;
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
    const payload = await fetchJsonWithTimeout(url, 6000);
    if (!payload.ok) return null;
    const data = payload.data as Record<string, unknown>;
    const queryData = data.query as Record<string, unknown> | undefined;
    const pages = Array.isArray(queryData?.pages) ? queryData.pages : [];
    for (const page of pages) {
      const row = page as Record<string, unknown>;
      const thumbnail = row.thumbnail as Record<string, unknown> | undefined;
      const imageUrl = String(thumbnail?.source || "").trim();
      if (isLikelyHttpImage(imageUrl)) {
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

  const queryCandidates = buildCoverQueryCandidates(name, type).slice(0, 3);

  for (const query of queryCandidates) {
    const wikimediaUrl = await getWikimediaCommonsCover(query);
    if (wikimediaUrl) {
      return { coverImageUrl: wikimediaUrl, coverImageSource: "wikimedia" };
    }
  }

  for (const query of queryCandidates) {
    const wikipediaSummaryUrl = await getWikipediaSummaryCover(query);
    if (wikipediaSummaryUrl) {
      return { coverImageUrl: wikipediaSummaryUrl, coverImageSource: "wikipedia_summary" };
    }
  }

  const unsplashUrl = await getUnsplashCover(queryCandidates[0] || buildCoverQuery(name, type));
  if (unsplashUrl) {
    return { coverImageUrl: unsplashUrl, coverImageSource: "unsplash" };
  }

  for (const query of queryCandidates) {
    const wikipediaUrl = await getWikipediaCover(query);
    if (wikipediaUrl) {
      return { coverImageUrl: wikipediaUrl, coverImageSource: "wikipedia" };
    }
  }

  const topicFallback = buildTopicFallbackImageUrl(queryCandidates[0] || name, seed);
  if (topicFallback.coverImageUrl) {
    return topicFallback;
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
