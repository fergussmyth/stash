import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";

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
    .select("id,url,domain,primary_action")
    .eq("trip_id", collectionId)
    .is("primary_action", null)
    .limit(200);

  if (itemsError) {
    return new Response(JSON.stringify({ error: "Failed to load links." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  for (const item of items || []) {
    const domain = item.domain || getDomain(item.url || "");
    const action = inferAction(item.url || "", domain);
    const { error: updateError } = await supabase
      .from("trip_items")
      .update({ primary_action: action })
      .eq("id", item.id);
    if (!updateError) updated += 1;
  }

  return new Response(JSON.stringify({ updated }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
