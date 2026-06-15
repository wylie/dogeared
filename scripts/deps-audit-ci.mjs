#!/usr/bin/env node
import { execSync } from "node:child_process";

function runAuditJson() {
  try {
    return execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stdout = String(error?.stdout || "");
    if (stdout.trim()) return stdout;
    throw error;
  }
}

function extractFindings(vulnerabilities = {}) {
  const results = [];
  for (const [name, vuln] of Object.entries(vulnerabilities)) {
    const severity = String(vuln?.severity || "info");
    const via = Array.isArray(vuln?.via) ? vuln.via : [];
    const advisories = via
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const url = String(entry.url || "");
        const match = url.match(/GHSA-[a-z0-9-]+/i);
        return {
          id: match ? match[0] : "unknown advisory",
          title: String(entry.title || "").trim()
        };
      })
      .filter((entry) => entry.id || entry.title);
    results.push({ name, severity, advisories });
  }
  return results;
}

const raw = runAuditJson();
const report = JSON.parse(raw || "{}");
if (report?.error || report?.auditReportVersion !== 2 || !report?.metadata?.vulnerabilities) {
  const detail = String(report?.message || report?.error?.summary || "npm audit returned an invalid report").trim();
  console.error(`Production dependency audit could not be completed: ${detail}`);
  process.exit(1);
}
const vulnerabilities = report?.vulnerabilities || {};
const findings = extractFindings(vulnerabilities);

const blocking = findings.filter((finding) => {
  const sev = finding.severity;
  if (sev !== "high" && sev !== "critical") return false;
  return sev === "high" || sev === "critical";
});

if (blocking.length > 0) {
  console.error("Dependency audit failed with blocking high/critical vulnerabilities:");
  for (const finding of blocking) {
    const details = finding.advisories.length
      ? finding.advisories.map((advisory) => `${advisory.id}${advisory.title ? `: ${advisory.title}` : ""}`).join("; ")
      : "transitive vulnerability (see npm audit --omit=dev)";
    console.error(`- ${finding.name} [${finding.severity}] ${details}`);
  }
  process.exit(1);
}
console.log("Production dependency audit passed with no high or critical vulnerabilities.");
