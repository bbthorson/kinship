/**
 * The page a browser sees when it opens an invite link (PRD Journey A, the
 * non-Kinship recipient). It decrypts the sealed vCard in the browser with the
 * key from the URL fragment; the broker only ever serves ciphertext.
 *
 * Not yet here: the issuer's public base card (app.kinship.card.profile),
 * fetched from their PDS, and an "open in the app" link.
 */
export function fallbackPage(opts: { live: boolean; allowVcfFallback: boolean; nonce: string }): string {
  const body = !opts.live
    ? '<p>This invite has expired or been used.</p>'
    : opts.allowVcfFallback
      ? '<p>Someone shared their contact details with you.</p><button id="save" type="button">Save contact</button><p id="msg" role="status"></p>'
      : '<p>Open this link in the app to connect.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Contact invite</title>
<style>
:root{--bg:#fff;--fg:#111;--accent:#2b59c3}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--accent:#8fb0ff}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px}
button{font:inherit;padding:.6rem 1.2rem;border:0;border-radius:.5rem;background:var(--accent);color:var(--bg)}
</style></head><body><main>${body}</main>
<script nonce="${opts.nonce}">
(() => {
  const btn = document.getElementById('save');
  if (!btn) return;
  const msg = document.getElementById('msg');
  const key = new URLSearchParams(location.hash.slice(1)).get('k');
  const b = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  if (!key) { btn.disabled = true; msg.textContent = 'This link is missing its key.'; return; }
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const res = await fetch(location.pathname + '/vcf', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error.message);
      const k = await crypto.subtle.importKey('raw', b(key), 'AES-GCM', false, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(json.data.iv) }, k, b(json.data.ciphertext));
      const url = URL.createObjectURL(new Blob([plain], { type: 'text/vcard' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'contact.vcf' });
      a.click();
      msg.textContent = 'Saved. This link will not work again.';
    } catch (e) {
      msg.textContent = 'Could not open this contact: ' + e.message;
    }
  });
})();
</script></body></html>`;
}
