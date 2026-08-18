import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const FORMAT = "afterplay.versioned-json";
const DEFAULT_RETRY_DELAY_MS = 10;

type PersistenceErrorCode =
  | "corrupt_json"
  | "invalid_data"
  | "invalid_envelope"
  | "read_failed"
  | "schema_mismatch"
  | "unsupported_version"
  | "write_failed";

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly path: string;

  constructor(code: PersistenceErrorCode, path: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "PersistenceError";
    this.code = code;
    this.path = path;
  }
}

export type VersionedJsonSchema<T> = Readonly<{
  name: string;
  version: number;
  accepts: (value: unknown) => value is T;
  acceptLegacy?: boolean;
}>;

type Envelope = Readonly<{
  _afterplay: Readonly<{
    format: typeof FORMAT;
    schema: string;
    version: number;
  }>;
  value: unknown;
}>;

export type PersistenceRuntime = Readonly<{
  rename: (source: string, destination: string) => void;
  pause: (milliseconds: number) => void;
  tempId: () => string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value) || !("_afterplay" in value)) return false;
  const metadata = value._afterplay;
  return (
    isRecord(metadata) &&
    metadata.format === FORMAT &&
    typeof metadata.schema === "string" &&
    Number.isInteger(metadata.version) &&
    "value" in value
  );
}

function hasEnvelopeMarker(value: unknown): boolean {
  return isRecord(value) && "_afterplay" in value;
}

function isNodeError(error: unknown, codes: readonly string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

function pause(milliseconds: number): void {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

const defaultRuntime: PersistenceRuntime = {
  rename: renameSync,
  pause,
  tempId: () => `${process.pid}-${Date.now()}-${randomUUID()}`,
};

function assertSchema<T>(schema: VersionedJsonSchema<T>): void {
  if (!schema.name.trim()) throw new TypeError("Persistence schema names must not be blank.");
  if (!Number.isInteger(schema.version) || schema.version < 1) {
    throw new TypeError("Persistence schema versions must be positive integers.");
  }
}

function validate<T>(path: string, schema: VersionedJsonSchema<T>, value: unknown): T {
  if (!schema.accepts(value)) {
    throw new PersistenceError(
      "invalid_data",
      path,
      `Persisted ${schema.name} data at ${path} failed validation.`,
    );
  }
  return value;
}

export function createVersionedJsonPersistence(runtimeOverrides: Partial<PersistenceRuntime> = {}) {
  const runtime: PersistenceRuntime = { ...defaultRuntime, ...runtimeOverrides };

  function read<T>(path: string, schema: VersionedJsonSchema<T>): T | null {
    assertSchema(schema);

    let contents: string;
    try {
      contents = readFileSync(path, "utf-8");
    } catch (error) {
      if (isNodeError(error, ["ENOENT"])) return null;
      throw new PersistenceError("read_failed", path, `Could not read persisted data at ${path}.`, error);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(contents) as unknown;
    } catch (error) {
      throw new PersistenceError("corrupt_json", path, `Persisted data at ${path} is not valid JSON.`, error);
    }

    if (!isEnvelope(decoded)) {
      if (hasEnvelopeMarker(decoded)) {
        throw new PersistenceError(
          "invalid_envelope",
          path,
          `Persisted data at ${path} has an invalid Afterplay envelope.`,
        );
      }
      if (schema.acceptLegacy) return validate(path, schema, decoded);
      throw new PersistenceError(
        "invalid_envelope",
        path,
        `Persisted data at ${path} is missing its Afterplay envelope.`,
      );
    }

    if (decoded._afterplay.schema !== schema.name) {
      throw new PersistenceError(
        "schema_mismatch",
        path,
        `Expected ${schema.name} data at ${path}, found ${decoded._afterplay.schema}.`,
      );
    }
    if (decoded._afterplay.version !== schema.version) {
      throw new PersistenceError(
        "unsupported_version",
        path,
        `Unsupported ${schema.name} version ${decoded._afterplay.version} at ${path}; expected ${schema.version}.`,
      );
    }
    return validate(path, schema, decoded.value);
  }

  function write<T>(path: string, schema: VersionedJsonSchema<T>, value: T): void {
    assertSchema(schema);
    validate(path, schema, value);
    mkdirSync(dirname(path), { recursive: true });

    const envelope: Envelope = {
      _afterplay: { format: FORMAT, schema: schema.name, version: schema.version },
      value,
    };
    const temporaryPath = join(dirname(path), `.${basename(path)}.${runtime.tempId()}.tmp`);

    try {
      writeFileSync(temporaryPath, JSON.stringify(envelope, null, 2), "utf-8");
      try {
        runtime.rename(temporaryPath, path);
      } catch (error) {
        if (!isNodeError(error, ["EPERM", "EBUSY"])) throw error;
        runtime.pause(DEFAULT_RETRY_DELAY_MS);
        runtime.rename(temporaryPath, path);
      }
    } catch (error) {
      try {
        unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (!isNodeError(cleanupError, ["ENOENT"])) {
          throw new PersistenceError(
            "write_failed",
            path,
            `Could not clean up the failed temporary write for ${path}.`,
            new AggregateError([error, cleanupError]),
          );
        }
      }
      throw new PersistenceError("write_failed", path, `Could not atomically persist data at ${path}.`, error);
    }
  }

  return { read, write } as const;
}

const persistence = createVersionedJsonPersistence();

export const readVersionedJson = persistence.read;
export const writeVersionedJson = persistence.write;
