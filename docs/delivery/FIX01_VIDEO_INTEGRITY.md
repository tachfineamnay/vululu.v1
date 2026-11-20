# FIX01 — Master duration integrity & mandatory media QA gate

**Scope:** production defect correction of the media pipeline (`assembleMaster` + QA/finalize/approval path).
**Branch:** `arena/e128d01b-vululu-v1` · **Base:** `c452f877a1f0968f468592ca39a8c876f34ef554` (`main`).
**Date:** 2026-11-20. **Status:** code fixed, verified with real FFmpeg/ffprobe, PR open, **not merged** (owner approval required).

This document is the delivery record for the FIX01 request. It is not an architecture audit.

---

## 1. Root cause

### 1.1 The defective argument set

The still-image branch of `assembleMaster()` (`packages/media/src/index.ts`) built a concat list from the scene
PNGs (`file` + `duration` per scene, plus a terminal duplicate entry for the last still), then encoded:

```
ffmpeg -y -f concat -safe 0 -i concat.txt \
       -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
       -c:v libx264 -pix_fmt yuv420p -r 30 \
       -c:a aac -b:a 128k \
       -t <expected> -shortest out.mp4
```

The requested duration was therefore a *hint*, and two independent mechanisms overrode it.

### 1.2 Layer A — `-shortest` ends the output at the first stream that stops

`anullsrc` is an infinite source and the video stream coming out of the concat demuxer was already short, so
`-shortest` stopped the muxer as soon as the video frames ran out. `-t <expected>` could not compensate:
`-shortest` is an additional, independent stop condition.

### 1.3 Layer B — the concat demuxer emits one frame per still

For N still PNGs the demuxer produced N+1 decoded frames (N unique images + the terminal duplicate) with PTS gaps
of 2–4 seconds. Output `-r 30` sets the nominal frame rate but **does not interpolate the missing frames**: the video
stream ended at the last decoded frame (~2 s) while the container claimed a longer duration.

Measured A/B on the *same* concat list (real FFmpeg, 2 scenes 2 s + 3 s):

| Variant | Container duration | Video stream duration | Decoded frames |
|---|---|---|---|
| `-r 30 -t 5 -shortest` (shipped) | 2.033 s | 2.033 s | 61 |
| `-t 5` only (no `-shortest`) | 4.000 s | 2.033 s | 61 |
| `-fps_mode cfr -r 30 -t 5` (no `fps` filter) | 2.033 s | 2.033 s | 61 |
| `-vf fps=30,setsar=1 -t 5` | **5.000 s** | **5.000 s** | **150** |

Conclusions that drove the fix:

* removing `-shortest` alone is **not** a fix (video stream still 61 frames);
* `-r 30` / `-fps_mode cfr` alone is **not** a fix;
* only the `fps` filter replicates each still across its full `duration`, producing a genuine CFR stream.

### 1.4 Why the QA gate did not catch it

1. `runQa()` accepted a duration error up to **±0.75 s**. Observed truncations are 1–3 s, but the check was also
   evaluated against a *reported* duration that could hide a short video stream inside a longer container.
2. A QA `FAIL` report was **stored as a successful step**: `DurableProductionUseCases.runQa()` called
   `finishStep('qa', { qa })` unconditionally, and `finalize()` only required the `qa` step output to *exist*
   (`if (!rendered || !master || !qa) throw media_incomplete`). A `FAIL` report therefore led to an
   `ArtifactVersion`, a `waiting_approval` job, and only `ProductionUseCases.approve()` refused it — after the run had
   already been presented as successful.

---

## 2. Reproduction before correction

### 2.1 Environment

| Item | Value |
|---|---|
| FFmpeg / ffprobe | 9.0.2 (static build installed by `scripts/arena/bootstrap-media-tools.sh`, `FFMPEG_PATH`) |
| Deployment image | `infra/coolify/Dockerfile.api` → `node:24-bookworm-slim` + Debian FFmpeg 5.1.6 |
| Scenes | real 1080×1350 PNGs produced by `renderScene()` (sharp), one project per case |
| Measurement | `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 master.mp4` (container) and `-count_frames -select_streams v:0` (real frame count) |

No mock metadata was used: every "before" figure below is the duration of an actually encoded MP4.

### 2.2 Expected vs actual (code before the fix)

