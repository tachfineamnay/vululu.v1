BEGIN;
ALTER TABLE "BillingControl" ADD COLUMN mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live'));
ALTER TABLE "BillingControl" ADD CONSTRAINT billing_control_live_enabled CHECK (mode<>'live' OR enabled);
ALTER TABLE "BillingProduct" ADD COLUMN mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live'));
ALTER TABLE "BillingOrder" ADD COLUMN mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test','live')),
  ADD COLUMN "stripeAccount" TEXT,
  ADD CONSTRAINT billing_order_account_mode CHECK ((mode='test' AND "stripeAccount" IS NULL) OR (mode='live' AND "stripeAccount" IS NOT NULL AND "stripeAccount" ~ '^acct_[A-Za-z0-9]+$'));
ALTER TABLE "BillingProduct" ADD CONSTRAINT billing_product_identity_mode UNIQUE(id,mode);
ALTER TABLE "BillingOrder" DROP CONSTRAINT "BillingOrder_productId_fkey",
  ADD CONSTRAINT billing_order_product_mode FOREIGN KEY ("productId",mode) REFERENCES "BillingProduct"(id,mode) ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE FUNCTION billing_guard_mode() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='BillingOrder' THEN
   IF (OLD.mode,OLD."stripeAccount") IS DISTINCT FROM (NEW.mode,NEW."stripeAccount") THEN RAISE EXCEPTION 'immutable_billing_mode'; END IF;
 ELSIF OLD.mode='live' AND (NEW.mode<>'live' OR NOT NEW.enabled) THEN
   RAISE EXCEPTION 'live_billing_requires_forward_only_control';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER billing_order_mode_guard BEFORE UPDATE ON "BillingOrder" FOR EACH ROW EXECUTE FUNCTION billing_guard_mode();
CREATE TRIGGER billing_control_mode_guard BEFORE UPDATE ON "BillingControl" FOR EACH ROW EXECUTE FUNCTION billing_guard_mode();
CREATE OR REPLACE FUNCTION billing_hold(u text,k text,f text,b text,rkey text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE g record; need int; owned boolean:=false; active_mode text;
BEGIN
 SELECT mode INTO active_mode FROM "BillingControl" WHERE id='commercial' AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM billing_lock(u);
 IF EXISTS(SELECT 1 FROM "BillingAccount" WHERE "userId"=u AND suspended) THEN RAISE EXCEPTION 'billing_suspended'; END IF;
 IF rkey IS NOT NULL AND EXISTS(SELECT 1 FROM "BillingUse" WHERE "renderKey"=rkey AND state<>'RELEASED') THEN RAISE EXCEPTION 'billing_render_already_reserved'; END IF;
 IF EXISTS(SELECT 1 FROM "BillingUse" WHERE key=k) THEN RAISE EXCEPTION 'billing_key_conflict'; END IF;
 FOR g IN SELECT o.id,p.regular,p.premium,p."imageUnits",p."videoUnits" FROM "BillingOrder" o JOIN "BillingProduct" p ON p.id=o."productId" WHERE o."userId"=u AND o.mode=active_mode AND p.mode=active_mode AND o.state='PAID' AND NOT o."refundReview" AND o."expiresAt">clock_timestamp() AND f=ANY(p.features) ORDER BY o."expiresAt",o.id LOOP
  owned:=true; need:=CASE WHEN b='feature' THEN 0 WHEN f='media.image@1' THEN g."imageUnits" WHEN f='media.video@1' THEN g."videoUnits" ELSE 1 END;
  IF need+(SELECT coalesce(sum(units),0) FROM "BillingUse" WHERE "orderId"=g.id AND bucket=b AND state<>'RELEASED') <= (CASE WHEN b='premium' THEN g.premium ELSE g.regular END) THEN
   -- Also force a write conflict for older SERIALIZABLE snapshots (production outbox).
   UPDATE "BillingOrder" SET state=state WHERE id=g.id;
   INSERT INTO "BillingUse"(key,"orderId",feature,bucket,units,state,"renderKey") VALUES(k,g.id,f,b,need,'HELD',rkey); RETURN;
  END IF;
 END LOOP;
 IF owned THEN RAISE EXCEPTION 'billing_quota_exhausted'; ELSE RAISE EXCEPTION 'billing_plan_required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION billing_start_job() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u text; active_mode text;
BEGIN
 IF NEW.status<>'running' OR OLD.status='running' THEN RETURN NEW; END IF;
 SELECT mode INTO active_mode FROM "BillingControl" WHERE id='commercial' AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT "userId" INTO STRICT u FROM "Project" WHERE id=NEW."projectId";
 PERFORM billing_lock(u);
 IF EXISTS(SELECT 1 FROM "BillingAccount" WHERE "userId"=u AND suspended) OR NOT EXISTS(
 SELECT 1 FROM "ProductionJob" j JOIN "BillingUse" b ON b.key='production.job:'||j.id
 JOIN "BillingOrder" o ON o.id=b."orderId" WHERE j."jobRunId"=NEW.id AND b.state='HELD'
 AND o.mode=active_mode AND o."userId"=u AND o.state='PAID' AND NOT o."refundReview" AND o."expiresAt">clock_timestamp()) THEN RAISE EXCEPTION 'billing_plan_required'; END IF;
 RETURN NEW; END $$;
COMMIT;
