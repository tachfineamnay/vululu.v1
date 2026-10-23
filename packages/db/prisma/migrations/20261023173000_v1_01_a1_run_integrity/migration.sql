-- V1-01-A.1 : integrite des steps et liaison ProductionJob -> JobRun.
CREATE UNIQUE INDEX "StepRun_jobRunId_name_key" ON "StepRun"("jobRunId", "name");

ALTER TABLE "ProductionJob" ADD COLUMN "jobRunId" TEXT;
CREATE UNIQUE INDEX "ProductionJob_jobRunId_key" ON "ProductionJob"("jobRunId");
ALTER TABLE "ProductionJob" ADD CONSTRAINT "ProductionJob_jobRunId_fkey"
  FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
