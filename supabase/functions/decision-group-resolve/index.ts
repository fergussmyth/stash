import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/utils.ts";

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

  let payload: { collectionId?: string; decisionGroupId?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const collectionId = payload.collectionId || "";
  const decisionGroupId = payload.decisionGroupId || "";
  if (!collectionId || !decisionGroupId) {
    return new Response(JSON.stringify({ error: "collectionId and decisionGroupId are required." }), {
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
    .select("id,shortlisted,dismissed,chosen")
    .eq("trip_id", collectionId)
    .eq("decision_group_id", decisionGroupId);

  if (itemsError) {
    return new Response(JSON.stringify({ error: "Failed to load links." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const activeLinks = (items || []).filter((item) => !item.dismissed);
  const shortlistedLinks = activeLinks.filter((item) => item.shortlisted);

  if (activeLinks.length === 1) {
    const winner = activeLinks[0];
    const { data: updated, error: updateError } = await supabase
      .from("trip_items")
      .update({ chosen: true })
      .eq("id", winner.id)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return new Response(JSON.stringify({ error: "Failed to set chosen." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "chosen", linkId: winner.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (shortlistedLinks.length === 1 && activeLinks.length >= 2) {
    return new Response(
      JSON.stringify({ status: "candidate_chosen", linkId: shortlistedLinks[0].id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ status: "no_resolution", linkId: null }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