| Case | Expected | Actual (before) | Delta | Video frames |
|---|---|---|---|---|
| 1 scene, 3 s | 3.000 s | **0.033 s** | −2.967 s (−98.9 %) | 1 |
| 2 scenes, 2 s + 3 s | 5.000 s | **2.033 s** | −2.967 s (−59.3 %) | 61 |
| 2 scenes, 4 s + 4 s | 8.000 s | **4.033 s** | −3.967 s (−49.6 %) | 121 |
| 3 scenes, 1 s + 2.5 s + 4 s | 7.500 s | **4.500 s** | −3.000 s (−40.0 %) | 135 |
| 5 scenes × 2 s (existing regression) | 10.000 s | **9.967 s** | −0.033 s | 299 |

Observations:

* the single-scene case produced a **one-frame** master (0.033 s) — the extreme form of the defect;
* the 3-unequal-scene case lost three seconds, i.e. **more than one scene**, and is worse than the 1–2 scene
  truncation recorded in the audit;
* the 5×2 s case looked almost correct (9.967 s) because 5 identical durations happened to align with the concat
  timing, which is exactly why the old `tests/media.test.ts` (5 scenes only, `duration >= 9`) never detected it.

Container was always valid MP4, H.264 + AAC, 1080×1350 — a "valid-looking" artifact, which is why the defect could
reach approval.

---

## 3. Exact code changes

Three targeted edits, no refactoring, no new component, no schema change.

### 3.1 `packages/media/src/index.ts` — encoder arguments (still-image branch)

```diff
     await run(findFfmpeg(), [
       '-y',
       '-f', 'concat',
       '-safe', '0',
       '-i', concatPath,
       '-f', 'lavfi',
+      '-t', String(expectedDurationSeconds),
       '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
+      '-map', '0:v:0',
+      '-map', '1:a:0',
+      '-vf', 'fps=' + MASTER_FRAME_RATE + ',setsar=1',
+      '-fps_mode', 'cfr',
       '-c:v', 'libx264',
       '-pix_fmt', 'yuv420p',
-      '-r', '30',
       '-c:a', 'aac',
       '-b:a', '128k',
       '-t', String(expectedDurationSeconds),
-      '-shortest',
+      '-movflags', '+faststart',
       file
     ]);
```

Rationale per argument:

| Change | Why |
|---|---|
| `-shortest` removed | it terminated the output at the first exhausted stream (layer A) |
| finite `-t` on the `anullsrc` **input** | the silent source is an input, not an unbounded stream that can drive the muxer |
| output `-t <expected>` kept | the finite requested duration is the single authority on output length |
| `-map 0:v:0 -map 1:a:0` | explicit stream selection; no implicit default-stream choice |
| `-vf fps=30,setsar=1` | replicates each still over its `duration` → real CFR frames (layer B); `setsar=1` keeps square pixels |
| `-fps_mode cfr` | explicit constant-frame-rate output timing (FFmpeg ≥ 5.1; bookworm ships 5.1.6) |
| `-r 30` removed | superseded by the `fps` filter; it did not normalise the sparse timestamps |
| `+faststart` | moov atom first, so the master is streamable once published |

Preserved on purpose: H.264 (`libx264`), AAC 128 kbit/s, `yuv420p`, source dimensions/aspect ratio, concat list
layout (including the terminal duplicate entry that guarantees the final still is displayed), the motion path and the
audio composition path.

New exported constants/helpers (single source of truth for the tolerance):

```ts
export const MASTER_FRAME_RATE = 30;
export const MASTER_DURATION_TOLERANCE_FRAMES = 2;      // ≈ 0.067 s at 30 fps
export function masterDurationTolerance(fps = MASTER_FRAME_RATE): number { ... }
```

### 3.2 `packages/media/src/index.ts` — `runQa()` duration check

```diff
-checks.push({
-  name: 'master duration',
-  status: Math.abs(master.duration - master.expectedDurationSeconds) <= 0.75 ? 'PASS' : 'FAIL',
-  detail: master.duration.toFixed(2) + 's / attendu ' + master.expectedDurationSeconds + 's'
-});
+const durationTolerance = masterDurationTolerance(MASTER_FRAME_RATE);
+const durationDelta = Math.abs(master.duration - master.expectedDurationSeconds);
+checks.push({
+  name: 'master duration',
+  status: durationDelta <= durationTolerance ? 'PASS' : 'FAIL',
+  detail: '... ecart X s / tolerance 0.067 s (2 images a 30 fps)'
+});
```

Existing codec (`h264`), audio codec (`aac`), dimensions, per-scene PNG checksum and master checksum checks are
unchanged and still mandatory; the report status remains `FAIL` if any check fails.

### 3.3 `packages/application/src/use-cases/durableProduction.ts` — QA failure semantics

