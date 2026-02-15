import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { chromium } from "playwright";
import { createSocialRouter } from "./social/routes.js";

const app = express();
app.use(cors());
app.use(express.json());

const titleCache = new Map();
const universalTitleCache = new Map();
const previewCache = new Map();

function cleanAirbnbUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function looksLikeNotFound(html) {
  const t = html.toLowerCase();
  // Avoid matching generic "404" anywhere; only check strong phrases
  return (
    t.includes("page not found") ||
    t.includes("we can't find") ||
    t.includes("we can’t find") ||
    t.includes("this listing is no longer available") ||
    t.includes("listing is no longer available")
  );
}

function looksLikeBlockedOrConsent(html) {
  const t = html.toLowerCase();
  return (
    t.includes("captcha") ||
    t.includes("robot") ||
    t.includes("are you a human") ||
    t.includes("consent") ||
    (t.includes("privacy") && t.includes("choices"))
  );
}

function looksLikeNotFoundTitle(title = "") {
  const t = title.toLowerCase();
  return (
    t.includes("page not found") ||
    t.includes("404") ||
    t.includes("not available") ||
    t.includes("listing is no longer available")
  );
}

function extractTitleFromHtml(html = "") {
  const ogMatch = html.match(/<meta[^>]+property=[\"']og:title[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/i);
  if (ogMatch && ogMatch[1]) return ogMatch[1].trim();
  const twitterMatch = html.match(/<meta[^>]+name=[\"']twitter:title[\"'][^>]*content=[\"']([^\"']+)[\"'][^>]*>/i);
  if (twitterMatch && twitterMatch[1]) return twitterMatch[1].trim();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) return titleMatch[1].trim();
  return "";
}

function extractJsonLdTitle(html = "") {
  const scripts = html.match(/<script[^>]+type=[\"']application\/ld\+json[\"'][^>]*>[\s\S]*?<\/script>/gi);
  if (!scripts) return "";
  for (const script of scripts) {
    const jsonText = script.replace(/^[\s\S]*?>/, "").replace(/<\/script>[\s\S]*$/, "").trim();
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of candidates) {
        const type = entry?.["@type"];
        if (type === "Product" && entry?.name) return String(entry.name).trim();
        if (!type && entry?.name) return String(entry.name).trim();
      }
    } catch {
      // ignore bad JSON-LD
    }
  }
  return "";
}

function toAbsoluteUrl(value = "", base = "") {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function extractImageFromHtml(html = "", baseUrl = "") {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const raw = match?.[1] ? String(match[1]).trim() : "";
    if (!raw) continue;
    const absolute = toAbsoluteUrl(raw, baseUrl);
    if (!absolute || !/^https?:\/\//i.test(absolute)) continue;
    return absolute;
  }
  return "";
}

function extractJsonLdImage(html = "", baseUrl = "") {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi);
  if (!scripts) return "";

  for (const script of scripts) {
    const jsonText = script.replace(/^[\s\S]*?>/, "").replace(/<\/script>[\s\S]*$/, "").trim();
    if (!jsonText) continue;

    try {
      const parsed = JSON.parse(jsonText);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of candidates) {
        if (!entry || typeof entry !== "object") continue;

        const directImage = Array.isArray(entry.image)
          ? String(entry.image[0] || "").trim()
          : typeof entry.image === "string"
          ? entry.image.trim()
          : typeof entry.image?.url === "string"
          ? entry.image.url.trim()
          : "";

        if (directImage) {
          const absolute = toAbsoluteUrl(directImage, baseUrl);
          if (absolute && /^https?:\/\//i.test(absolute)) return absolute;
        }
      }
    } catch {
      // ignore bad JSON-LD blocks
    }
  }

  return "";
}

function decodeJsonString(input = "") {
  try {
    return JSON.parse(`"${input.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  } catch {
    return input;
  }
}

function findProductNameFromObject(input) {
  const queue = [input];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (typeof current.productName === "string" && current.productName.trim()) {
      return current.productName.trim();
    }
    if (
      typeof current.name === "string" &&
      current.name.trim() &&
      (current.productId || current.productCode || current.sku || current.id)
    ) {
      return current.name.trim();
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return "";
}

function extractAsosTitleFromHtml(html = "") {
  const nextDataMatch = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (nextDataMatch && nextDataMatch[1]) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      const name = findProductNameFromObject(parsed);
      if (name) return name;
    } catch {
      // ignore JSON errors
    }
  }

  const productNameMatch = html.match(/"productName"\s*:\s*"([^"]+)"/i);
  if (productNameMatch && productNameMatch[1]) {
    return decodeJsonString(productNameMatch[1]).trim();
  }

  const nameWithProductIdMatch = html.match(
    /"name"\s*:\s*"([^"]+)"\s*,\s*"product(?:Id|Code)"\s*:\s*"?\d+/i
  );
  if (nameWithProductIdMatch && nameWithProductIdMatch[1]) {
    return decodeJsonString(nameWithProductIdMatch[1]).trim();
  }

  return "";
}

app.post("/check-airbnb", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string" || !url.includes("airbnb.")) {
    return res.json({ exists: false, reason: "invalid_url" });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    const finalUrl = response.url || "";
    const status = response.status;

    // Helpful debug (watch your server terminal)
    console.log("CHECK:", { status, finalUrl });

    // Hard not-found
    if (status === 404 || finalUrl.includes("/404")) {
      return res.json({ exists: false, reason: "not_found" });
    }

    // Blocked / rate limited => unknown (do NOT say "not found")
    if (status === 403 || status === 429) {
      return res.json({ exists: null, reason: "blocked" });
    }

    // Other errors => unknown
    if (status >= 400) {
      return res.json({ exists: null, reason: `http_${status}` });
    }

    // Read HTML and decide
    const html = await response.text();

    if (looksLikeBlockedOrConsent(html)) {
      return res.json({ exists: null, reason: "consent_or_bot" });
    }

    if (looksLikeNotFound(html)) {
      return res.json({ exists: false, reason: "soft_404" });
    }

    // If we ended up somewhere that isn't a room page, treat as unknown
    // (Airbnb sometimes redirects to locale, consent, etc.)
    if (!finalUrl.includes("/rooms/")) {
      return res.json({ exists: null, reason: "redirected_elsewhere" });
    }

    // Passed all checks => likely valid
    return res.json({ exists: true, reason: "ok" });
  } catch (err) {
    console.log("CHECK ERROR:", err?.message);
    return res.json({ exists: null, reason: "fetch_failed" });
  }
});

app.post("/resolve-airbnb", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string" || !url.includes("airbnb.")) {
    return res.json({ resolvedUrl: null });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    const finalUrl = response.url || "";
    if (finalUrl && finalUrl.includes("/rooms/")) {
      return res.json({ resolvedUrl: finalUrl });
    }

    // Some short links require JS redirect. Fall back to Playwright.
    let browser;
    let page;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      });
      page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch {
        // continue best effort
      }

      const pwUrl = page.url() || "";
      if (pwUrl.includes("/rooms/")) {
        return res.json({ resolvedUrl: pwUrl });
      }

      const ogUrl = await page
        .$eval('meta[property="og:url"]', (el) => el.getAttribute("content"))
        .catch(() => null);

      if (ogUrl && ogUrl.includes("/rooms/")) {
        return res.json({ resolvedUrl: ogUrl });
      }
    } finally {
      try {
        if (page) await page.close();
      } catch {}
      try {
        if (browser) await browser.close();
      } catch {}
    }

    if (!finalUrl) return res.json({ resolvedUrl: null });
    return res.json({ resolvedUrl: finalUrl });
  } catch (err) {
    console.log("RESOLVE ERROR:", err?.message);
    return res.json({ resolvedUrl: null });
  }
});

app.post("/fetch-airbnb-title", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string" || !url.includes("airbnb.")) {
    return res.json({ title: null });
  }

  const cleanedUrl = cleanAirbnbUrl(url);
  if (titleCache.has(cleanedUrl)) {
    return res.json({ title: titleCache.get(cleanedUrl) });
  }

  let browser;
  let page;

  try {
    // First pass: lightweight HTML fetch. This is faster and avoids
    // Playwright in common cases.
    try {
      const quickResponse = await fetch(cleanedUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (quickResponse.ok) {
        const quickHtml = await quickResponse.text();
        const quickTitle =
          extractTitleFromHtml(quickHtml) || extractJsonLdTitle(quickHtml) || "";
        if (quickTitle && !looksLikeNotFoundTitle(quickTitle)) {
          titleCache.set(cleanedUrl, quickTitle.trim());
          return res.json({ title: quickTitle.trim() });
        }
      }
    } catch {
      // Continue to Playwright fallback.
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    });
    page = await context.newPage();

    const response = await page.goto(cleanedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    try {
      await page.waitForLoadState("networkidle", { timeout: 15000 });
    } catch {
      // Network idle can be noisy on Airbnb; continue with best effort.
    }

    const status = response?.status() ?? 0;
    const finalUrl = page.url();

    if (status === 404 || finalUrl.includes("/404")) {
      titleCache.set(cleanedUrl, null);
      return res.json({ title: null });
    }

    const ogTitle = await page
      .$eval('meta[property="og:title"]', (el) => el.getAttribute("content"))
      .catch(() => null);

    const docTitle = (await page.title().catch(() => "")) || "";

    const rawTitle = (ogTitle || docTitle || "").trim();

    if (!rawTitle || looksLikeNotFoundTitle(rawTitle)) {
      titleCache.set(cleanedUrl, null);
      return res.json({ title: null });
    }

    titleCache.set(cleanedUrl, rawTitle);
    return res.json({ title: rawTitle });
  } catch (err) {
    console.log("FETCH TITLE ERROR:", err?.message);
    return res.json({ title: null });
  } finally {
    try {
      if (page) await page.close();
    } catch {
      // ignore close errors
    }
    try {
      if (browser) await browser.close();
    } catch {
      // ignore close errors
    }
  }
});

app.post("/fetch-link-preview", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.json({ title: null, imageUrl: null });
  }

  const cleanedUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanedUrl)) {
    return res.json({ title: null, imageUrl: null });
  }

  if (previewCache.has(cleanedUrl)) {
    return res.json(previewCache.get(cleanedUrl));
  }

  const overallTimeoutMs = 8500;
  let responded = false;
  const safeRespond = (payload) => {
    if (responded) return;
    responded = true;
    res.json(payload);
  };

  const normalizePreviewPayload = (payload = {}) => ({
    title: payload?.title ? String(payload.title).trim() : null,
    imageUrl: payload?.imageUrl ? String(payload.imageUrl).trim() : null,
  });

  const respondAndCache = (payload = {}) => {
    const normalized = normalizePreviewPayload(payload);
    previewCache.set(cleanedUrl, normalized);
    safeRespond(normalized);
  };

  const trySimpleFetch = async () => {
    const response = await fetch(cleanedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) return { title: "", imageUrl: "" };
    const html = await response.text();
    const finalUrl = response.url || cleanedUrl;

    let title = extractTitleFromHtml(html);
    if (!title) {
      title = extractJsonLdTitle(html);
    }
    if (!title) {
      let host = "";
      try {
        host = new URL(finalUrl).hostname.toLowerCase();
      } catch {
        host = "";
      }
      if (host.includes("asos.com")) {
        title = extractAsosTitleFromHtml(html);
      }
    }

    const imageUrl = extractImageFromHtml(html, finalUrl) || extractJsonLdImage(html, finalUrl) || "";
    return {
      title: !looksLikeNotFoundTitle(title) ? title : "",
      imageUrl,
    };
  };

  const tryPlaywright = async () => {
    let browser;
    let page;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      });
      page = await context.newPage();
      await page.goto(cleanedUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
      try {
        await page.waitForLoadState("networkidle", { timeout: 4500 });
      } catch {
        // best effort
      }

      const finalUrl = page.url() || cleanedUrl;
      const ogTitle = await page
        .$eval('meta[property="og:title"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const twitterTitle = await page
        .$eval('meta[name="twitter:title"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const docTitle = (await page.title().catch(() => "")) || "";

      const ogImage = await page
        .$eval('meta[property="og:image:secure_url"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const ogImageFallback = await page
        .$eval('meta[property="og:image"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const twitterImage = await page
        .$eval('meta[name="twitter:image:src"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const twitterImageFallback = await page
        .$eval('meta[name="twitter:image"]', (el) => el.getAttribute("content"))
        .catch(() => null);

      let title = (ogTitle || twitterTitle || docTitle || "").trim();
      if (!title) {
        const html = await page.content().catch(() => "");
        if (html) {
          title = extractJsonLdTitle(html);
          if (!title && finalUrl.includes("asos.com")) {
            title = extractAsosTitleFromHtml(html);
          }
        }
      }

      let imageUrl = (ogImage || ogImageFallback || twitterImage || twitterImageFallback || "").trim();
      if (imageUrl) {
        imageUrl = toAbsoluteUrl(imageUrl, finalUrl);
      }
      if (!imageUrl) {
        const html = await page.content().catch(() => "");
        if (html) {
          imageUrl = extractJsonLdImage(html, finalUrl);
        }
      }

      return {
        title: !looksLikeNotFoundTitle(title) ? title : "",
        imageUrl,
      };
    } finally {
      try {
        if (page) await page.close();
      } catch {}
      try {
        if (browser) await browser.close();
      } catch {}
    }
  };

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve("__timeout__"), overallTimeoutMs)
  );

  try {
    const quickPreview = await Promise.race([trySimpleFetch(), timeoutPromise]);
    if (
      quickPreview &&
      quickPreview !== "__timeout__" &&
      (quickPreview.title || quickPreview.imageUrl)
    ) {
      return respondAndCache(quickPreview);
    }

    const richPreview = await Promise.race([tryPlaywright(), timeoutPromise]);
    if (
      richPreview &&
      richPreview !== "__timeout__" &&
      (richPreview.title || richPreview.imageUrl)
    ) {
      return respondAndCache(richPreview);
    }
  } catch (err) {
    console.log("FETCH PREVIEW ERROR:", err?.message);
  }

  return respondAndCache({ title: null, imageUrl: null });
});

app.post("/fetch-title", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.json({ title: null });
  }

  const cleanedUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanedUrl)) {
    return res.json({ title: null });
  }
  if (universalTitleCache.has(cleanedUrl)) {
    return res.json({ title: universalTitleCache.get(cleanedUrl) });
  }

  const overallTimeoutMs = 7000;
  let responded = false;
  const safeRespond = (payload) => {
    if (responded) return;
    responded = true;
    res.json(payload);
  };

  const trySimpleFetch = async () => {
    const response = await fetch(cleanedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) return "";

    const html = await response.text();
    let title = extractTitleFromHtml(html);
    if (!title) {
      title = extractJsonLdTitle(html);
    }
    if (!title) {
      let host = "";
      try {
        host = new URL(cleanedUrl).hostname.toLowerCase();
      } catch {
        host = "";
      }
      if (host.includes("asos.com")) {
        title = extractAsosTitleFromHtml(html);
      }
    }
    if (title && !looksLikeNotFoundTitle(title)) return title;
    return "";
  };

  const tryPlaywright = async () => {
    let browser;
    let page;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      });
      page = await context.newPage();
      await page.goto(cleanedUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
      try {
        await page.waitForLoadState("networkidle", { timeout: 4000 });
      } catch {
        // best effort
      }

      const ogTitle = await page
        .$eval('meta[property="og:title"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const twitterTitle = await page
        .$eval('meta[name="twitter:title"]', (el) => el.getAttribute("content"))
        .catch(() => null);
      const docTitle = (await page.title().catch(() => "")) || "";
      let rawTitle = (ogTitle || twitterTitle || docTitle || "").trim();

      if (!rawTitle) {
        const jsonLdTitle = await page
          .$$eval('script[type="application/ld+json"]', (nodes) => {
            for (const node of nodes) {
              try {
                const text = node.textContent || "";
                if (!text) continue;
                const parsed = JSON.parse(text);
                const list = Array.isArray(parsed) ? parsed : [parsed];
                for (const entry of list) {
                  const type = entry?.["@type"];
                  if (type === "Product" && entry?.name) return entry.name;
                  if (!type && entry?.name) return entry.name;
                }
              } catch {
                // ignore
              }
            }
            return null;
          })
          .catch(() => null);
        rawTitle = (jsonLdTitle || "").trim();
      }

      if (!rawTitle) {
        const html = await page.content().catch(() => "");
        if (html) {
          let host = "";
          try {
            host = new URL(cleanedUrl).hostname.toLowerCase();
          } catch {
            host = "";
          }
          if (host.includes("asos.com")) {
            rawTitle = extractAsosTitleFromHtml(html);
          }
        }
      }

      if (rawTitle && !looksLikeNotFoundTitle(rawTitle)) return rawTitle;
      return "";
    } finally {
      try {
        if (page) await page.close();
      } catch {}
      try {
        if (browser) await browser.close();
      } catch {}
    }
  };

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve("__timeout__"), overallTimeoutMs)
  );

  try {
    const quickTitle = await Promise.race([trySimpleFetch(), timeoutPromise]);
    if (quickTitle && quickTitle !== "__timeout__") {
      universalTitleCache.set(cleanedUrl, quickTitle);
      return safeRespond({ title: quickTitle });
    }

    const pwTitle = await Promise.race([tryPlaywright(), timeoutPromise]);
    if (pwTitle && pwTitle !== "__timeout__") {
      universalTitleCache.set(cleanedUrl, pwTitle);
      return safeRespond({ title: pwTitle });
    }
  } catch (err) {
    console.log("FETCH TITLE ERROR:", err?.message);
  }

  universalTitleCache.set(cleanedUrl, null);
  return safeRespond({ title: null });
});

app.use("/api/social", createSocialRouter());

app.listen(5000, () => {
  console.log("✅ Server running on http://localhost:5000");
});
