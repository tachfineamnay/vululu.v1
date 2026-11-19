BEGIN;
-- Operational source records retain their existing lifecycle. Additional analytics contain no payloads.
CREATE TABLE "ResultEvent" (
 id bigserial PRIMARY KEY, "userId" text NOT NULL REFERENCES "User" ON DELETE CASCADE,
 kind text NOT NULL, subject text NOT NULL, version int, detail text NOT NULL,
 at timestamp(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);
CREATE INDEX "ResultEvent_userId_at_idx" ON "ResultEvent"("userId",at);
CREATE INDEX "ResultEvent_at_idx" ON "ResultEvent"(at);
CREATE TABLE "ResultPreference" (
 "userId" text PRIMARY KEY REFERENCES "User" ON DELETE CASCADE, reminders boolean NOT NULL DEFAULT false,
 "dismissedWeek" text, "firstExport" timestamp(3), "firstPublication" timestamp(3)
);
CREATE FUNCTION result_milestone() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.kind='export' OR (NEW.kind='publication' AND NEW.detail='PUBLISHED') THEN
 INSERT INTO "ResultPreference"("userId","firstExport","firstPublication") VALUES (NEW."userId",CASE WHEN NEW.kind='export' THEN NEW.at END,CASE WHEN NEW.kind='publication' THEN NEW.at END)
 ON CONFLICT ("userId") DO UPDATE SET "firstExport"=least("ResultPreference"."firstExport",excluded."firstExport"),"firstPublication"=least("ResultPreference"."firstPublication",excluded."firstPublication"); END IF; RETURN NEW; END $$;
CREATE TRIGGER result_milestone AFTER INSERT ON "ResultEvent" FOR EACH ROW EXECUTE FUNCTION result_milestone();
CREATE FUNCTION result_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' OR NEW.state IS DISTINCT FROM OLD.state THEN
 INSERT INTO "ResultEvent"("userId",kind,subject,version,detail) SELECT c."ownerId",'publication',NEW.id,NEW.revision,NEW.state FROM "PublishingConnection" c JOIN "Project" p ON p.id=NEW."projectId" AND p."userId"=c."ownerId" WHERE c.id=NEW."connectionId" AND (NEW.state<>'PUBLISHED' OR NEW."networkReceipt" IS NOT NULL);
 END IF; RETURN NEW; END $$;
CREATE TRIGGER result_publication AFTER INSERT OR UPDATE OF state ON "PublicationRequest" FOR EACH ROW EXECUTE FUNCTION result_publication();
-- Recover only actually retained transitions; never date a legacy receipt from migration time.
INSERT INTO "ResultEvent"("userId",kind,subject,version,detail,at)
 SELECT p."userId",'publication',r.id,r.revision,e.state,e."createdAt" FROM "StudioEvent" e
 JOIN "PublicationRequest" r ON r.id=e.entity AND r."projectId"=e."projectId"
 JOIN "Project" p ON p.id=e."projectId" JOIN "PublishingConnection" c ON c.id=r."connectionId" AND c."ownerId"=p."userId"
 WHERE e.kind='publication' AND e."createdAt">=now()-interval '180 days' AND (e.state<>'PUBLISHED' OR r."networkReceipt" IS NOT NULL);
-- Immutable item snapshots preserve titles/statuses even after edits. Do not backdate exports/remote receipts.
CREATE VIEW result_history AS
 SELECT "userId", 'campaign'::text kind,id subject,1 version,name detail,"createdAt" at,'campaign:'||id key FROM "Campaign"
 UNION ALL SELECT i."userId",'content',r."itemId",r.version,concat(r.snapshot->>'title',' · ',r.snapshot->>'status'),r."createdAt",'content:'||r."itemId"||':'||r.version FROM "ContentRevision" r JOIN "ContentItem" i ON i.id=r."itemId"
 UNION ALL SELECT p."userId",'plan',r."projectId",r.version,p.title,r."createdAt",'plan:'||r."projectId"||':'||r.version FROM "MarketingRevision" r JOIN "Project" p ON p.id=r."projectId"
 UNION ALL SELECT p."userId",'plan-approved',r."projectId",r.version,p.title,r."approvedAt",'plan-approved:'||r."projectId"||':'||r.version FROM "MarketingRevision" r JOIN "Project" p ON p.id=r."projectId" WHERE r."approvedAt" IS NOT NULL
 UNION ALL SELECT p."userId",'approved',p.id,r.version,p.title,r."approvedAt",'creative:'||p.id||':'||r.version FROM "CreativeRevision" r JOIN "Project" p ON p.id=r."projectId" WHERE r."approvedAt" IS NOT NULL
 UNION ALL SELECT p."userId",'approved',p.id,v.version,p.title,a."createdAt",'master:'||a.id FROM "Approval" a JOIN "ArtifactVersion" v ON v.id=a."artifactVersionId" JOIN "Artifact" t ON t.id=v."artifactId" JOIN "Project" p ON p.id=t."projectId"
 UNION ALL SELECT "userId",kind,subject,version,detail,at,'event:'||id FROM "ResultEvent";

-- One bounded, aggregate-only observation per publication. No raw provider JSON.
CREATE TABLE "PostMeasure" (
 "requestId" text PRIMARY KEY REFERENCES "PublicationRequest"(id) ON DELETE CASCADE,
 source text NOT NULL, "retrievedAt" timestamp(3) NOT NULL,
 impressions bigint CHECK(impressions>=0), engagement bigint CHECK(engagement>=0), clicks bigint CHECK(clicks>=0)
);
CREATE INDEX "PostMeasure_retrievedAt_idx" ON "PostMeasure"("retrievedAt");
COMMIT;
