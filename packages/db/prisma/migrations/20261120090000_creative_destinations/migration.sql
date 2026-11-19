ALTER TABLE "CreativeRevision" ADD COLUMN "contentItemId" TEXT, ADD COLUMN "contentVersion" INTEGER;
ALTER TABLE "CreativeRevision" ADD CONSTRAINT "CreativeRevision_calendar_fkey" FOREIGN KEY ("contentItemId", "contentVersion") REFERENCES "ContentRevision"("itemId",version) MATCH FULL ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CreativeRevision_contentItemId_contentVersion_idx" ON "CreativeRevision"("contentItemId","contentVersion");