* new `qaFailureReason(checks)` helper → `qa_failed: controle qualite obligatoire en echec (n/total): <name>=<status> [<detail>] | ...`, capped at 2000 chars;
* `runQa()` now, when `qa.status !== 'PASS'`: persists the QA output (`saveStepOutput`), transitions the `qa` step to
  `failed` with `{ reason: 'qa_failed', checks }`, then throws `ApplicationError('qa_failed', …)` (409);
* `finalize()` now refuses any non-`PASS` QA **before** starting anything: it calls `fail(jobRunId, reason, 'failed')`
  and throws. It therefore never calls `finalizeArtifacts`, never publishes the master, never creates an
  `ArtifactVersion`, never transitions the job to `waiting_approval`, and never touches the previous master.

No other file was modified. `apps/api/src/worker/pipeline.ts`, the domain state machine, the DB schema and the
approval/transfer contracts are untouched.

---

## 4. FFmpeg/ffprobe verification after correction

### 4.1 Committed regression suite (real encode, independent ffprobe)

`tests/media-duration-integrity.test.ts` produces the master with the product code, then re-probes the file with a
**separate ffprobe process** (`-count_frames`), and asserts on the encoded streams:

```
ffprobe -v error -count_frames \
  -show_entries stream=codec_type,codec_name,duration,nb_read_frames,width,height:format=duration \
  -of json master.mp4
```

| Case | Expected | Container | Video stream | Frames (= expected × 30) | Audio (AAC) | QA |
|---|---|---|---|---|---|---|
| 1 scene, 3 s | 3.000 | 3.000 | 3.000 | 90 | 3.000 | PASS |
| 2 scenes, 2 + 3 s | 5.000 | 5.000 | 5.000 | 150 | 5.000 | PASS |
| 2 scenes, 4 + 4 s | 8.000 | 8.000 | 8.000 | 240 | 8.000 | PASS |
| 3 scenes, 1 + 2.5 + 4 s | 7.500 | 7.500 | 7.500 | 225 | 7.500 | PASS |
| 5 scenes × 2 s | 10.000 | 10.000 | 10.000 | 300 | 10.000 | PASS |

Assertions: `|duration − expected| ≤ 1/30 s`, `frames = round(expected × 30)`, `|audio duration − expected| ≤ 2/30 s`,
`videoCodec === 'h264'`, `audioCodec === 'aac'`, `1080×1920`, `format duration` within one frame.

### 4.2 Motion path (unchanged code) re-verified with the stricter tolerance

| Case | Expected | Measured (container / video) | QA |
|---|---|---|---|
| 2 scenes 2.5 + 3.5 s, dip transitions | 6.000 | 6.000 / 6.000 | PASS |
| 5 scenes × 1.7 s (non-frame-aligned) | 8.500 | 8.500 / 8.500 | PASS |
| 3 scenes × 2.9 s | 8.700 | 8.700 / 8.700 | PASS |
| 2 scenes 1.13 + 4.37 s | 5.500 | 5.500 / 5.500 | PASS |

The frame-aware tolerance (±0.067 s) is therefore safe for the motion path: per-scene parts are rounded up to whole
frames and the terminal `-t expected` trims the concat, so the total is exact.

### 4.3 Audio-enabled path

Real AAC track generated with FFmpeg (`sine`, 20 s), 3 scenes 2 + 3 + 4 s with background audio (`gain 0.8`):

```
{"expected":9,"actual":9,"qa":"PASS", elapsedMs:6313,
 "streams":[{"codec_name":"h264","codec_type":"video","duration":"9.000000","nb_read_frames":"270"},
            {"codec_name":"aac","codec_type":"audio","duration":"9.000000"}],
 "format":{"duration":"9.000000"}}
```

Exact 9.000 s video and audio, 270 frames, encode completed in ~6 s — no hanging process (`apad`/`anullsrc` are cut
by the finite `-t`). This scenario is committed as a test.

### 4.4 Silent path

All still-image masters use `anullsrc`; every case above produced an AAC stream whose duration equals the video
duration exactly, with no zombie FFmpeg process (all commands returned and the suite completes in bounded time).

---

## 5. Regression test results

Run with real FFmpeg 9.0.2 / ffprobe (`FFMPEG_PATH`, `FFPROBE_PATH`):

