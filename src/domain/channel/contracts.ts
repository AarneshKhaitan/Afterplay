import { z } from "zod";

export const CREATOR_ID_PATTERN = /^[a-z0-9_]{1,60}$/;
export const JOB_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

const finiteNumber = z.number().finite();

const channelVideoSchema = z.object({
  video_id: z.string().regex(VIDEO_ID_PATTERN),
  title: z.string(),
  duration: finiteNumber.nullable(),
  duration_label: z.string(),
  view_count: z.number().int().nonnegative().nullable(),
  url: z.string(),
}).strict();

const channelListingSchema = z.object({
  channel_id: z.string(),
  name: z.string(),
  handle: z.string(),
  url: z.string(),
  requested: z.number().int().positive(),
  returned: z.number().int().nonnegative(),
  elapsed: finiteNumber.nonnegative(),
  videos: z.array(channelVideoSchema).min(1),
}).strict();

export const channelPreviewSchema = z.object({
  schema: z.literal("afterplay.channel-backfill-report"),
  version: z.literal(1),
  mode: z.literal("preview"),
  creator_id: z.string().regex(CREATOR_ID_PATTERN),
  listing: channelListingSchema,
}).strict().superRefine((preview, context) => {
  if (preview.listing.returned !== preview.listing.videos.length) {
    context.addIssue({
      code: "custom",
      message: "The listing returned count does not match its videos.",
      path: ["listing", "returned"],
    });
  }
});

const pythonVideoResultSchema = z.object({
  video_id: z.string().regex(VIDEO_ID_PATTERN),
  url: z.string(),
  state: z.enum(["complete", "failed"]),
  sections_read: z.number().int().nonnegative(),
  sections_total: z.number().int().nonnegative(),
  sections_failed: z.number().int().nonnegative(),
  threads_suggested: z.number().int().nonnegative(),
  threads_added: z.number().int().nonnegative(),
  error: z.string().nullable(),
  citations_repaired: z.number().int().nonnegative().optional(),
  citations_rejected: z.number().int().nonnegative().optional(),
  transcript_language: z.string().nullable().optional(),
  transcript_source: z.string().nullable().optional(),
  subtitle_track: z.string().nullable().optional(),
}).strict();

export const pythonBackfillReportSchema = z.object({
  schema: z.literal("afterplay.channel-backfill-report"),
  version: z.literal(1),
  mode: z.literal("run"),
  job_id: z.string().regex(JOB_ID_PATTERN),
  creator_id: z.string().regex(CREATOR_ID_PATTERN),
  channel: z.string(),
  footage_rights: z.enum([
    "project_owned", "creator_owned", "permission_granted", "licensed", "not_cleared",
  ]),
  captions_only: z.literal(true),
  asr_used: z.literal(false),
  workers: z.number().int().min(1).max(16),
  state: z.enum(["complete", "partial", "failed"]),
  progress: z.object({
    done: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }).strict(),
  videos_succeeded: z.number().int().nonnegative(),
  videos_failed: z.number().int().nonnegative(),
  videos: z.array(pythonVideoResultSchema).min(1),
  memory_path: z.string(),
  provenance_path: z.string().nullable(),
  started: finiteNumber,
  finished: finiteNumber,
}).strict();

export const pythonBackfillStatusSchema = z.object({
  schema: z.literal("afterplay.channel-backfill-status"),
  version: z.literal(1),
  job_id: z.string().regex(JOB_ID_PATTERN),
  creator_id: z.string().regex(CREATOR_ID_PATTERN),
  state: z.enum(["running", "complete", "partial", "failed", "cancelling", "cancelled"]),
  stage: z.enum(["resolve", "memory", "done"]),
  progress: z.object({
    done: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }).strict(),
  updated: finiteNumber,
  video: pythonVideoResultSchema.optional(),
  message: z.string().optional(),
}).strict();

export const footageRightsSchema = z.enum([
  "project_owned", "creator_owned", "permission_granted", "licensed", "not_cleared",
]);

export type ChannelPreview = z.infer<typeof channelPreviewSchema>;
export type PythonBackfillReport = z.infer<typeof pythonBackfillReportSchema>;
export type FootageRights = z.infer<typeof footageRightsSchema>;

