import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_WINDOW_MS = 14 * DAY_MS;

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

function normalizeTitle(title: string): string[] {
  const cleaned = (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word && !STOP_WORDS.has(word));
}

function overlapRatio(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length || !bTokens.length) return 0;
  const setA = new Set(aTokens);
  let overlap = 0;
  for (const token of bTokens) {
    if (setA.has(token)) overlap += 1;
  }
  const denom = Math.max(aTokens.length, bTokens.length);
  return denom ? overlap / denom : 0;
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env vars." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { collectionId?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const collectionId = payload.collectionId || "";
  if (!collectionId) {
    return new Response(JSON.stringify({ error: "collectionId is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id,owner_id")
    .eq("id", collectionId)
    .maybeSingle();

  if (tripError || !trip || trip.owner_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: "Collection not found." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: items, error: itemsError } = await supabase
    .from("trip_items")
    .select(
      "id,url,title,domain,added_at,last_opened_at,decision_group_id,chosen,open_count,shortlisted,dismissed"
    )
    .eq("trip_id", collectionId)
    .order("added_at", { ascending: false })
    .limit(200);

  if (itemsError) {
    return new Response(JSON.stringify({ error: "Failed to load links." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  for (const [domain, domainItems] of byDomain.entries()) {
    const sorted = [...domainItems].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const matchingGroups = Array.from(existingGroups.values()).filter(
      (group) => group.domain === domain
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
      const seedTokens = normalizeTitle(seed.title || "");
      const group = [seed];
      index += 1;

      while (index < sorted.length && group.length < 5) {
        const candidate = sorted[index];
        const timeDiff = Math.abs((seed.addedAt || 0) - (candidate.addedAt || 0));
        if (timeDiff > GROUP_WINDOW_MS) break;

        const candidateTokens = normalizeTitle(candidate.title || "");
        const similarity = overlapRatio(seedTokens, candidateTokens);
        // Title similarity is optional; it just strengthens grouping.
        void similarity;
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

  let linksUpdated = 0;

  for (const group of groups) {
    for (const item of group.items) {
      const { error: updateError } = await supabase
        .from("trip_items")
        .update({ decision_group_id: group.id, chosen: false })
        .eq("id", item.id);
      if (!updateError) linksUpdated += 1;
    }
  }

  const { data: groupedItems, error: groupedError } = await supabase
    .from("trip_items")
    .select("id,decision_group_id")
    .eq("trip_id", collectionId)
    .not("decision_group_id", "is", null);

  if (!groupedError && groupedItems) {
    const groupMap = new Map<string, string[]>();
    for (const item of groupedItems) {
      if (!item.decision_group_id) continue;
      if (!groupMap.has(item.decision_group_id)) groupMap.set(item.decision_group_id, []);
      groupMap.get(item.decision_group_id)?.push(item.id);
    }

    for (const [groupId, ids] of groupMap.entries()) {
      if (ids.length === 1) {
        const { error: chosenError } = await supabase
          .from("trip_items")
          .update({ chosen: true })
          .eq("id", ids[0]);
        if (!chosenError) linksUpdated += 1;
      } else {
        const { error: clearError } = await supabase
          .from("trip_items")
          .update({ chosen: false })
          .eq("decision_group_id", groupId);
        if (!clearError) linksUpdated += ids.length;
      }
    }
  }

  return new Response(
    JSON.stringify({ groupsCreated: groups.length, linksUpdated }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