| Command | Result |
|---|---|
| `npx vitest run tests/media-duration-integrity.test.ts` | **10 passed** (56.7 s) |
| `npx vitest run tests/qa-gate.test.ts` | **5 passed** (0.01 s) |
| `npx vitest run tests/media.test.ts` (pre-existing V0 suite) | **1 passed** (46.5 s) |
| `npx vitest run tests/production-profile-media.test.ts tests/responsive-layout.test.ts` | **10 passed** |
| `npx tsc -p packages/media/tsconfig.json --noEmit` · `npx tsc -p packages/application/tsconfig.json --noEmit` | clean |
| `npx eslint` on the 4 changed files | clean |

New coverage introduced:

1. 1 / 2 / 3 / 5 scenes and unequal durations, each verified with an independent ffprobe (container, video stream,
   frame count, audio stream);
2. codec (`h264`/`aac`), dimensions (1080×1920) and MP4 validity;
3. frame-rate-aware duration tolerance exposed and asserted (`< 0.1 s`, = 2 frames);
4. QA refuses truncated duration (−3 s and −0.2 s), wrong codec, wrong dimensions, tampered scene checksum;
5. motion path (with dip) exact duration;
6. audio-enabled path exact duration, no hang;
7. QA `FAIL` blocks `finalize` and `approve`, with persisted failure state and reason;
8. previous master preserved (same checksum, still 5.000 s / 150 frames) after a failed render of version 2.

**No existing assertion was removed, skipped or weakened.** `tests/media.test.ts` was left untouched (its
`duration >= 9` assertion is now trivially satisfied, and the exact duration is asserted by the new suite).

Full-suite context (`npx vitest run tests`): **41 files passed, 34 files failed, 1 test failed, 267 tests passed**.
The 34 failing files all fail at import with `@prisma/client did not initialize yet` (pre-existing environment
limitation, see §7). The single failing test is `tests/project-presentation.test.ts` (web draft restoration,
`apps/web/lib/projectPresentation.ts`); it imports nothing from the media or application packages and is unrelated to
this change.

---

## 6. QA gate behaviour

### 6.1 Flow after the fix

```
assemble-master ──► qa ──────────────► finalize ──────────► approval ──► transfer
                     │ PASS             │ QA=PASS only       │ qaStatus=PASS
                     │                  │                    │ required
                     └ FAIL ────────────┴────────────────────┴──► run failed (terminal)
                        step qa = failed, output persisted, no artifact, no approval, no transfer
```

### 6.2 Scenario matrix

| Scenario | Before | After |
|---|---|---|
| Master duration off by ≥ 0.75 s | QA FAIL stored on a *succeeded* step → artifact created → `waiting_approval` | QA step `failed`, run `failed`, **no** `ArtifactVersion`, **no** `waiting_approval` |
| Master duration off by 0.1–0.75 s | QA **PASS** (tolerance) → approvable | QA FAIL (tolerance 0.067 s) → run failed |
| Master duration off by < 0.067 s (≤ 2 frames) | PASS | PASS (normal encoder rounding only) |
| Non-H.264 video / non-AAC audio | QA FAIL → still finalized | QA FAIL → run failed, no artifact |
| Wrong dimensions | QA FAIL → still finalized | QA FAIL → run failed, no artifact |
| Scene PNG checksum mismatch | QA FAIL → still finalized | QA FAIL → run failed, no artifact |
| QA step output missing | `media_incomplete` | `media_incomplete` (unchanged) |
| QA PASS | finished → approval | unchanged (regression test asserts `finalizeArtifacts` + `waiting_approval`) |
| Approval attempted on a `FAIL`/`PENDING` master | blocked (`qa_required`) | blocked (`qa_required`, unchanged) |

### 6.3 Persistence, diagnostics and retry safety

* **Explicit failure state:** `failRun` writes the run to `failed`, the `productionJob` to `failed` with
  `step='failed'` and `error=<reason>`, marks all non-terminal `stepRun` rows `failed` with the same error, and
  appends a `runStateEvent`. The reason starts with `qa_failed:` and lists every failing check with its detail
  (e.g. `master duration=FAIL [4.500s / attendu 7.5s / ecart 3.000s ...]`), so the cause is readable from the DB
  and from worker logs (`worker.step.failed`) without re-rendering.
* **No success, no approval, no publishing:** `finalizeArtifacts` is never called (verified by test), the
  artifact publisher is never invoked, the job never reaches `waiting_approval`, and `confirmApproval` /
  `assertTransferAllowed` still require a persisted `qaStatus === 'PASS'`.
* **Previous master preserved:** masters are written to a versioned path (`master/v<version>.mp4`) and an
  `ArtifactVersion` only exists after a passing `finalize`. A failing render leaves the previous version's file and
  checksum untouched (test asserts the byte-identical checksum and a 5.000 s / 150-frame probe after a failed v2).
