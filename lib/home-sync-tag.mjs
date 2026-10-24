// Viewer and minute are included so scheduled reveals invalidate old polls.
export async function homeSyncTag(revision, photos, viewer, now = Date.now()) {
  const input = JSON.stringify([revision, photos, viewer, Math.floor(now / 60000)]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
