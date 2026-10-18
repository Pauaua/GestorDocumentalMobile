-- Multi-tenant: colegios (schools), redes (organizations), membresías por colegio y superadmin de plataforma.
-- Si la base ya tiene datos, se crea el colegio "principal" y todo lo existente queda asignado a él.

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('basico', 'estandar', 'red');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rut" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rbd" TEXT,
    "organization_id" UUID,
    "plan" "Plan" NOT NULL DEFAULT 'basico',
    "primary_color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "user_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id","school_id")
);

-- CreateTable
CREATE TABLE "organization_admins" (
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_admins_pkey" PRIMARY KEY ("user_id","organization_id")
);

-- Backfill: colegio por defecto para los datos existentes (solo si hay datos).
INSERT INTO "schools" ("id", "slug", "name")
SELECT gen_random_uuid(), 'principal', 'Colegio principal'
WHERE EXISTS (SELECT 1 FROM "users") OR EXISTS (SELECT 1 FROM "documents") OR EXISTS (SELECT 1 FROM "students");

-- El rol y el estado de cada usuario pasan a su membresía en el colegio por defecto.
INSERT INTO "memberships" ("user_id", "school_id", "role", "is_active", "created_at")
SELECT u."id", s."id", u."role", u."is_active", u."created_at"
FROM "users" u CROSS JOIN "schools" s
WHERE s."slug" = 'principal';

-- AlterTable: documents y students pertenecen a un colegio.
ALTER TABLE "documents" ADD COLUMN "school_id" UUID;
UPDATE "documents" SET "school_id" = (SELECT "id" FROM "schools" WHERE "slug" = 'principal');
ALTER TABLE "documents" ALTER COLUMN "school_id" SET NOT NULL;

ALTER TABLE "students" ADD COLUMN "school_id" UUID;
UPDATE "students" SET "school_id" = (SELECT "id" FROM "schools" WHERE "slug" = 'principal');
ALTER TABLE "students" ALTER COLUMN "school_id" SET NOT NULL;

-- Las sesiones anteriores no tienen colegio: se revocan (los usuarios vuelven a iniciar sesión).
ALTER TABLE "refresh_tokens" ADD COLUMN "school_id" UUID;
UPDATE "refresh_tokens" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "revoked_at" IS NULL;

-- DropIndex
DROP INDEX "users_role_idx";
DROP INDEX "documents_document_date_idx";
DROP INDEX "documents_status_is_deleted_idx";
DROP INDEX "students_rut_key";
DROP INDEX "students_course_idx";

-- AlterTable: el rol ya no es global.
ALTER TABLE "users" DROP COLUMN "role",
ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_rut_key" ON "organizations"("rut");
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");
CREATE UNIQUE INDEX "schools_rbd_key" ON "schools"("rbd");
CREATE INDEX "schools_organization_id_idx" ON "schools"("organization_id");
CREATE INDEX "memberships_school_id_role_idx" ON "memberships"("school_id", "role");
CREATE INDEX "organization_admins_organization_id_idx" ON "organization_admins"("organization_id");
CREATE INDEX "documents_school_id_status_is_deleted_idx" ON "documents"("school_id", "status", "is_deleted");
CREATE INDEX "documents_school_id_document_date_idx" ON "documents"("school_id", "document_date");
CREATE INDEX "students_school_id_course_idx" ON "students"("school_id", "course");
CREATE UNIQUE INDEX "students_school_id_rut_key" ON "students"("school_id", "rut");

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_admins" ADD CONSTRAINT "organization_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_admins" ADD CONSTRAINT "organization_admins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
