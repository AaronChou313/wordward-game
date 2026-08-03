-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'NORMAL', 'HARD', 'ENDLESS');

-- CreateTable
CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "username" VARCHAR(24) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "merit_total" INTEGER NOT NULL DEFAULT 0,
  "merit_reached_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "profiles" (
  "user_id" TEXT NOT NULL,
  "nickname" VARCHAR(24) NOT NULL,
  "avatar_url" VARCHAR(2048),
  "bio" VARCHAR(200) NOT NULL DEFAULT '',
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "game_saves" (
  "user_id" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "game_saves_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "merit_claims" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "difficulty" "Difficulty" NOT NULL,
  "endless_floor" INTEGER NOT NULL DEFAULT 1,
  "boss_wave" INTEGER NOT NULL,
  "merit" INTEGER NOT NULL,
  "run_id" VARCHAR(64) NOT NULL,
  "seed" VARCHAR(128) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3) NOT NULL,
  "summary" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merit_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "merit_run_checkpoints" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "run_id" VARCHAR(64) NOT NULL,
  "difficulty" "Difficulty" NOT NULL,
  "endless_floor" INTEGER NOT NULL DEFAULT 1,
  "seed" VARCHAR(128) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "last_boss_wave" INTEGER NOT NULL,
  "last_finished_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merit_run_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_merit_total_merit_reached_at_idx" ON "users"("merit_total" DESC, "merit_reached_at" ASC);
CREATE INDEX "merit_claims_user_id_difficulty_boss_wave_idx" ON "merit_claims"("user_id", "difficulty", "boss_wave");
CREATE INDEX "merit_claims_user_id_run_id_idx" ON "merit_claims"("user_id", "run_id");
CREATE INDEX "merit_claims_user_id_created_at_idx" ON "merit_claims"("user_id", "created_at");
CREATE UNIQUE INDEX "merit_claims_user_id_difficulty_endless_floor_boss_wave_key" ON "merit_claims"("user_id", "difficulty", "endless_floor", "boss_wave");
CREATE INDEX "merit_run_checkpoints_user_id_updated_at_idx" ON "merit_run_checkpoints"("user_id", "updated_at");
CREATE UNIQUE INDEX "merit_run_checkpoints_user_id_run_id_key" ON "merit_run_checkpoints"("user_id", "run_id");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_saves" ADD CONSTRAINT "game_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merit_claims" ADD CONSTRAINT "merit_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merit_run_checkpoints" ADD CONSTRAINT "merit_run_checkpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
