// Edge Function: send-push (§2.10, §5.4, §5.6, §9)
//
// SECURITY (§5.4): verify the caller's JWT, confirm they're a member of the
// target group, and ONLY THEN use service_role to read that group's
// subscriptions and send. A caller must never push to a group they're not in,
// and groupId in the body is never trusted on its own.
//
// service_role and the VAPID PRIVATE key live ONLY in this function's env —
// never in the client (§5.4, §15).
//
// Runs on Deno (Supabase Edge runtime).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@trolley.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// crude per-group push rate cap (§5.6) — in-memory; back with a table/Redis for
// multi-instance correctness.
const lastSent = new Map<string, number>();
const MIN_GAP_MS = 4000;

interface Payload {
  groupId: string;
  kind: 'urgent' | 'count';
  item?: string;
  count?: number;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no_auth' }, 401);

  // 1) Verify the caller's JWT by resolving their user with the anon-scoped client.
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asUser.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: 'invalid_jwt' }, 401);

  const body = (await req.json()) as Payload;
  if (!body.groupId) return json({ error: 'bad_request' }, 400);

  // 2) Confirm membership BEFORE touching service_role (never trust groupId).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: membership } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', body.groupId)
    .eq('user_id', caller.id)
    .maybeSingle();
  if (!membership) return json({ error: 'not_a_member' }, 403);

  // rate cap
  const now = Date.now();
  if (now - (lastSent.get(body.groupId) ?? 0) < MIN_GAP_MS && body.kind !== 'urgent') {
    return json({ ok: true, skipped: 'rate_limited' });
  }
  lastSent.set(body.groupId, now);

  // 3) Read the group's subscriptions — EXCLUDING the person who triggered it
  //    (the adder is never notified, §2.10).
  const { data: members } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', body.groupId)
    .neq('user_id', caller.id);
  const userIds = (members ?? []).map((m: any) => m.user_id);
  if (userIds.length === 0) return json({ ok: true, recipients: 0 }); // solo group (§12)

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, keys')
    .in('user_id', userIds);

  const title = 'Trolley';
  const message =
    body.kind === 'urgent'
      ? `Urgent: ${body.item} added to the list.`
      : `${body.count ?? 1} new items on the list.`;

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify({ title, body: message })
        );
        sent++;
      } catch (err: any) {
        // Dead-subscription cleanup (§9): 404/410 Gone → delete the endpoint.
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint);
      }
    })
  );
  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead);
  }

  return json({ ok: true, sent, cleaned: dead.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
