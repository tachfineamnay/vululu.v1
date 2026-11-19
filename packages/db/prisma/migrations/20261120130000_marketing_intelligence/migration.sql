CREATE TABLE "MarketingRevision" (
 "projectId" TEXT NOT NULL REFERENCES "Project"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version INTEGER NOT NULL CHECK (version>0), "requestId" TEXT NOT NULL, "requestDigest" TEXT NOT NULL,
 "parentVersion" INTEGER, "operationId" TEXT UNIQUE REFERENCES "ExecutionOperation"(id) ON DELETE RESTRICT,
 context JSONB NOT NULL, recipe JSONB NOT NULL, result JSONB NOT NULL, digest TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN ('provider','fallback')), reason TEXT NOT NULL,
 "approvedAt" TIMESTAMP(3), "approvedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("projectId",version), UNIQUE("projectId","requestId"),
 CHECK (("approvedAt" IS NULL) = ("approvedBy" IS NULL)),
 FOREIGN KEY("projectId","parentVersion") REFERENCES "MarketingRevision"("projectId",version) ON DELETE RESTRICT
);
