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

  let payload: { linkId?: string; shortlisted?: boolean; dismissed?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const linkId = payload.linkId || "";
  if (!linkId) {
    return new Response(JSON.stringify({ error: "linkId is required." }), {
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

  const { data: linkRow, error: linkError } = await supabase
    .from("trip_items")
    .select("id,trip_id,shortlisted,dismissed,chosen")
    .eq("id", linkId)
    .maybeSingle();

  if (linkError || !linkRow) {
    return new Response(JSON.stringify({ error: "Link not found." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tripRow, error: tripError } = await supabase
    .from("trips")
    .select("id,owner_id")
    .eq("id", linkRow.trip_id)
    .maybeSingle();

  if (tripError || !tripRow || tripRow.owner_id !== userData.user.id) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const updates: Record<string, boolean> = {};
  if (typeof payload.shortlisted === "boolean") {
    updates.shortlisted = payload.shortlisted;
  }
  if (typeof payload.dismissed === "boolean") {
    updates.dismissed = payload.dismissed;
    if (payload.dismissed) {
      updates.shortlisted = false;
    }
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify(linkRow), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: updated, error: updateError } = await supabase
    .from("trip_items")
    .update(updates)
    .eq("id", linkId)
    .select("id,shortlisted,dismissed,chosen")
    .maybeSingle();

  if (updateError || !updated) {
    return new Response(JSON.stringify({ error: "Failed to update flags." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
