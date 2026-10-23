-- AlterTable
ALTER TABLE "JobRun" ADD COLUMN     "outputs" JSONB,
ADD COLUMN     "outputsChecksum" TEXT,
ADD COLUMN     "snapshotChecksum" TEXT,
ADD COLUMN     "snapshotVersion" INTEGER NOT NULL DEFAULT 1;

-- V1-01-A: preserve outputs of existing runs in a dedicated result document,
-- keep snapshot immutable, and checksum both documents.
UPDATE "JobRun"
SET "outputs" = "snapshot"->'outputs',
    "outputsChecksum" = encode(sha256(convert_to(("snapshot"->'outputs')::text, 'UTF8')), 'hex')
WHERE "snapshot" ? 'outputs';

UPDATE "JobRun"
SET "snapshot" = "snapshot" - 'outputs'
WHERE "snapshot" ? 'outputs';

UPDATE "JobRun"
SET "snapshotChecksum" = encode(sha256(convert_to("snapshot"::text, 'UTF8')), 'hex')
WHERE "snapshot" IS NOT NULL;
