BEGIN;
CREATE TABLE "BillingControl"(id text PRIMARY KEY CHECK(id='commercial'), enabled boolean NOT NULL DEFAULT false);
INSERT INTO "BillingControl" VALUES ('commercial',false);
CREATE TABLE "BillingProduct"(id text PRIMARY KEY, name text NOT NULL, currency text NOT NULL CHECK(currency IN ('usd','eur','gbp')), amount int NOT NULL CHECK(amount>0), days int NOT NULL CHECK(days BETWEEN 1 AND 366), regular int NOT NULL CHECK(regular>=0), premium int NOT NULL CHECK(premium>=0), "imageUnits" int NOT NULL CHECK("imageUnits">0), "videoUnits" int NOT NULL CHECK("videoUnits">0), features text[] NOT NULL, terms text NOT NULL CHECK(terms='prepaid-v1'), evidence text NOT NULL,"approvedBy" text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,listed boolean NOT NULL DEFAULT true);
CREATE FUNCTION billing_immutable_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(OLD)-'listed') IS DISTINCT FROM (to_jsonb(NEW)-'listed') THEN RAISE EXCEPTION 'immutable_billing_product'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER billing_immutable BEFORE UPDATE ON "BillingProduct" FOR EACH ROW EXECUTE FUNCTION billing_immutable_product();
CREATE TABLE "BillingAccount"("userId" text PRIMARY KEY REFERENCES "User" ON DELETE CASCADE,suspended boolean NOT NULL DEFAULT false);
-- Financial records retain a pseudonymous subject, independent of login/PII deletion.
CREATE TABLE "BillingOrder"(id text PRIMARY KEY,"userId" text NOT NULL,"productId" text NOT NULL REFERENCES "BillingProduct", "requestKey" text NOT NULL,"sessionId" text UNIQUE,"intentId" text UNIQUE,state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','FAILED','CANCELLED','PAID','REFUNDED','PARTIAL_REVIEW')),"refundReview" boolean NOT NULL DEFAULT false,"reviewThrough" int NOT NULL DEFAULT 0,refunded int NOT NULL DEFAULT 0 CHECK(refunded>=0),"paidAt" timestamp(3),"expiresAt" timestamp(3),"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("userId","requestKey"));
CREATE INDEX "BillingOrder_userId_createdAt_idx" ON "BillingOrder"("userId","createdAt");
CREATE TABLE "BillingReceipt"(id text PRIMARY KEY,"orderId" text NOT NULL REFERENCES "BillingOrder",kind text NOT NULL,digest text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "BillingUse"(key text PRIMARY KEY,"renderKey" text,"orderId" text NOT NULL REFERENCES "BillingOrder",feature text NOT NULL,bucket text NOT NULL CHECK(bucket IN ('regular','premium','feature')),units int NOT NULL CHECK(units>=0),state text NOT NULL CHECK(state IN ('HELD','USED','RELEASED')),"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"closedAt" timestamp(3));
-- An immutable master can consume at most one active unit across direct and broker render paths.
CREATE UNIQUE INDEX billing_render_unit ON "BillingUse"("renderKey") WHERE "renderKey" IS NOT NULL AND state<>'RELEASED';
CREATE INDEX "BillingUse_orderId_idx" ON "BillingUse"("orderId");
CREATE TABLE "ServiceTicket"(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "User" ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('SUPPORT','ERASURE')),status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','CLOSED')),subject text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "ServiceTicket_userId_updatedAt_idx" ON "ServiceTicket"("userId","updatedAt");
CREATE UNIQUE INDEX billing_one_erasure ON "ServiceTicket"("userId") WHERE kind='ERASURE' AND status<>'CLOSED';
CREATE TABLE "TicketEntry"(id text PRIMARY KEY,"ticketId" text NOT NULL REFERENCES "ServiceTicket" ON DELETE CASCADE,role text NOT NULL,status text NOT NULL,message text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "TicketEntry_ticketId_createdAt_idx" ON "TicketEntry"("ticketId","createdAt");

-- Serialize all grants, spends, revocations and suspension for one customer, not just one plan.
CREATE FUNCTION billing_lock(u text) RETURNS void LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(hashtextextended('billing:'||u,0)) $$;
CREATE FUNCTION billing_hold(u text,k text,f text,b text,rkey text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g record; need int; owned boolean:=false;
BEGIN
 IF NOT (SELECT enabled FROM "BillingControl" WHERE id='commercial' FOR SHARE) THEN RETURN; END IF;
 PERFORM billing_lock(u);
 IF EXISTS(SELECT 1 FROM "BillingAccount" WHERE "userId"=u AND suspended) THEN RAISE EXCEPTION 'billing_suspended'; END IF;
 IF rkey IS NOT NULL AND EXISTS(SELECT 1 FROM "BillingUse" WHERE "renderKey"=rkey AND state<>'RELEASED') THEN RAISE EXCEPTION 'billing_render_already_reserved'; END IF;
 IF EXISTS(SELECT 1 FROM "BillingUse" WHERE key=k) THEN RAISE EXCEPTION 'billing_key_conflict'; END IF;
 FOR g IN SELECT o.id,p.regular,p.premium,p."imageUnits",p."videoUnits" FROM "BillingOrder" o JOIN "BillingProduct" p ON p.id=o."productId" WHERE o."userId"=u AND o.state='PAID' AND NOT o."refundReview" AND o."expiresAt">clock_timestamp() AND f=ANY(p.features) ORDER BY o."expiresAt",o.id LOOP
  owned:=true; need:=CASE WHEN b='feature' THEN 0 WHEN f='media.image@1' THEN g."imageUnits" WHEN f='media.video@1' THEN g."videoUnits" ELSE 1 END;
  IF need+(SELECT coalesce(sum(units),0) FROM "BillingUse" WHERE "orderId"=g.id AND bucket=b AND state<>'RELEASED') <= (CASE WHEN b='premium' THEN g.premium ELSE g.regular END) THEN
   -- Also force a write conflict for older SERIALIZABLE snapshots (production outbox).
   UPDATE "BillingOrder" SET state=state WHERE id=g.id;
   INSERT INTO "BillingUse"(key,"orderId",feature,bucket,units,state,"renderKey") VALUES(k,g.id,f,b,need,'HELD',rkey); RETURN;
  END IF;
 END LOOP;
 IF owned THEN RAISE EXCEPTION 'billing_quota_exhausted'; ELSE RAISE EXCEPTION 'billing_plan_required'; END IF;
END $$;
CREATE FUNCTION billing_finish(k text,ok boolean) RETURNS void LANGUAGE sql AS $$ UPDATE "BillingUse" SET state=CASE WHEN ok THEN 'USED' ELSE 'RELEASED' END,"closedAt"=CURRENT_TIMESTAMP WHERE key=k AND state='HELD' $$;
-- No out-of-band counter: terminal changes commit with the immutable operation identity.
CREATE FUNCTION billing_job() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u text; f text; k text; s text;
BEGIN
 f:=CASE WHEN TG_TABLE_NAME='StudioRender' THEN 'creative.render' ELSE 'production.job' END; k:=f||':'||NEW.id; s:=coalesce(to_jsonb(NEW)->>'status',to_jsonb(NEW)->>'state');
 SELECT "userId" INTO STRICT u FROM "Project" WHERE id=NEW."projectId";
 IF TG_OP='INSERT' THEN PERFORM billing_hold(u,k,f,'regular',CASE WHEN TG_TABLE_NAME='StudioRender' THEN NEW."projectId"||':'||(to_jsonb(NEW)->>'revision') ELSE NULL END); END IF;
 IF s IN ('succeeded','failed','cancelled','canceled') THEN PERFORM billing_finish(k,s='succeeded'); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_render AFTER INSERT OR UPDATE OF state ON "StudioRender" FOR EACH ROW EXECUTE FUNCTION billing_job();
CREATE TRIGGER billing_production AFTER INSERT OR UPDATE OF status ON "ProductionJob" FOR EACH ROW EXECUTE FUNCTION billing_job();
-- Admission and first worker claim are separate boundaries. In-flight finalization remains possible.
CREATE FUNCTION billing_start_job() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u text;
BEGIN
 IF NEW.status<>'running' OR OLD.status='running' THEN RETURN NEW; END IF;
 IF NOT (SELECT enabled FROM "BillingControl" WHERE id='commercial' FOR SHARE) THEN RETURN NEW; END IF;
 SELECT "userId" INTO STRICT u FROM "Project" WHERE id=NEW."projectId";
 PERFORM billing_lock(u);
 IF EXISTS(SELECT 1 FROM "BillingAccount" WHERE "userId"=u AND suspended) OR NOT EXISTS(
 SELECT 1 FROM "ProductionJob" j JOIN "BillingUse" b ON b.key='production.job:'||j.id
 JOIN "BillingOrder" o ON o.id=b."orderId" WHERE j."jobRunId"=NEW.id AND b.state='HELD'
 AND o."userId"=u AND o.state='PAID' AND NOT o."refundReview" AND o."expiresAt">clock_timestamp()) THEN RAISE EXCEPTION 'billing_plan_required'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER billing_worker_start AFTER UPDATE OF status ON "JobRun" FOR EACH ROW EXECUTE FUNCTION billing_start_job();
COMMIT;
