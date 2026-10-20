import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const TRACKED_GHSA = "GHSA-vfj7-8cjw-p6xm";
export const TRACKED_DEV_CHAIN = Object.freeze([
  ["braces", null],
  ["micromatch", "braces"],
  ["fast-glob", "micromatch"],
  ["@next/eslint-plugin-next", "fast-glob"],
  ["eslint-config-next", "@next/eslint-plugin-next"],
]);

const SEVERITIES = Object.freeze(["info", "low", "moderate", "high", "critical"]);
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function readAuditNames(report, label, issues) {
  if (
    !report ||
    typeof report !== "object" ||
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities)
  ) {
    issues.push(label + "_AUDIT_MALFORMED_VULNERABILITIES");
    return [];
  }

  const counts = report.metadata?.vulnerabilities;
  if (!counts || typeof counts !== "object") {
    issues.push(label + "_AUDIT_MISSING_METADATA");
    return [];
  }

  const names = Object.keys(report.vulnerabilities).sort();
  let total = 0;
  for (const severity of SEVERITIES) {
    const count = counts[severity];
    if (!Number.isInteger(count) || count < 0) {
      issues.push(label + "_AUDIT_BAD_COUNT:" + severity);
      return names;
    }
    total += count;
  }
  if (counts.total !== total || total !== names.length) {
    issues.push(label + "_AUDIT_INCONSISTENT_COUNTS");
  }
  for (const name of names) {
    const item = report.vulnerabilities[name];
    if (!item || !SEVERITIES.includes(item.severity) || !Array.isArray(item.via)) {
      issues.push(label + "_AUDIT_MALFORMED_FINDING:" + name);
    }
  }
  return names;
}

export function assessDependencyAudit(production, complete, lockfile) {
  const issues = [];
  const prodNames = readAuditNames(production, "PROD", issues);
  const allNames = readAuditNames(complete, "ALL", issues);

  for (const name of prodNames) {
    issues.push("PRODUCTION_VULNERABILITY:" + name);
    if (!allNames.includes(name)) {
      issues.push("PRODUCTION_FINDING_ABSENT_FROM_FULL_AUDIT:" + name);
    }
  }

  const expected = TRACKED_DEV_CHAIN.map(([name]) => name);
  const present = expected.filter((name) => allNames.includes(name));
  const untracked = allNames.filter((name) => !expected.includes(name));
  for (const name of untracked) {
    issues.push("UNREVIEWED_DEPENDENCY_VULNERABILITY:" + name);
  }

  const tracked = present.length > 0;
  if (tracked) {
    if (present.length !== expected.length) {
      issues.push("TRACKED_DEV_CHAIN_INCOMPLETE");
    }
    for (const [name, dependency] of TRACKED_DEV_CHAIN) {
      const finding = complete?.vulnerabilities?.[name];
      if (!finding) continue;
      const packageInfo = lockfile?.packages?.["node_modules/" + name];
      if (!packageInfo || packageInfo.dev !== true) {
        issues.push("TRACKED_DEV_SCOPE_CHANGED:" + name);
      }
      const remedy = finding.fixAvailable;
      const knownUnsupportedDowngrade = remedy && typeof remedy === "object" &&
        remedy.name === "eslint-config-next" &&
        remedy.version === "14.2.35" &&
        remedy.isSemVerMajor === true;
      if (finding.severity !== "high" || !(remedy === false || knownUnsupportedDowngrade)) {
        issues.push("TRACKED_DEV_ADVISORY_STATUS_CHANGED:" + name);
      }
      if (dependency !== null && (
        finding.via.length !== 1 || finding.via[0] !== dependency
      )) {
        issues.push("TRACKED_DEV_DEPENDENCY_PATH_CHANGED:" + name);
      }
    }
    const leaf = complete?.vulnerabilities?.braces;
    if (lockfile?.packages?.["node_modules/braces"]?.version !== "3.0.3") {
      issues.push("TRACKED_DEV_BRACES_VERSION_CHANGED");
    }
    if (
      !leaf ||
      leaf.via.length !== 1 ||
      typeof leaf.via[0] !== "object" ||
      leaf.via[0] === null ||
      leaf.via[0].url !== "https://github.com/advisories/" + TRACKED_GHSA ||
      leaf.via[0].severity !== "high"
    ) {
      issues.push("TRACKED_DEV_GHSA_IDENTITY_CHANGED");
    }
  }

  return {
    passed: issues.length === 0,
    tracked,
    productionCount: prodNames.length,
    developmentCount: allNames.filter((name) => !prodNames.includes(name)).length,
    issues,
  };
}

function executeAudit(scope) {
  const cli = process.env.npm_execpath;
  if (!cli) {
    throw new Error("NPM_CLI_NOT_AVAILABLE: run through npm run audit:security");
  }
  const flags = scope === "production" ? ["--omit=dev"] : ["--include=dev"];
  const child = spawnSync(
    process.execPath,
    [cli, "audit", "--json", "--audit-level=low", ...flags],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (child.error || child.signal || ![0, 1].includes(child.status)) {
    throw new Error("NPM_AUDIT_EXECUTION_FAILED:" + scope);
  }
  let report;
  try {
    report = JSON.parse(child.stdout);
  } catch {
    throw new Error("NPM_AUDIT_RESPONSE_NOT_JSON:" + scope);
  }
  if (report.error || !report.metadata?.vulnerabilities) {
    throw new Error("NPM_AUDIT_REGISTRY_OR_SCHEMA_ERROR:" + scope);
  }
  return report;
}

function printFindings(scope, report) {
  const entries = Object.entries(report.vulnerabilities).sort(([a], [b]) => a.localeCompare(b));
  const counts = report.metadata.vulnerabilities;
  console.log(
    "AUDIT_" + scope + "_SUMMARY: " +
    SEVERITIES.map((level) => level + "=" + counts[level]).join(" ") +
    " total=" + counts.total,
  );
  for (const [name, finding] of entries) {
    const causes = finding.via.map((item) =>
      typeof item === "string" ? item : String(item.url || item.name || "unknown"),
    );
    console.log(
      "AUDIT_" + scope + "_FINDING: " + name +
      " severity=" + finding.severity +
      " direct=" + Boolean(finding.isDirect) +
      " fixAvailable=" + JSON.stringify(finding.fixAvailable) +
      " via=" + causes.join(","),
    );
  }
}

function main() {
  try {
    const production = executeAudit("production");
    const complete = executeAudit("all");
    const lockfile = JSON.parse(
      readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"),
    );
    printFindings("PRODUCTION", production);
    printFindings("ALL", complete);
    const decision = assessDependencyAudit(production, complete, lockfile);
    if (decision.tracked) {
      console.log(
        "TRACKED_DEV_REVIEW_REQUIRED: " + TRACKED_GHSA +
        " braces@3.0.3; development-only chain; no risk acceptance or merge authorization.",
      );
    } else {
      console.log("TRACKED_DEV_GHSA_NOT_DETECTED: " + TRACKED_GHSA);
    }
    for (const issue of decision.issues) console.error("AUDIT_SECURITY_BLOCKED: " + issue);
    console.log("AUDIT_SECURITY_GATE: " + (decision.passed ? "PASS" : "FAIL"));
    process.exitCode = decision.passed ? 0 : 1;
  } catch (error) {
    console.error("AUDIT_SECURITY_GATE: FAIL");
    console.error(
      "AUDIT_SECURITY_BLOCKED: " +
      (error instanceof Error ? error.message : "UNEXPECTED_AUDIT_ERROR"),
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main();
}
