import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getBearerToken, hashToken, normalizeUrl } from "../_shared/utils.ts";
import { pickCoverForCollection, preferCover } from "../_shared/collection-cover.ts";

const URL_MAX = 2000;
const TITLE_MAX = 300;
const NOTE_MAX = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_WINDOW_MS = 14 * DAY_MS;

const ECOMMERCE_DOMAINS = [
  "amazon.",
  "asos.",
  "nike.",
  "adidas.",
  "ebay.",
  "etsy.",
  "target.",
  "walmart.",
  "bestbuy.",
  "shopify.",
  "zara.",
  "hm.",
  "uniqlo.",
  "ssense.",
  "net-a-porter.",
  "farfetch.",
];
const TRAVEL_DOMAINS = [
  "airbnb.",
  "booking.",
  "expedia.",
  "hotels.",
  "priceline.",
  "tripadvisor.",
  "vrbo.",
  "marriott.",
  "hilton.",
  "hyatt.",
];

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
]);

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function inferAction(url: string, domain: string): string {
  const cleanDomain = (domain || "").toLowerCase();
  const cleanUrl = (url || "").toLowerCase();

  if (cleanDomain.includes("youtube.com") || cleanDomain.includes("youtu.be") || cleanUrl.includes("/watch")) {
    return "watch";
  }

  if (cleanDomain.includes("github.com")) {
    return "reference";
  }

  if (
    TRAVEL_DOMAINS.some((entry) => cleanDomain.includes(entry)) ||
    cleanUrl.includes("/hotel") ||
    cleanUrl.includes("/hotels") ||
    cleanUrl.includes("/stay") ||
    cleanUrl.includes("/rooms")
  ) {
    return "book";
  }

  if (
    cleanUrl.includes("/product") ||
    cleanUrl.includes("/prd/") ||
    cleanUrl.includes("cart") ||
    cleanUrl.includes("checkout") ||
    ECOMMERCE_DOMAINS.some((entry) => cleanDomain.includes(entry))
  ) {
    return "buy";
  }

  return "read";
}

