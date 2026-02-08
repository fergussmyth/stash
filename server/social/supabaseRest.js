import fetch from "node-fetch";
import { SupabaseRestError } from "./errors.js";

function stripTrailingSlash(input = "") {
  return String(input || "").replace(/\/+$/, "");
}

function buildQuery({ select, filters, order, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (select) params.set("select", select);
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value == null) continue;
      params.set(key, String(value));
    }
  }
  if (order && order.length > 0) {
    const orderParts = order
      .filter(Boolean)
      .map((o) => {
        const column = o.column;
        if (!column) return "";
        const direction = o.ascending === false ? "desc" : "asc";
        const nulls = o.nulls ? `.${o.nulls}` : "";
        return `${column}.${direction}${nulls}`;
      })
      .filter(Boolean);
    if (orderParts.length > 0) params.set("order", orderParts.join(","));
  }
  if (limit != null) params.set("limit", String(limit));
  if (offset != null) params.set("offset", String(offset));
  return params.toString();
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createSupabaseRestClient({ supabaseUrl, supabaseAnonKey }) {
  const baseUrl = `${stripTrailingSlash(supabaseUrl)}/rest/v1`;

  const buildHeaders = ({ authToken, prefer, accept } = {}) => {
    const token = authToken || supabaseAnonKey;
    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    };
    if (accept) headers.Accept = accept;
    if (prefer) headers.Prefer = prefer;
    return headers;
  };

  const request = async (path, { method = "GET", query, body, authToken, headers } = {}) => {
    const qs = query ? `?${query}` : "";
    const url = `${baseUrl}/${path}${qs}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...buildHeaders({ authToken }),
        ...headers,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });

    if (res.ok) {
      return readJsonResponse(res);
    }

    const payload = await readJsonResponse(res);
    throw new SupabaseRestError(res.status, payload);
  };

  const select = async (table, options = {}, { authToken } = {}) => {
    const query = buildQuery(options);
    const data = await request(encodeURIComponent(table), { method: "GET", query, authToken });
    return Array.isArray(data) ? data : [];
  };

  const selectOne = async (table, options = {}, { authToken } = {}) => {
    const rows = await select(
      table,
      { ...options, limit: 1 },
      { authToken }
    );
    return rows[0] || null;
  };

  const insert = async (table, values, { authToken, select: selectCols = "*" } = {}) => {
    const query = buildQuery({ select: selectCols });
    const data = await request(encodeURIComponent(table), {
      method: "POST",
      query,
      authToken,
      body: values,
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });
    return Array.isArray(data) ? data : [];
  };

  const update = async (
    table,
    filters,
    values,
    { authToken, select: selectCols = "*" } = {}
  ) => {
    const query = buildQuery({ select: selectCols, filters });
    const data = await request(encodeURIComponent(table), {
      method: "PATCH",
      query,
      authToken,
      body: values,
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });
    return Array.isArray(data) ? data : [];
  };

  const remove = async (table, filters, { authToken, select: selectCols = "*" } = {}) => {
    const query = buildQuery({ select: selectCols, filters });
    const data = await request(encodeURIComponent(table), {
      method: "DELETE",
      query,
      authToken,
      headers: {
        Prefer: "return=representation",
      },
    });
    return Array.isArray(data) ? data : [];
  };

  const rpc = async (fnName, args, { authToken } = {}) => {
    const path = `rpc/${encodeURIComponent(fnName)}`;
    return request(path, {
      method: "POST",
      authToken,
      body: args || {},
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  return { select, selectOne, insert, update, remove, rpc };
}

