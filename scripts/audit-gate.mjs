#!/usr/bin/env node
// CI audit gate: `npm audit --audit-level=high`, minus advisories we have
// reviewed and accepted. npm has no ignore flag, so this reads
// `npm audit --json` and fails on any high/critical advisory not listed in
// ACCEPTED, or listed but past its review date.
//
// Each entry needs a reason (why it can't reach users) and a `until` date.
// When the date passes the gate fails again, which forces a re-check rather
// than letting an exception live forever.

import { execFileSync } from "node:child_process";

const ACCEPTED = {
  // braces: stack exhaustion on deeply nested glob patterns. No patched
  // release exists (3.0.3 is latest). Reached only through the shadcn CLI
  // (shadcn → fast-glob → micromatch → braces), which runs on a developer's
  // machine with our own patterns; nothing ships in the PWA bundle.
  // npm's suggested "fix" is downgrading shadcn to 1.0.0, which drops
  // shadcn/tailwind.css.
  "GHSA-vfj7-8cjw-p6xm": { until: "2026-12-31", reason: "dev-only shadcn CLI glob; no patched braces" },
};

const BLOCKING = new Set(["high", "critical"]);

let raw;
try {
  raw = execFileSync("npm", ["audit", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);
const today = new Date().toISOString().slice(0, 10);

const failures = [];
const accepted = [];
for (const [pkg, v] of Object.entries(report.vulnerabilities || {})) {
  for (const via of v.via) {
    if (typeof via === "string") continue; // inherited; the root advisory is listed under its own package
    if (!BLOCKING.has(via.severity)) continue;
    const id = (via.url || "").split("/").pop();
    const ok = ACCEPTED[id];
    if (ok && today <= ok.until) accepted.push(`${pkg}: ${id} (accepted until ${ok.until}: ${ok.reason})`);
    else failures.push(`${pkg}: ${via.severity} ${id} ${via.title}${ok ? ` (acceptance expired ${ok.until})` : ""}`);
  }
}

for (const a of accepted) console.log(`accepted  ${a}`);
for (const f of failures) console.log(`BLOCKING  ${f}`);
if (failures.length) {
  console.log(`\n${failures.length} high/critical advisory(ies). Fix, or review and add to ACCEPTED in scripts/audit-gate.mjs.`);
  process.exit(1);
}
console.log("audit gate: no unaccepted high/critical advisories");