function normalizeTitle(title: string): string[] {
  const cleaned = (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word && !STOP_WORDS.has(word));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env vars." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawToken = getBearerToken(req);
  if (!rawToken) {
    return new Response(JSON.stringify({ error: "Missing bearer token." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { collectionId?: string; url?: string; title?: string; note?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const collectionId = payload.collectionId || "";
  const rawUrl = payload.url || "";
  const title = payload.title || "";
  const note = payload.note || "";

  if (!collectionId || !rawUrl) {
    return new Response(JSON.stringify({ error: "collectionId and url are required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (rawUrl.length > URL_MAX || title.length > TITLE_MAX || note.length > NOTE_MAX) {
    return new Response(JSON.stringify({ error: "Payload too large." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const tokenHash = await hashToken(rawToken);
    const { data: tokenRow, error: tokenError } = await supabase
      .from("extension_tokens")
      .select("id,user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tripRow } = await supabase
      .from("trips")
      .select("id,owner_id,name,type,cover_image_url,cover_image_source")
      .eq("id", collectionId)
      .maybeSingle();

    if (!tripRow || tripRow.owner_id !== tokenRow.user_id) {
      return new Response(JSON.stringify({ error: "Collection not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = normalizeUrl(rawUrl);
    const domain = getDomain(rawUrl);
    const primaryAction = inferAction(rawUrl, domain);

    const { data: existing } = await supabase
      .from("trip_items")
      .select("id")
      .eq("trip_id", collectionId)
      .eq("normalized_url", normalizedUrl)
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ status: "exists" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insertError } = await supabase.from("trip_items").insert({
      trip_id: collectionId,
      url: rawUrl,
      original_url: rawUrl,
      item_type: "link",
      title: title || null,
      note: note || null,
      domain: domain || null,
      primary_action: primaryAction,
      normalized_url: normalizedUrl,
      added_at: new Date().toISOString(),
    }).select("id");

    if (insertError) {
      return new Response(JSON.stringify({ error: "Failed to save link." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items } = await supabase
      .from("trip_items")
      .select(
        "id,url,title,domain,added_at,last_opened_at,decision_group_id,open_count,shortlisted,dismissed"
      )
      .eq("trip_id", collectionId)
      .order("added_at", { ascending: false })
      .limit(200);

    if (tripRow) {
      const candidate = await pickCoverForCollection({
        name: tripRow.name || "Collection",
        type: tripRow.type || "general",
        items: (items || []).slice(0, 3),
        seed: tripRow.id,
      });
      const cover = preferCover({
        currentUrl: tripRow.cover_image_url,
        currentSource: tripRow.cover_image_source,
        nextUrl: candidate.coverImageUrl,
        nextSource: candidate.coverImageSource,
      });
      await supabase
        .from("trips")
        .update({
          cover_image_url: cover.coverImageUrl,
          cover_image_source: cover.coverImageSource,
          cover_updated_at: new Date().toISOString(),
        })
        .eq("id", collectionId);
    }

    const now = Date.now();
    const candidates = (items || [])
      .map((item) => ({
        ...item,
        addedAt: item.added_at ? new Date(item.added_at).getTime() : 0,
        lastOpenedAt: item.last_opened_at ? new Date(item.last_opened_at).getTime() : 0,
        domain: item.domain || getDomain(item.url || ""),
      }))
      .filter((item) => {
        const recentCreated = item.addedAt && now - item.addedAt <= GROUP_WINDOW_MS;
        const recentOpened = item.lastOpenedAt && now - item.lastOpenedAt <= GROUP_WINDOW_MS;
        return recentCreated || recentOpened;
      });

    const existingGroups = new Map<
      string,
      { id: string; domain: string; score: number; lastActive: number }
    >();
    for (const item of candidates) {
      if (!item.decision_group_id || !item.domain) continue;
      const groupId = item.decision_group_id;
      const scoreBoost = (item.open_count || 0) + (item.shortlisted ? 2 : 0);
      const lastActive = Math.max(item.lastOpenedAt || 0, item.addedAt || 0);
      const existing = existingGroups.get(groupId);
      if (!existing) {
        existingGroups.set(groupId, {
          id: groupId,
          domain: item.domain,
          score: scoreBoost,
          lastActive,
        });
      } else {
        existing.score += scoreBoost;
        existing.lastActive = Math.max(existing.lastActive, lastActive);
      }
    }

    const byDomain = new Map<string, typeof candidates>();
    for (const item of candidates) {
      if (!item.domain) continue;
      if (!byDomain.has(item.domain)) byDomain.set(item.domain, []);
      byDomain.get(item.domain)?.push(item);
    }

    const groups: Array<{ id: string; items: typeof candidates }> = [];

    for (const [domainKey, domainItems] of byDomain.entries()) {
      const sorted = [...domainItems].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      const matchingGroups = Array.from(existingGroups.values()).filter(
        (group) => group.domain === domainKey
      );
      let targetGroupId: string | null = null;
      if (matchingGroups.length > 0) {
        matchingGroups.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.lastActive - a.lastActive;
        });
        targetGroupId = matchingGroups[0].id;
      }
      let index = 0;
      while (index < sorted.length) {
        const seed = sorted[index];
        normalizeTitle(seed.title || "");
        const group = [seed];
        index += 1;

        while (index < sorted.length && group.length < 5) {
          const candidate = sorted[index];
          const timeDiff = Math.abs((seed.addedAt || 0) - (candidate.addedAt || 0));
          if (timeDiff > GROUP_WINDOW_MS) break;
          group.push(candidate);
          index += 1;
        }

        if (group.length >= 2) {
          const groupId = targetGroupId || crypto.randomUUID();
          groups.push({ id: groupId, items: group });
          targetGroupId = null;
        }
      }
    }

    for (const group of groups) {
      for (const item of group.items) {
        await supabase
          .from("trip_items")
          .update({ decision_group_id: group.id })
          .eq("id", item.id);
      }
    }

    const { data: groupedItems } = await supabase
      .from("trip_items")
      .select("id,decision_group_id,dismissed")
      .eq("trip_id", collectionId)
      .not("decision_group_id", "is", null);

    if (groupedItems) {
      const groupMap = new Map<string, string[]>();
      for (const item of groupedItems) {
        if (!item.decision_group_id || item.dismissed) continue;
        if (!groupMap.has(item.decision_group_id)) groupMap.set(item.decision_group_id, []);
        groupMap.get(item.decision_group_id)?.push(item.id);
      }

      for (const [groupId, ids] of groupMap.entries()) {
        if (ids.length === 1) {
          await supabase.from("trip_items").update({ chosen: true }).eq("id", ids[0]);
        }
      }
    }

    return new Response(JSON.stringify({ status: "saved", id: inserted?.[0]?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
