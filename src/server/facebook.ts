import { readFileSync } from "fs";
import { DeskError, GRAPH_VERSION, publicError } from "./paths";

function graph(path: string, query: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

async function request(method: "GET" | "POST", url: string, fields?: Record<string, string> | FormData) {
  const init: RequestInit = { method, signal: AbortSignal.timeout(120000) };
  if (method === "POST" && fields) {
    if (fields instanceof FormData) init.body = fields;
    else {
      init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      init.body = new URLSearchParams(fields);
    }
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new DeskError(`Facebook could not be reached. ${error instanceof Error ? error.message : ""}`, 502);
  }
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; [key: string]: unknown } | null;
  if (!payload) throw new DeskError("Facebook returned an unreadable answer.", 502);
  if (!response.ok || payload.error) {
    throw new DeskError(publicError(String(payload.error?.message || "Facebook refused the request.")), response.status || 502);
  }
  return payload as { post_id?: string; id?: string; access_token?: string; name?: string; data?: unknown };
}

export async function exchangeCode(appId: string, secret: string, code: string, redirectUri: string) {
  const short = await request("GET", graph("oauth/access_token", {
    client_id: appId,
    client_secret: secret,
    redirect_uri: redirectUri,
    code,
  }));
  const token = String(short.access_token || "");
  if (!token) throw new DeskError("Facebook did not return a login token.");
  const long = await request("GET", graph("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: token,
  }));
  return String(long.access_token || token);
}

export async function listPages(userToken: string) {
  const payload = await request("GET", graph("me/accounts", {
    fields: "id,name,access_token",
    limit: "50",
    access_token: userToken,
  }));
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.flatMap((page) => {
    const row = page as { id?: string; name?: string; access_token?: string };
    if (!row.id || !row.access_token) return [];
    return [{ id: String(row.id), name: String(row.name || "Page"), token: String(row.access_token) }];
  });
}

export async function pageInfo(pageId: string, token: string) {
  return request("GET", graph(pageId, { fields: "id,name,link", access_token: token }));
}

export async function publishPhoto(pageId: string, token: string, caption: string, imagePath: string | null, mime: string | null) {
  let payload: { post_id?: string; id?: string };
  if (imagePath) {
    const bytes = readFileSync(imagePath);
    const type = mime || "image/jpeg";
    const name = type.includes("png") ? "post.png" : type.includes("webp") ? "post.webp" : "post.jpg";
    const form = new FormData();
    form.set("message", caption);
    form.set("published", "true");
    form.set("access_token", token);
    form.set("source", new Blob([bytes], { type }), name);
    payload = await request("POST", graph(`${pageId}/photos`), form);
  } else {
    payload = await request("POST", graph(`${pageId}/feed`), { message: caption, access_token: token });
  }
  const id = String(payload.post_id || payload.id || "");
  if (!id) throw new DeskError("Facebook did not confirm the post.");
  return { id, url: `https://www.facebook.com/${id}` };
}
