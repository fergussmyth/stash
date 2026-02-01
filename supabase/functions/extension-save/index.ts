import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getBearerToken, hashToken, normalizeUrl } from "../_shared/utils.ts";

const URL_MAX = 2000;
const TITLE_MAX = 300;
const NOTE_MAX = 2000;

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
      .select("id,owner_id")
      .eq("id", collectionId)
      .maybeSingle();

    if (!tripRow || tripRow.owner_id !== tokenRow.user_id) {
      return new Response(JSON.stringify({ error: "Collection not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUrl = normalizeUrl(rawUrl);

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

    const { error: insertError } = await supabase.from("trip_items").insert({
      trip_id: collectionId,
      url: rawUrl,
      original_url: rawUrl,
      item_type: "link",
      title: title || null,
      note: note || null,
      normalized_url: normalizedUrl,
      added_at: new Date().toISOString(),
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: "Failed to save link." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "saved" }), {
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
