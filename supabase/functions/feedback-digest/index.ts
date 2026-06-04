// Edge Function: feedback-digest (§9)
//
// Scheduled daily (pg_cron). Reads feedback rows not yet pushed and opens a
// labelled GitHub issue for each — so the owner's Hub (which watches the repo)
// surfaces them as feedback. Marks each row pushed so it's only filed once.
//
// Secrets (set via `supabase secrets set`, never in the client):
//   GITHUB_PAT  — fine-grained PAT with Issues:write on the target repo
//   GITHUB_REPO — "owner/repo" to open issues in (e.g. "ShravG1/Trolley.99")
// Runs with service_role (auto-injected) to read feedback + mark it pushed.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
const PAT = Deno.env.get('GITHUB_PAT');
const REPO = Deno.env.get('GITHUB_REPO'); // owner/repo

Deno.serve(async () => {
  if (!PAT || !REPO) {
    return json({ ok: false, error: 'github_not_configured' }, 200);
  }

  const { data: rows } = await admin
    .from('feedback')
    .select('id, kind, message, user_agent, created_at, group_id, screenshot_path')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (!rows || rows.length === 0) return json({ ok: true, filed: 0 });

  let filed = 0;
  const failed: string[] = [];
  for (const r of rows as any[]) {
    const kind = r.kind === 'bug' ? 'bug' : r.kind === 'error' ? 'error' : 'feedback';
    const meta = {
      bug: { word: 'bug', emoji: '🐞 Bug report', labels: ['feedback', 'bug'] },
      error: { word: 'error', emoji: '💥 Auto-captured error', labels: ['bug', 'error'] },
      feedback: { word: 'feedback', emoji: '💡 Feedback', labels: ['feedback', 'idea'] },
    }[kind];
    const title = `[Trolley ${meta.word}] ${firstLine(r.message)}`;

    // Sign a long-lived URL for any attached screenshot (private bucket).
    let shotLine: string | null = null;
    if (r.screenshot_path) {
      const { data: signed } = await admin.storage
        .from('feedback')
        .createSignedUrl(r.screenshot_path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) shotLine = `\n**Screenshot:** ${signed.signedUrl}\n\n![screenshot](${signed.signedUrl})`;
    }

    const body = [
      `**${meta.emoji}** from the Trolley app`,
      '',
      r.message,
      shotLine,
      '',
      '---',
      `- Submitted: ${r.created_at}`,
      r.group_id ? `- Group: \`${r.group_id}\`` : null,
      r.user_agent ? `- Device: ${r.user_agent}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'trolley-feedback-digest',
      },
      body: JSON.stringify({ title, body, labels: meta.labels }),
    });

    if (res.ok) {
      await admin.from('feedback').update({ pushed_at: new Date().toISOString() }).eq('id', r.id);
      filed++;
    } else {
      failed.push(`${r.id}:${res.status}`);
    }
  }

  return json({ ok: failed.length === 0, filed, failed });
});

function firstLine(s: string): string {
  const line = (s.split('\n')[0] ?? '').trim();
  return line.length > 70 ? line.slice(0, 67) + '…' : line || 'No summary';
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
