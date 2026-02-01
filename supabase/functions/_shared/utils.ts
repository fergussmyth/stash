export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashToken(rawToken: string): Promise<string> {
  const pepper = Deno.env.get("TOKEN_PEPPER");
  if (!pepper) {
    throw new Error("Missing TOKEN_PEPPER");
  }
  const input = `${rawToken}${pepper}`;
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export function normalizeUrl(input: string): string {
  let value = (input || "").trim();
  if (!value) return value;

  const trailing = new Set([")", ".", ",", "]", "}", ">", "\"", "'"]);
  while (value.length > 0 && trailing.has(value[value.length - 1])) {
    value = value.slice(0, -1);
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  return value;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (!token || type.toLowerCase() !== "bearer") return null;
  return token.trim();
}
