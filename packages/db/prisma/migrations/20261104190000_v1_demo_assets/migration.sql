-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "usage" TEXT NOT NULL DEFAULT 'organic';

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandAssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAssetSelection" (
    "projectId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetVersionId" TEXT NOT NULL,

    CONSTRAINT "ProjectAssetSelection_pkey" PRIMARY KEY ("projectId","assetId")
);

-- CreateIndex
CREATE INDEX "BrandAsset_userId_contextId_idx" ON "BrandAsset"("userId", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAssetVersion_storageKey_key" ON "BrandAssetVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "BrandAssetVersion_assetId_version_key" ON "BrandAssetVersion"("assetId", "version");

-- CreateIndex
CREATE INDEX "ProjectAssetSelection_assetVersionId_idx" ON "ProjectAssetSelection"("assetVersionId");

-- AddForeignKey
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "BrandContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAssetVersion" ADD CONSTRAINT "BrandAssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "BrandAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssetSelection" ADD CONSTRAINT "ProjectAssetSelection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssetSelection" ADD CONSTRAINT "ProjectAssetSelection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "BrandAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssetSelection" ADD CONSTRAINT "ProjectAssetSelection_assetVersionId_fkey" FOREIGN KEY ("assetVersionId") REFERENCES "BrandAssetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
