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

  let payload: { collectionId?: string; decisionGroupId?: string; chosenLinkId?: string } = {};
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
  const chosenLinkId = payload.chosenLinkId || "";
  if (!collectionId || !decisionGroupId || !chosenLinkId) {
    return new Response(
      JSON.stringify({ error: "collectionId, decisionGroupId, chosenLinkId are required." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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

  const { error: updateError, data } = await supabase
    .from("trip_items")
    .update({ dismissed: true, shortlisted: false })
    .eq("trip_id", collectionId)
    .eq("decision_group_id", decisionGroupId)
    .neq("id", chosenLinkId)
    .select("id");

  if (updateError) {
    return new Response(JSON.stringify({ error: "Failed to archive others." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ updated: data?.length || 0 }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
