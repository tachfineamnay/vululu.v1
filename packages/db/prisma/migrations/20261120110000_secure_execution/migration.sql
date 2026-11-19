CREATE TABLE "ExecutionAccount" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "limitCents" INTEGER NOT NULL CHECK ("limitCents" >= 0),
 "reservedCents" INTEGER NOT NULL DEFAULT 0 CHECK ("reservedCents" >= 0),
 "spentCents" INTEGER NOT NULL DEFAULT 0 CHECK ("spentCents" >= 0),
 tools TEXT[] NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK ("spentCents"::bigint + "reservedCents" <= "limitCents")
);
CREATE TABLE "ExecutionOperation" (
 id TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "ExecutionAccount"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 key TEXT NOT NULL, digest TEXT NOT NULL, tool TEXT NOT NULL, revision INTEGER NOT NULL,
 state TEXT NOT NULL CHECK (state IN ('PROPOSED','QUEUED','CLAIMED','UNKNOWN','SUCCEEDED','CANCELLED','RESOLVED')),
 "costState" TEXT NOT NULL CHECK ("costState" IN ('ESTIMATED','RESERVED','UNKNOWN','REPORTED','RECONCILED','RELEASED')),
 "maxCents" INTEGER NOT NULL CHECK ("maxCents" >= 0), "reportedCents" INTEGER CHECK ("reportedCents" >= 0),
 "approvedBy" TEXT, "correlationId" TEXT NOT NULL UNIQUE,"claimUntil" TIMESTAMP(3),
 "notifyAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("accountId",key)
);
CREATE INDEX "ExecutionOperation_state_notifyAfter_idx" ON "ExecutionOperation"(state,"notifyAfter");
CREATE INDEX "ExecutionOperation_state_claimUntil_idx" ON "ExecutionOperation"(state,"claimUntil");
