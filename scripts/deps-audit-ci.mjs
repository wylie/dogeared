#!/usr/bin/env node
import { execSync } from "node:child_process";

const ALLOWLIST = new Set([
  "GHSA-9wv6-86v2-598j"
]);

function runAuditJson() {
  try {
    return execSync("npm audit --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stdout = String(error?.stdout || "");
    if (stdout.trim()) return stdout;
    throw error;
  }
}

function extractAdvisoryIds(vulnerabilities = {}) {
  const results = [];
  for (const [name, vuln] of Object.entries(vulnerabilities)) {
    const severity = String(vuln?.severity || "info");
    const via = Array.isArray(vuln?.via) ? vuln.via : [];
    const advisoryIds = via
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const url = String(entry.url || "");
        const match = url.match(/GHSA-[a-z0-9-]+/i);
        return match ? match[0] : "";
      })
      .filter(Boolean);
    results.push({ name, severity, advisoryIds });
  }
  return results;
}

const raw = runAuditJson();
const report = JSON.parse(raw || "{}");
const vulnerabilities = report?.vulnerabilities || {};
const findings = extractAdvisoryIds(vulnerabilities);

const blocking = findings.filter((finding) => {
  const sev = finding.severity;
  if (sev !== "high" && sev !== "critical") return false;
  if (finding.advisoryIds.length === 0) return true;
  return finding.advisoryIds.some((id) => !ALLOWLIST.has(id));
});

if (blocking.length > 0) {
  console.error("Dependency audit failed with blocking high/critical vulnerabilities:");
  for (const finding of blocking) {
    const ids = finding.advisoryIds.length ? finding.advisoryIds.join(", ") : "(no advisory id)";
    console.error(`- ${finding.name} [${finding.severity}] ${ids}`);
  }
  process.exit(1);
}

const allowedActive = findings
  .filter((finding) => finding.advisoryIds.some((id) => ALLOWLIST.has(id)))
  .flatMap((finding) => finding.advisoryIds.filter((id) => ALLOWLIST.has(id)));

if (allowedActive.length > 0) {
  const unique = Array.from(new Set(allowedActive));
  console.log(`Audit passed with allowlisted advisories: ${unique.join(", ")}`);
} else {
  console.log("Audit passed with no blocking high/critical vulnerabilities.");
}
