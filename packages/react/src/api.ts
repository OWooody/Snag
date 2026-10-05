import {
  getSnagConfig,
  isDebugEnabled,
  resolveRequester,
  resolveRequesterToken,
} from "./config";
import { trackRequestStatuses } from "./notifications";
import type {
  ConfirmSnagRequestBody,
  ConfirmSnagRequestResponse,
  CreateSnagRequestBody,
  CreateSnagRequestResponse,
  RelayStateResponse,
  ReplySnagRequestResponse,
} from "./protocol";

function debugLog(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log("[Snag]", ...args);
  }
}

async function buildHeaders(): Promise<Record<string, string>> {
  const config = getSnagConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config?.projectKey) headers["x-snag-key"] = config.projectKey;

  let userToken: string | null = null;
  if (config?.getAuthToken) {
    try {
      userToken = await config.getAuthToken();
    } catch {
      // Anonymous is fine; never block a request on auth plumbing.
    }
  }
  if (userToken) {
    headers.Authorization = `Bearer ${userToken}`;
  }

  const [requester, requesterToken] = await Promise.all([
    resolveRequester(),
    resolveRequesterToken(),
  ]);
  if (requester) {
    headers["x-snag-requester"] = requester;
  }
  if (requesterToken) {
    headers["x-snag-requester-token"] = requesterToken;
  }
  return headers;
}

/**
 * Probe + request list. Returns `{ enabled: false }` on any failure so the
 * overlay simply stays hidden when the relay is off, unreachable, or absent.
 */
export async function fetchRelayState(): Promise<RelayStateResponse> {
  const config = getSnagConfig();
  if (!config) {
    debugLog("probe skipped: not initialized");
    return { enabled: false };
  }
  try {
    const headers = await buildHeaders();
    debugLog("probe", config.endpoint, {
      hasProjectKey: !!config.projectKey,
      hasAuthorization: !!headers.Authorization,
    });
    const response = await fetch(config.endpoint, {
      method: "GET",
      headers,
    });
    const body = (await response.json().catch(() => null)) as
      | RelayStateResponse
      | { error?: string }
      | null;
    debugLog("probe response", response.status, body);
    if (!response.ok) return { enabled: false };
    const relay = body as RelayStateResponse;
    if (!relay.enabled) return { enabled: false };
    if (relay.requests) trackRequestStatuses(relay.requests);
    return relay;
  } catch (error) {
    debugLog("probe error", error);
    return { enabled: false };
  }
}

export async function createSnagRequest(
  body: CreateSnagRequestBody,
): Promise<CreateSnagRequestResponse> {
  const config = getSnagConfig();
  if (!config) throw new Error("Snag is not initialized");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: await buildHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | (CreateSnagRequestResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.id) {
    debugLog("create request failed", response.status, payload);
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload;
}

export async function replyToSnagRequest(
  requestId: string,
  reply: string,
): Promise<ReplySnagRequestResponse> {
  const config = getSnagConfig();
  if (!config) throw new Error("Snag is not initialized");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: await buildHeaders(),
    body: JSON.stringify({ request_id: requestId, reply }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (ReplySnagRequestResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.id) {
    debugLog("reply failed", response.status, payload);
    throw new Error(payload?.error ?? `Reply failed (${response.status})`);
  }
  return payload;
}

export async function confirmSnagRequest(
  body: ConfirmSnagRequestBody,
): Promise<ConfirmSnagRequestResponse> {
  const config = getSnagConfig();
  if (!config) throw new Error("Snag is not initialized");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: await buildHeaders(),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | (ConfirmSnagRequestResponse & { error?: string })
    | null;
  if (!response.ok || !payload?.id) {
    debugLog("confirm failed", response.status, payload);
    throw new Error(payload?.error ?? `Confirmation failed (${response.status})`);
  }
  return payload;
}
