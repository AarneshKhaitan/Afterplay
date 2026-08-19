# Afterplay Clip Manifest V2

Status: frozen for the 2026 finals build.

## Identity

- `schema` is exactly `afterplay.clip-manifest`.
- `schema_version` is `2`.
- `creator_id` and `job_id` are non-empty strings.

Unknown future versions do not enter Studio. A document without a version is treated as legacy v1:
it remains inspectable when otherwise valid, but cannot enter the approval projection.

## Source Provenance

Every v2 source records:

- `footage_rights`: `project_owned`, `creator_owned`, `permission_granted`, `licensed`, or
  `not_cleared`.
- `transcript_language`: detected/configured language or `null`.
- `transcript_source`: `provided_vtt`, `youtube_manual`, `youtube_auto`, `youtube_unknown`, `asr`,
  or `null` when no transcript exists.
- `subtitle_track`: exact selected track or `null`.

Rights are an operator attestation. They are never derived from a URL, local path, uploader, or
creator id. `not_cleared` is valid provenance for private analysis, but it blocks approval and
dispatch of pipeline clips.

## Clip Evidence

Each clip records an immutable `decision_window { start, end }` in addition to final rendered
timestamps. QC repairs may move the rendered start; the decision window remains the key used to
join the clip to the ablation row.

A callback receipt is valid only when all of these are present:

- `signals.callback === true` and `signals.citation_verified === true`.
- `thread_label`, `source_stream`, corrected `source_t`, and transcript-verbatim `source_quote`.
- Audit keys retain `source_t_reported`, `source_match_ratio`, `source_repair`, and
  `source_quote_display` without replacing the verified quote. Reported time and repair may be
  `null`, but the keys must exist; match ratio must remain inside the verifier's accepted range.

Unverified callback-like signals may remain in raw artifacts for audit, but do not become a
callback, evidence card, boost claim, or approval rationale in the product.

## Ablation Join

The ablation document uses schema version 1 and the comparison point
`post_scoring_pre_sponsor_pre_analytics`. Every moment records start/end, baseline and memory rank,
signed rank delta, base and final score, additive boost, score scale, baseline/memory selection,
base percentile, and callback state. Available proof contains exactly `candidate_count` unique
windows, complete rank permutations in both arms, reproducible percentiles, and valid rank/score
arithmetic.

Studio joins `ablation.moments[*].start/end` to a clip's immutable `decision_window`. Memory impact
is projected only when the row says the clip was selected with memory and its callback state agrees
with the verified clip. Missing or unavailable ablation is shown as missing comparison evidence;
it is never converted to a zero-effect claim.

## Approval

Only schema-v2 manifests with one of `project_owned`, `creator_owned`, `permission_granted`, or
`licensed` can produce experiment `pipelineOutputs`. `not_cleared`, missing rights, malformed v2,
unknown rights values, and unknown schema versions fail closed for approval.

If a newer manifest for the creator is invalid, Studio shows the latest valid manifest with an
explicit stale warning and blocks its approval projection. Approval records the reviewed manifest
job id, ordered pipeline clip ids, and a SHA-256 digest over the creator-scoped manifest projection.
Dispatch re-reads the current manifest and returns `approved_outputs_changed` when that binding
differs. The digest includes each approvable clip's media bytes, so same-id rewrites and in-place
MP4 replacement both fail closed; new output never inherits an old approval.

Successful clips need unique ids, valid rendered/decision windows, readable media inside their own
job directory, and a platform supported by the approval workflow. LinkedIn/X artifacts remain
inspectable but block approval until that workflow supports them. A status/manifest creator-id
disagreement rejects the artifact for both workspaces.