* **Safely retryable and idempotent:** `fail()` is a no-op on an already-terminal run, the QA output stays persisted
  (`saveStepOutput`) even in the failure path, and the `finalize` gate is re-evaluated on every retry; a new
  production run re-renders into a fresh version directory. No destructive migration, no data deletion.
* **No silent downgrade:** a `FAIL` never becomes `PENDING` or `PASS`; the only way past the gate is a fresh QA
  report whose checks all pass.

---

## 7. PASS / FAIL / NOT_RUN

### PASS (re-executed here, real binaries)

| Item | Evidence |
|---|---|
| Root cause identified at both layers | §1.3 A/B table (61 frames with/without `-shortest`, 150 with `fps`) |
| Reproduction before correction (5 cases) | §2.2, real encoded files |
| 1 scene 3 s exact | 3.000 s / 90 frames |
| 2 scenes 2+3 s exact | 5.000 s / 150 frames |
| 2 scenes 4+4 s exact | 8.000 s / 240 frames |
| 3 unequal scenes exact | 7.500 s / 225 frames |
| 5 scenes exact | 10.000 s / 300 frames |
| H.264 + AAC + 1080×1920 + valid MP4 | ffprobe streams on every case |
| Frame-rate-aware tolerance | 2 frames @30 fps, asserted |
| Motion path preserved | 6.000 / 8.500 / 8.700 / 5.500 s exact |
| Audio-enabled path preserved, no hang | 9.000 s video + 9.000 s AAC, 6.3 s encode |
| QA failure blocks finalize and approval | `tests/qa-gate.test.ts` 5/5 |
| Failure persisted with explicit state and reason | `failRun` payload asserted (`state`, `qa_failed`, check details) |
| Previous master preserved after failed render | checksum + 5.000 s / 150 frames re-probe |
| Existing media tests unaffected | `tests/media.test.ts`, `production-profile-media`, `responsive-layout` |
| Typecheck + lint of changed code | clean |

### FAIL

None within FIX01 scope. Every in-scope criterion above was re-executed on the fixed code.

### NOT_RUN (and why)

| Item | Reason |
|---|---|
| DB-backed durable tests (`tests/v1/v1-01-d-durable`, `v1-01-e-storage`, `v1/infrastructure`, … — 34 files) | `@prisma/client did not initialize yet` (Prisma engines not available in this environment) — pre-existing, unchanged by FIX01 |
| End-to-end run through the Hatchet worker (`assemble-master → qa → finalize → approval → transfer`) | requires Postgres + Hatchet + Prisma engines; the gate was exercised at use-case level with the store port, not through a live workflow |
| `apps/api` build / API typecheck | blocked by the same Prisma client generation |
| Creative export path (`apps/api/src/application/creative.ts`) | intentionally not modified: it is not the durable approval path, already rejects `|duration − expected| > 0.25 s` plus codec/dimension mismatches before sealing an output, and now benefits from the exact still-image encoder. A dedicated QA pass on that path is a separate backlog item |
| Production / preproduction deployment, external publication, paid provider calls | explicitly out of scope for FIX01 |
| `tests/project-presentation.test.ts` | pre-existing failure in `apps/web/lib/projectPresentation.ts`, unrelated to media/QA |

---

## 8. Commit SHA and PR

| Item | Value |
|---|---|
| Fix commit (media encoder + QA gate) | `2cf5fc8eff9d3e492eab2d019d5e664ea6df3df4` |
| Tests commit (audio-enabled path) | `d440d5e7abe335059f1727e655eb61c8ccc2c154` |
| Delivery doc commit | this document's commit on the same branch |
| Branch | `arena/e128d01b-vululu-v1` |
| Base | `c452f877a1f0968f468592ca39a8c876f34ef554` (`main`) |
| Pull request | [#16](https://github.com/tachfineamnay/vululu.v1/pull/16) — **open, not merged** |

Files changed:

```
packages/media/src/index.ts
packages/application/src/use-cases/durableProduction.ts
tests/media-duration-integrity.test.ts   (new)
tests/qa-gate.test.ts                    (new)
docs/delivery/FIX01_VIDEO_INTEGRITY.md   (this document)
```

**Merge policy:** no merge without explicit owner approval. Deployment note: `-fps_mode` requires FFmpeg ≥ 5.1; the
production image (`node:24-bookworm-slim` + Debian FFmpeg 5.1.6) satisfies it, and the local verification used 9.0.2.
