-- Les messages historiques gardent leur contenu ; seules les nouvelles propositions sont structurées.
ALTER TABLE "Message" ADD COLUMN "proposal" JSONB;
