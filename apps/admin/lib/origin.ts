import { createPrivateKey, sign } from "node:crypto";
import { forgeHostFromRepoUrl } from "@snag/shared";

const ORIGIN_API = "https://api.cursor.com/v1/origin";

const ORIGIN_DELIVERY_SCOPES = [
  "repository:contents:read",
  "repository:contents:write",
  "repository:pull_requests:read",
  "repository:pull_requests:write",
  "repository:checks:read",
];

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function signOriginAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "EdDSA", kid: appId, typ: "JWT" })));
  const payload = base64url(
    Buffer.from(JSON.stringify({
      iss: appId,
      aud: "origin-apps",
      iat: now,
      exp: now + 5 * 60,
    })),
  );
  const input = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(input), createPrivateKey(privateKeyPem));
  return `${input}.${base64url(signature)}`;
}

async function mintInstallationToken(input: {
  appId: string;
  installationId: string;
  privateKeyPem: string;
}): Promise<{ token: string } | { error: string } | null> {
  let jwt: string;
  try {
    jwt = signOriginAppJwt(input.appId, input.privateKeyPem);
  } catch {
    return {
      error:
        "Origin could not use that private key. Paste the PKCS#8 PEM from openssl genpkey -algorithm ED25519.",
    };
  }

  try {
    const res = await fetch(
      `${ORIGIN_API}/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scopes: ORIGIN_DELIVERY_SCOPES }),
        cache: "no-store",
      },
    );
    if (res.status === 401) return { error: "Origin rejected the app key." };
    if (res.status === 403 || res.status === 404) {
      return {
        error:
          "Origin could not mint a token for that installation. Check the app id, installation id, and that the installation grants contents, pull requests, and checks.",
      };
    }
    if (!res.ok) return { error: "Origin could not mint an installation token." };
    const body = (await res.json().catch(() => null)) as { token?: string } | null;
    if (!body?.token) return { error: "Origin did not return an installation token." };
    return { token: body.token };
  } catch {
    return null;
  }
}

/**
 * Confirms the Origin app can see the project repository before the key is stored.
 * Returns null when Origin is unreachable so a transient outage does not block a save.
 */
export async function verifyOriginAppAccess(input: {
  appId: string;
  installationId: string;
  privateKeyPem: string;
  repoUrl: string;
}): Promise<string | null> {
  if (forgeHostFromRepoUrl(input.repoUrl) !== "origin") {
    return "The project repository URL is not a Cursor Origin repository.";
  }
  const match = input.repoUrl.trim().match(
    /^https:\/\/(?:origin\.cursor\.com|cursor\.com\/codebase)\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
  );
  if (!match) return "The project repository URL is not a Cursor Origin repository.";

  const minted = await mintInstallationToken(input);
  if (!minted) return null;
  if ("error" in minted) return minted.error;

  try {
    const res = await fetch(
      `${ORIGIN_API}/repos/${match[1]}/${match[2]}`,
      {
        headers: { Authorization: `Bearer ${minted.token}` },
        cache: "no-store",
      },
    );
    if (res.status === 401) return "Origin rejected the installation token.";
    if (res.status === 403 || res.status === 404) {
      return `The Origin app cannot access ${match[1]}/${match[2]}. Install it on that repository.`;
    }
    return null;
  } catch {
    return null;
  }
}
