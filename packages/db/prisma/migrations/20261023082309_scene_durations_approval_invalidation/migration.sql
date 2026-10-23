-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "invalidatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "sceneDurationSeconds" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "durationSeconds" INTEGER NOT NULL DEFAULT 2;
