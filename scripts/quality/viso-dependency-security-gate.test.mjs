import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACKED_DEV_CHAIN,
  TRACKED_GHSA,
  assessDependencyAudit,
} from "./viso-dependency-security-gate.mjs";

const LEVELS = ["info", "low", "moderate", "high", "critical"];

function audit(findings = {}) {
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const finding of Object.values(findings)) counts[finding.severity] += 1;
  return {
    vulnerabilities: findings,
    metadata: {
      vulnerabilities: { ...counts, total: Object.keys(findings).length },
    },
  };
}

function trackedFindings() {
  return Object.fromEntries(TRACKED_DEV_CHAIN.map(([name, dependency]) => [
    name,
    {
      name,
      severity: "high",
      isDirect: name === "eslint-config-next",
      fixAvailable: false,
      via: dependency === null
        ? [{ url: "https://github.com/advisories/" + TRACKED_GHSA, severity: "high" }]
        : [dependency],
    },
  ]));
}

function lockfile() {
  return {
    packages: Object.fromEntries(TRACKED_DEV_CHAIN.map(([name]) => [
      "node_modules/" + name,
      { version: name === "braces" ? "3.0.3" : "1.0.0", dev: true },
    ])),
  };
}

function check(prod = audit(), full = audit(trackedFindings()), lock = lockfile()) {
  return assessDependencyAudit(prod, full, lock);
}

test("SEC-AUD-01 clean production and clean development pass", () => {
  const result = check(audit(), audit());
  assert.equal(result.passed, true);
  assert.equal(result.tracked, false);
  assert.equal(result.productionCount, 0);
  assert.equal(result.developmentCount, 0);
});

test("SEC-AUD-02 exact tracked braces chain remains visible without approving risk", () => {
  const result = check();
  assert.equal(result.passed, true);
  assert.equal(result.tracked, true);
  assert.equal(result.developmentCount, 5);
  assert.deepEqual(result.issues, []);
});

test("SEC-AUD-03 any production vulnerability blocks even when development chain is known", () => {
  const leak = { unexpected: { severity: "low", isDirect: true, fixAvailable: false, via: ["root"] } };
  const all = { ...trackedFindings(), ...leak };
  const result = check(audit(leak), audit(all));
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes("PRODUCTION_VULNERABILITY:unexpected"));
});

test("SEC-AUD-04 new development high vulnerability blocks", () => {
  const all = {
    ...trackedFindings(),
    another: { severity: "high", isDirect: false, fixAvailable: false, via: ["root"] },
  };
  const result = check(audit(), audit(all));
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes("UNREVIEWED_DEPENDENCY_VULNERABILITY:another"));
});

test("SEC-AUD-05 new development low vulnerability is not silently ignored", () => {
  const all = {
    ...trackedFindings(),
    another: { severity: "low", isDirect: false, fixAvailable: false, via: ["root"] },
  };
  assert.equal(check(audit(), audit(all)).passed, false);
});

test("SEC-AUD-06 changed or incomplete tracked chain requires review", () => {
  const all = trackedFindings();
  delete all["fast-glob"];
  const result = check(audit(), audit(all));
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes("TRACKED_DEV_CHAIN_INCOMPLETE"));
});

test("SEC-AUD-07 a changed advisory identity cannot use the tracked baseline", () => {
  const all = trackedFindings();
  all.braces.via[0].url = "https://github.com/advisories/GHSA-0000-0000-0000";
  assert.ok(check(audit(), audit(all)).issues.includes("TRACKED_DEV_GHSA_IDENTITY_CHANGED"));
});

test("SEC-AUD-08 a newly available remediation requires new review", () => {
  const all = trackedFindings();
  all.braces.fixAvailable = true;
  assert.ok(check(audit(), audit(all)).issues.includes("TRACKED_DEV_ADVISORY_STATUS_CHANGED:braces"));
});

test("SEC-AUD-09 known issue moving into production dependency scope blocks", () => {
  const lock = lockfile();
  lock.packages["node_modules/braces"].dev = false;
  assert.ok(check(audit(), audit(trackedFindings()), lock).issues.includes("TRACKED_DEV_SCOPE_CHANGED:braces"));
});

test("SEC-AUD-10 an unreviewed braces version blocks until re-evaluation", () => {
  const lock = lockfile();
  lock.packages["node_modules/braces"].version = "3.0.4";
  assert.ok(check(audit(), audit(trackedFindings()), lock).issues.includes("TRACKED_DEV_BRACES_VERSION_CHANGED"));
});

test("SEC-AUD-11 malformed audit metadata blocks, not passes", () => {
  const malformed = audit();
  malformed.metadata.vulnerabilities.total = 20;
  assert.ok(check(malformed).issues.includes("PROD_AUDIT_INCONSISTENT_COUNTS"));
});

test("SEC-AUD-12 no vulnerability report is not interpreted as clean", () => {
  const result = check({ error: { code: "ECONNREFUSED" } });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes("PROD_AUDIT_MALFORMED_VULNERABILITIES"));
});

test("SEC-AUD-13 additional advisory on the same braces package blocks", () => {
  const all = trackedFindings();
  all.braces.via.push({
    url: "https://github.com/advisories/GHSA-0000-0000-0000",
    severity: "high",
  });
  assert.ok(check(audit(), audit(all)).issues.includes("TRACKED_DEV_GHSA_IDENTITY_CHANGED"));
});

test("SEC-AUD-14 upstream path changes require re-evaluation", () => {
  const all = trackedFindings();
  all.micromatch.via = ["different-package"];
  assert.ok(check(audit(), audit(all)).issues.includes("TRACKED_DEV_DEPENDENCY_PATH_CHANGED:micromatch"));
});

test("SEC-AUD-15 known unsupported Next.js 14 downgrade is reported, not applied", () => {
  const all = trackedFindings();
  for (const entry of Object.values(all)) {
    entry.fixAvailable = { name: "eslint-config-next", version: "14.2.35", isSemVerMajor: true };
  }
  const result = check(audit(), audit(all));
  assert.equal(result.passed, true);
  assert.equal(result.tracked, true);
});

test("SEC-AUD-16 any different remediation forces re-evaluation", () => {
  const all = trackedFindings();
  all.braces.fixAvailable = { name: "eslint-config-next", version: "15.0.0", isSemVerMajor: true };
  assert.ok(check(audit(), audit(all)).issues.includes("TRACKED_DEV_ADVISORY_STATUS_CHANGED:braces"));
});
