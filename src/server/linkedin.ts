import { readFileSync } from "fs";
import { DeskError, publicError } from "./paths";

const VERSION = "202401";

async function linkedRequest(method: "GET" | "POST" | "PUT", url: string, token: string, body?: unknown, raw?: Buffer, contentType?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const init: RequestInit = { method, signal: AbortSignal.timeout(120000), headers };
  if (raw) {
    headers["Content-Type"] = contentType || "application/octet-stream";
    init.body = new Uint8Array(raw);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new DeskError(`LinkedIn could not be reached. ${error instanceof Error ? error.message : ""}`, 502);
  }
  if (method === "PUT" && response.ok) return {};
  const text = await response.text();
  let payload: { message?: string; errorDetail?: string; id?: string; value?: { uploadUrl?: string; image?: string } } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.message || payload?.errorDetail || text.slice(0, 240) || "LinkedIn refused the request.";
    throw new DeskError(publicError(message), response.status || 502);
  }
  return (payload || {}) as { id?: string; value?: { uploadUrl?: string; image?: string } };
}

function orgUrn(orgId: string) {
  const id = orgId.replace(/^urn:li:organization:/, "").trim();
  if (!id) throw new DeskError("Add the LinkedIn company ID.");
  return `urn:li:organization:${id}`;
}

export async function publishPhoto(orgId: string, token: string, caption: string, imagePath: string, mime: string) {
  const owner = orgUrn(orgId);
  const bytes = readFileSync(imagePath);
  const started = await linkedRequest("POST", "https://api.linkedin.com/rest/images?action=initializeUpload", token, {
    initializeUploadRequest: { owner },
  });
  const uploadUrl = String(started.value?.uploadUrl || "");
  const imageUrn = String(started.value?.image || "");
  if (!uploadUrl || !imageUrn) throw new DeskError("LinkedIn did not start the image upload.");
  await linkedRequest("PUT", uploadUrl, token, undefined, bytes, mime || "image/jpeg");
  const created = await linkedRequest("POST", "https://api.linkedin.com/rest/posts", token, {
    author: owner,
    commentary: caption,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: { media: { id: imageUrn } },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
  const id = String(created.id || imageUrn);
  const company = orgId.replace(/^urn:li:organization:/, "").trim();
  return { id, url: `https://www.linkedin.com/company/${encodeURIComponent(company)}/` };
}
