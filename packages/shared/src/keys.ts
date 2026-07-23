export function generatePublishableKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `snag_pk_${token}`;
}
