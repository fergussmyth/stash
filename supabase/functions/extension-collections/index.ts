import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getBearerToken, hashToken } from "../_shared/utils.ts";

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

    await supabase
      .from("extension_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    const { data: trips, error: tripsError } = await supabase
      .from("trips")
      .select("id,name,updated_at,trip_items(count)")
      .eq("owner_id", tokenRow.user_id)
      .order("updated_at", { ascending: false });

    if (tripsError) {
      return new Response(JSON.stringify({ error: "Failed to load collections." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (trips || []).map((trip) => ({
      id: trip.id,
      name: trip.name,
      updated_at: trip.updated_at,
      link_count: trip.trip_items?.[0]?.count ?? 0,
    }));

    return new Response(JSON.stringify({ collections: payload }), {
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
