-- Cursos como entidad (audiencia de documentos), tokens de cuenta (invitación / recuperación),
-- outbox de correos transaccionales y bitácora de auditoría.
-- Backfill: cada curso distinto de students.course pasa a la tabla courses.

-- CreateEnum
CREATE TYPE "AccountTokenPurpose" AS ENUM ('reset', 'invite');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- Backfill: un curso por cada (colegio, nombre) existente.
INSERT INTO "courses" ("id", "school_id", "name")
SELECT gen_random_uuid(), "school_id", "course"
FROM (SELECT DISTINCT "school_id", "course" FROM "students") AS existing;

ALTER TABLE "students" ADD COLUMN "course_id" UUID;
UPDATE "students" s SET "course_id" = c."id"
FROM "courses" c
WHERE c."school_id" = s."school_id" AND c."name" = s."course";
ALTER TABLE "students" ALTER COLUMN "course_id" SET NOT NULL;

DROP INDEX "students_school_id_course_idx";
ALTER TABLE "students" DROP COLUMN "course";

-- CreateTable
CREATE TABLE "document_courses" (
    "document_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,

    CONSTRAINT "document_courses_pkey" PRIMARY KEY ("document_id","course_id")
);

-- CreateTable
CREATE TABLE "account_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "school_id" UUID,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_emails" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "school_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_school_id_name_key" ON "courses"("school_id", "name");
CREATE INDEX "document_courses_course_id_idx" ON "document_courses"("course_id");
CREATE UNIQUE INDEX "account_tokens_token_hash_key" ON "account_tokens"("token_hash");
CREATE INDEX "account_tokens_user_id_idx" ON "account_tokens"("user_id");
CREATE INDEX "outbound_emails_status_next_attempt_at_idx" ON "outbound_emails"("status", "next_attempt_at");
CREATE INDEX "audit_events_school_id_created_at_idx" ON "audit_events"("school_id", "created_at");
CREATE INDEX "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");
CREATE INDEX "students_course_id_idx" ON "students"("course_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_courses" ADD CONSTRAINT "document_courses_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_courses" ADD CONSTRAINT "document_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
