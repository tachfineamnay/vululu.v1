# 0029 — Versioned Studio composition

**Decision:** attach an optional, append-only creative timeline to the existing project. Do not reinterpret historical storyboard snapshots, migrate approvals, or use editable scene positions as artifact identities. Save a new spec under a project-row lock with an expected version; restore by appending. Approval binds to the checksum of a sealed render, not to the mutable editor or a production/publishing authorization.

The ordered scene and layer arrays define time and paint order. Image layers pin owned library **versions**, never paths or URLs. The master manifest records ordered scene identities, times, raster fingerprints, source versions and SHA-256 object references. Duration and position in the timeline do not affect a scene's pixels. A new renderer recipe must bump the fingerprint version. Frames and masters use the existing storage port and Sharp/FFmpeg stack.

**Compatibility:** extend `ArtifactAccessPort.getSceneImage` and its use-case counterpart with an optional numeric version. Omitting it still returns latest; requesting `?version=N` (or Studio's `?v=N`) returns only N or 404. Creative masters have a separate project/revision URL so their numbers cannot collide with existing production runs. Legacy approval/transfer contracts remain unchanged.
