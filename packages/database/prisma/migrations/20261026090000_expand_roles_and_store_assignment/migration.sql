-- AlterEnum
-- Expand Role from ADMIN/STAFF to the four TOR roles. Existing rows are remapped first so the
-- enum swap cannot fail on obsolete values (ADMIN -> ADMINISTRATOR, STAFF -> STORE_EMPLOYEE).
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMINISTRATOR', 'PURCHASING_OFFICER', 'STORE_EMPLOYEE', 'MANAGER');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'ADMINISTRATOR'
    WHEN 'STAFF' THEN 'STORE_EMPLOYEE'
    ELSE "role"::text
  END::"Role_new"
);
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STORE_EMPLOYEE';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "storeId" TEXT,
ALTER COLUMN "role" SET DEFAULT 'STORE_EMPLOYEE';
