-- CreateTable
CREATE TABLE "BriefRevision" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BriefRevision_briefId_idx" ON "BriefRevision"("briefId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefRevision_briefId_version_key" ON "BriefRevision"("briefId", "version");

-- AddForeignKey
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
