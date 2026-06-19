import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canImportTransition,
  isImportInProgress,
  deriveValidationStatus,
} from "./status.ts";

test("canImportTransition: follows the import order", () => {
  assert.equal(canImportTransition("uploaded", "parsing"), true);
  assert.equal(canImportTransition("parsing", "parsed"), true);
  assert.equal(canImportTransition("parsed", "imported"), true);
  assert.equal(canImportTransition("parsing", "failed"), true);
  assert.equal(canImportTransition("failed", "parsing"), true); // retry
  // not allowed
  assert.equal(canImportTransition("uploaded", "imported"), false);
  assert.equal(canImportTransition("imported", "parsing"), false);
});

test("isImportInProgress: terminal states are not in progress", () => {
  assert.equal(isImportInProgress("uploaded"), true);
  assert.equal(isImportInProgress("parsing"), true);
  assert.equal(isImportInProgress("imported"), false);
  assert.equal(isImportInProgress("failed"), false);
});

test("deriveValidationStatus: error > warning > passed", () => {
  assert.equal(deriveValidationStatus([]), "passed");
  assert.equal(deriveValidationStatus([{ severity: "info" }]), "passed");
  assert.equal(deriveValidationStatus([{ severity: "warning" }]), "warnings");
  assert.equal(
    deriveValidationStatus([{ severity: "warning" }, { severity: "error" }]),
    "failed",
  );
});
