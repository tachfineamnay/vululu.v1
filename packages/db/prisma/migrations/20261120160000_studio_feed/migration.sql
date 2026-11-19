CREATE TABLE "StudioClock" ("projectId" TEXT PRIMARY KEY REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE,cursor INTEGER NOT NULL);
CREATE TABLE "StudioEvent" ("projectId" TEXT NOT NULL REFERENCES "StudioClock"("projectId") ON DELETE CASCADE ON UPDATE CASCADE,cursor INTEGER NOT NULL,kind TEXT NOT NULL,entity TEXT NOT NULL,state TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("projectId",cursor));
CREATE TABLE "StudioRender" (id TEXT PRIMARY KEY,"projectId" TEXT NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL,reason TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY("projectId",revision) REFERENCES "CreativeRevision"("projectId",version) ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "StudioRender_projectId_createdAt_idx" ON "StudioRender"("projectId","createdAt");
-- One project-local row lock orders commits (a sequence allocated before commit cannot guarantee replay).
-- The business mutation, cursor and invalidation either all commit or all roll back.
CREATE FUNCTION studio_emit(p TEXT,k TEXT,e TEXT,s TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
 IF p IS NULL THEN RETURN; END IF;
 INSERT INTO "StudioClock" VALUES(p,1) ON CONFLICT ("projectId") DO UPDATE SET cursor="StudioClock".cursor+1 RETURNING cursor INTO n;
 INSERT INTO "StudioEvent"("projectId",cursor,kind,entity,state) VALUES(p,n,k,e,s);
 IF n%64=0 THEN DELETE FROM "StudioEvent" WHERE "projectId"=p AND cursor<=n-512; END IF;
END $$;
-- Only identifiers and state codes cross this boundary: never prompts, tokens, filenames, briefs or provider payloads.
CREATE FUNCTION studio_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p TEXT; e TEXT; s TEXT; j JSONB;
BEGIN
 j:=to_jsonb(NEW); p:=j->>'projectId'; e:=coalesce(j->>'id',j->>'version',j->>'assetVersionId',''); s:=coalesce(j->>'state',j->>'status','updated');
 CASE TG_TABLE_NAME
 WHEN 'Project' THEN p:=NEW.id;
 WHEN 'CreativeRevision' THEN s:=CASE WHEN NEW."approvedAt" IS NOT NULL THEN 'approved' WHEN NEW.manifest IS NOT NULL THEN 'rendered' ELSE 'draft' END;
 WHEN 'MarketingRevision' THEN s:=CASE WHEN NEW."approvedAt" IS NOT NULL THEN 'approved' ELSE 'draft' END;
 WHEN 'Brief' THEN s:=CASE WHEN NEW."confirmedVersion"=NEW.version THEN 'approved' ELSE 'draft' END;
 WHEN 'Approval' THEN SELECT a."projectId" INTO p FROM "ArtifactVersion" v JOIN "Artifact" a ON a.id=v."artifactId" WHERE v.id=NEW."artifactVersionId"; s:=CASE WHEN NEW."invalidatedAt" IS NULL THEN 'approved' ELSE 'invalidated' END;
 WHEN 'StepRun' THEN SELECT "projectId" INTO p FROM "JobRun" WHERE id=NEW."jobRunId";
 ELSE NULL;
 END CASE;
 PERFORM studio_emit(p,TG_ARGV[0],e,s); RETURN NEW;
END $$;
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF status,"campaignId","contextId",title,objective,"storyboardBriefVersion" ON "Project" FOR EACH ROW EXECUTE FUNCTION studio_change('project');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF manifest,"approvedAt" ON "CreativeRevision" FOR EACH ROW EXECUTE FUNCTION studio_change('creative');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF step,status,progress,error ON "ProductionJob" FOR EACH ROW EXECUTE FUNCTION studio_change('job');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF status ON "JobRun" FOR EACH ROW EXECUTE FUNCTION studio_change('run');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF status,attempts,error ON "StepRun" FOR EACH ROW EXECUTE FUNCTION studio_change('step');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF version,"confirmedVersion" ON "Brief" FOR EACH ROW EXECUTE FUNCTION studio_change('brief');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF "invalidatedAt" ON "Approval" FOR EACH ROW EXECUTE FUNCTION studio_change('approval');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF position,"durationSeconds",title ON "Scene" FOR EACH ROW EXECUTE FUNCTION studio_change('scene');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF state ON "StudioRender" FOR EACH ROW EXECUTE FUNCTION studio_change('render');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF state,"reportedCents","cancelRequested" ON "MediaGeneration" FOR EACH ROW EXECUTE FUNCTION studio_change('media');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF state,"costState" ON "ExecutionOperation" FOR EACH ROW EXECUTE FUNCTION studio_change('execution');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF version ON "ContentItem" FOR EACH ROW EXECUTE FUNCTION studio_change('calendar');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF state ON "PublicationRequest" FOR EACH ROW EXECUTE FUNCTION studio_change('publication');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF "approvedAt" ON "MarketingRevision" FOR EACH ROW EXECUTE FUNCTION studio_change('marketing');
CREATE TRIGGER studio_event AFTER INSERT OR UPDATE OF "assetVersionId" ON "ProjectAssetSelection" FOR EACH ROW EXECUTE FUNCTION studio_change('selection');
CREATE TRIGGER studio_event AFTER INSERT ON "Message" FOR EACH ROW EXECUTE FUNCTION studio_change('message');
