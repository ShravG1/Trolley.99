// Edge Function: quick-add ("add via Siri", §22)
//
// SECURITY: unlike every other function here, the caller has no Supabase JWT
// at all — an iOS Shortcut can't hold a signed-in session. The credential is
// the per-member quick-add token itself (Bearer header), minted once in
// Settings and verified by its hash inside quick_add_item() (migration 0019).
// This function never touches RLS-gated tables directly and never sees the
// caller's plaintext token again after forwarding it to the RPC — it has no
// way to resolve WHICH group/member a token belongs to on its own, only
// quick_add_item (SECURITY DEFINER, service_role-only) can.
//
// Runs on Deno (Supabase Edge runtime).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// Crude per-token rate cap (mirrors send-push's per-group cap, §5.6) — blunts a
// stuck/looping Shortcut, not a security boundary. In-memory; resets on cold
// start, which is fine for its purpose.
const lastCall = new Map<string, number>();
const MIN_GAP_MS = 1500;

interface Body {
  name?: string;
  quantity?: number;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ error: 'no_token' }, 401);

  const gate = lastCall.get(token) ?? 0;
  if (Date.now() - gate < MIN_GAP_MS) return json({ error: 'too_fast' }, 429);
  lastCall.set(token, Date.now());

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const name = typeof body?.name === 'string' ? body.name.slice(0, 80) : '';
  if (!name.trim()) return json({ error: 'missing_name' }, 400);
  const quantity = Number.isFinite(body?.quantity)
    ? Math.max(1, Math.min(999, Math.trunc(body!.quantity!)))
    : 1;

  const { data, error } = await admin.rpc('quick_add_item', {
    p_token: token,
    p_name: name,
    p_quantity: quantity,
  });

  if (error) {
    // quick_add_item raises these three specific exceptions (0019) — map them
    // to a status code without leaking anything else about the error.
    const msg = String(error.message ?? '');
    if (msg.includes('invalid_token')) return json({ error: 'invalid_token' }, 401);
    if (msg.includes('shop_in_progress')) {
      return json({ error: 'shop_in_progress', message: "A shop's in progress — try again once it's finished." }, 409);
    }
    if (msg.includes('invalid_name')) return json({ error: 'invalid_name' }, 400);
    return json({ error: 'add_failed' }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return json({
    ok: true,
    item: row?.item_name ?? name,
    group: row?.group_name ?? 'Trolley',
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
