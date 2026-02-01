import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";
import { pickCoverForCollection, preferCover } from "../_shared/collection-cover.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  let payload: { collectionId?: string; force?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const collectionId = payload.collectionId || "";
  const force = !!payload.force;
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
    .select("id,owner_id,name,type,cover_image_url,cover_image_source,cover_updated_at")
    .eq("id", collectionId)
    .maybeSingle();

  if (tripError || !trip || trip.owner_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: "Collection not found." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!force && trip.cover_updated_at) {
    const updatedAt = new Date(trip.cover_updated_at).getTime();
    if (updatedAt && Date.now() - updatedAt < DAY_MS) {
      return new Response(
        JSON.stringify({
          status: "skipped",
          coverImageUrl: trip.cover_image_url,
          coverImageSource: trip.cover_image_source,
          coverUpdatedAt: trip.cover_updated_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  const { data: items } = await supabase
    .from("trip_items")
    .select("url,added_at")
    .eq("trip_id", collectionId)
    .order("added_at", { ascending: false })
    .limit(3);

  const candidate = await pickCoverForCollection({
    name: trip.name || "Collection",
    type: trip.type || "general",
    items: items || [],
    seed: trip.id || trip.name || "stash",
  });
  const cover = preferCover({
    currentUrl: trip.cover_image_url,
    currentSource: trip.cover_image_source,
    nextUrl: candidate.coverImageUrl,
    nextSource: candidate.coverImageSource,
  });

  const coverUpdatedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("trips")
    .update({
      cover_image_url: cover.coverImageUrl,
      cover_image_source: cover.coverImageSource,
      cover_updated_at: coverUpdatedAt,
    })
    .eq("id", collectionId)
    .eq("owner_id", userData.user.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: "Failed to update cover." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      status: "updated",
      coverImageUrl: cover.coverImageUrl,
      coverImageSource: cover.coverImageSource,
      coverUpdatedAt,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
