import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createVersionedJsonPersistence,
  PersistenceError,
  readVersionedJson,
  writeVersionedJson,
  type VersionedJsonSchema,
} from "@/domain/persist-core";

type Example = { id: string; count: number };

const schema: VersionedJsonSchema<Example> = {
  name: "test.example",
  version: 1,
  acceptLegacy: true,
  accepts: (value): value is Example =>
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "count" in value &&
    typeof value.count === "number",
};

let root: string;

test.beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "afterplay-persistence-"));
});

test.afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("distinguishes a missing file from corrupt persisted data", () => {
  const missing = join(root, "missing.json");
  expect(readVersionedJson(missing, schema)).toBeNull();

  const corrupt = join(root, "corrupt.json");
  writeFileSync(corrupt, "{not-json", "utf-8");
  expect(() => readVersionedJson(corrupt, schema)).toThrow(PersistenceError);

  try {
    readVersionedJson(corrupt, schema);
  } catch (error) {
    expect(error).toMatchObject({ code: "corrupt_json", path: corrupt });
  }
});

test("round-trips a versioned envelope and accepts existing legacy JSON", () => {
  const versioned = join(root, "versioned.json");
  writeVersionedJson(versioned, schema, { id: "new", count: 2 });

  expect(readVersionedJson(versioned, schema)).toEqual({ id: "new", count: 2 });
  expect(JSON.parse(readFileSync(versioned, "utf-8"))).toMatchObject({
    _afterplay: {
      format: "afterplay.versioned-json",
      schema: "test.example",
      version: 1,
    },
    value: { id: "new", count: 2 },
  });

  const legacy = join(root, "legacy.json");
  writeFileSync(legacy, JSON.stringify({ id: "legacy", count: 1 }), "utf-8");
  expect(readVersionedJson(legacy, schema)).toEqual({ id: "legacy", count: 1 });
});

test("rejects malformed envelopes, wrong schemas, unsupported versions, and invalid values", () => {
  const path = join(root, "invalid.json");
  const cases = [
    [{ _afterplay: { format: "wrong", schema: schema.name, version: 1 }, value: {} }, "invalid_envelope"],
    [
      {
        _afterplay: { format: "afterplay.versioned-json", schema: "other.schema", version: 1 },
        value: { id: "ok", count: 1 },
      },
      "schema_mismatch",
    ],
    [
      {
        _afterplay: { format: "afterplay.versioned-json", schema: schema.name, version: 2 },
        value: { id: "ok", count: 1 },
      },
      "unsupported_version",
    ],
    [
      {
        _afterplay: { format: "afterplay.versioned-json", schema: schema.name, version: 1 },
        value: { id: 3, count: "bad" },
      },
      "invalid_data",
    ],
  ] as const;

  for (const [value, code] of cases) {
    writeFileSync(path, JSON.stringify(value), "utf-8");
    try {
      readVersionedJson(path, schema);
      throw new Error(`Expected ${code}.`);
    } catch (error) {
      expect(error).toMatchObject({ code, path });
    }
  }
});

test("uses a distinct temporary file for a re-entrant same-process write", () => {
  const path = join(root, "reentrant.json");
  const temporaryPaths: string[] = [];
  let nested = false;
  const persistence: ReturnType<typeof createVersionedJsonPersistence> =
    createVersionedJsonPersistence({
      rename: (source, destination) => {
        temporaryPaths.push(source);
        if (!nested) {
          nested = true;
          persistence.write(path, schema, { id: "nested", count: 2 });
        }
        renameSync(source, destination);
      },
    });

  persistence.write(path, schema, { id: "outer", count: 1 });

  expect(new Set(temporaryPaths).size).toBe(2);
  expect(persistence.read(path, schema)).toEqual({ id: "outer", count: 1 });
});

test("retries a transient EPERM rename and does not retry unrelated failures", () => {
  const path = join(root, "retry.json");
  const pauses: number[] = [];
  let attempts = 0;
  const persistence = createVersionedJsonPersistence({
    pause: (milliseconds) => pauses.push(milliseconds),
    rename: (source, destination) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("busy"), { code: "EPERM" });
      renameSync(source, destination);
    },
  });

  persistence.write(path, schema, { id: "retried", count: 1 });
  expect(attempts).toBe(2);
  expect(pauses).toEqual([10]);
  expect(persistence.read(path, schema)).toEqual({ id: "retried", count: 1 });

  let deniedAttempts = 0;
  const denied = createVersionedJsonPersistence({
    rename: () => {
      deniedAttempts += 1;
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    },
  });
  expect(() => denied.write(join(root, "denied.json"), schema, { id: "no", count: 0 })).toThrow(
    PersistenceError,
  );
  expect(deniedAttempts).toBe(1);
});
