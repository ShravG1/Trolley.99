#!/usr/bin/env node
// The CI policy gate (CONTRACT §8/§10).
//
// Fails an ENGINE-AUTHORED pull request that touches the hard-excluded paths
// (secrets, auth, CI/deploy config, schema/migrations, the policy manifest) or
// any financial repo. That red status is the enforcement behind the autonomy
// model: Hustler only ever `gh pr merge`s on green, so a protected-path change it
// somehow classified as auto-mergeable can never actually land — and Shrav sees a
// clear red telling him to review it by hand.
//
// It deliberately does NOT fail a HUMAN-authored PR (a branch that isn't on the
// engine's `autopilot/` or `claude/` prefix). Shrav touching auth on his own
// branch is the reviewer, not a policy breach — gating that would just be friction.
//
// The financial/live/tier DATA is single-sourced from repos.policy.json (imported
// below). The protected-path + financial regexes are kept BYTE-IDENTICAL to
// lib/policy.ts on purpose; that module is the canonical classifier and names this
// script as its CI consumer. If you change one, change the other. (They're
// duplicated rather than shared only to keep CI dependency-free — the repo runs on
// three runtime deps and the gate must run under plain `node` with no loader.)

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// ---- shared data (single source of truth, optional) ------------------------
// repos.policy.json carries per-repo overrides (financial=true, maxTier=C). It's
// OPTIONAL: a repo without one (most of the fleet) just gets the default posture,
// and the protected-path + financial-by-name rules below still apply. That's what
// makes this one gate file portable to every repo unchanged.
let manifest = { default: {}, repos: {} };
try {
  manifest = JSON.parse(readFileSync(new URL("../repos.policy.json", import.meta.url)));
} catch {
  /* no manifest in this repo — default posture */
}
const repoPolicy = (name) => ({ ...manifest.default, ...(manifest.repos?.[name] ?? {}) });

// ---- mirror of lib/policy.ts (keep in sync) --------------------------------
const FINANCIAL_RE = /ledger|reseller|\btax\b|invoice|payroll|\bvat\b/i;
const SENSITIVE_PATH_RES = [
  /(^|\/)\.env(\.|$)/i, // env files
  /(^|\/)\.github\/workflows\//i, // CI / automation
  /(^|\/)CODEOWNERS$/i,
  /secret|credential|token|apikey|api-key/i, // anything secret-shaped
  /(^|\/)middleware\.[mc]?[tj]sx?$/i, // request middleware
  /auth/i, // auth code/config
  /(^|\/)(vercel|next)\.config\.[mc]?[jt]s$/i, // deploy / build config
  /(^|\/)vercel\.(json|ts)$/i,
  /(^|\/)migrations?\//i, // db migrations
  /\.sql$/i, // schema
  /\.policy\.json$/i, // the policy manifest itself
];

const isFinancialRepo = (repo) => {
  const name = repo.includes("/") ? repo.split("/")[1] : repo;
  return FINANCIAL_RE.test(name) || repoPolicy(name).financial === true;
};
const touchesProtected = (paths) => paths.filter((p) => SENSITIVE_PATH_RES.some((re) => re.test(p)));

// ---- inputs (CI passes these; locals fall back to git) ---------------------
const ENGINE_PREFIXES = ["autopilot/", "claude/"];
const headRef = process.env.HEAD_REF || execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
const repo = process.env.REPO_NAME || "dev-os";

let changed;
if (process.env.CHANGED_FILES) {
  changed = process.env.CHANGED_FILES.split("\n").map((s) => s.trim()).filter(Boolean);
} else {
  const base = process.env.BASE_REF || "main";
  changed = execSync(`git diff --name-only origin/${base}...HEAD`).toString().split("\n").map((s) => s.trim()).filter(Boolean);
}

// ---- the gate --------------------------------------------------------------
const engineAuthored = ENGINE_PREFIXES.some((p) => headRef.startsWith(p));
if (!engineAuthored) {
  console.log(`policy-gate: '${headRef}' is not an engine branch (${ENGINE_PREFIXES.join(", ")}) — human-authored, skipping.`);
  process.exit(0);
}

const violations = [];
if (isFinancialRepo(repo)) violations.push(`financial repo '${repo}' — review-only, always Tier C (CONTRACT §8/§10)`);
const protectedHits = touchesProtected(changed);
if (protectedHits.length) violations.push(`touches protected path(s): ${protectedHits.join(", ")}`);

if (violations.length) {
  console.error(`\n❌ policy-gate FAILED for engine PR on '${repo}' (branch ${headRef}):`);
  for (const v of violations) console.error(`   • ${v}`);
  console.error(`\nAn autonomous engine may not land this. Shrav reviews and merges it by hand.\n`);
  process.exit(1);
}

console.log(`✅ policy-gate passed: engine PR on '${repo}' touches no protected or financial paths (${changed.length} files checked).`);
