-- BETA01 : un retour de bêta est un dossier d'assistance typé, distinct d'un
-- incident de facturation. La contrainte initiale n'autorisait que SUPPORT et
-- ERASURE, ce qui faisait échouer la création d'un ticket BETA_FEEDBACK (500).
ALTER TABLE "ServiceTicket" DROP CONSTRAINT "ServiceTicket_kind_check";
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_kind_check"
  CHECK (kind IN ('SUPPORT','ERASURE','BETA_FEEDBACK'));
