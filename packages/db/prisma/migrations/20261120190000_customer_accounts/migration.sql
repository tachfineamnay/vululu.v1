ALTER TABLE "User" ADD COLUMN "selfRegisteredAt" TIMESTAMP(3);

CREATE TABLE "AccountToken" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "purpose" TEXT NOT NULL CHECK ("purpose" IN ('verify', 'reset')),
    "email" TEXT NOT NULL,
    "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE,
    "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AccountToken_email_purpose_idx" ON "AccountToken"("email", "purpose");
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");
CREATE INDEX "AccountToken_userId_idx" ON "AccountToken"("userId");

-- Case-insensitive literal equality without changing historical uniqueness.
CREATE INDEX "User_email_lower_idx" ON "User" (lower("email"));
CREATE INDEX "Invitation_email_lower_idx" ON "Invitation" (lower("email"));
