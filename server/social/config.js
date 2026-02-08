export function getSupabaseConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.REACT_APP_SUPABASE_URL ||
    "";
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.REACT_APP_SUPABASE_ANON_KEY ||
    "";

  return {
    supabaseUrl: String(supabaseUrl || "").trim(),
    supabaseAnonKey: String(supabaseAnonKey || "").trim(),
  };
}

