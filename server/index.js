import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

const titleCache = new Map();

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

app.listen(5000, () => {
  console.log("✅ Server running on http://localhost:5000");
});
