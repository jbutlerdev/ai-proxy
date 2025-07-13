-- Migration: Add upstream servers and models tables
-- Created: 2025-07-12

CREATE TABLE IF NOT EXISTS "upstream_servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"api_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"description" text,
	"headers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "upstream_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"upstream_server_id" integer NOT NULL,
	"model_id" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"capabilities" jsonb,
	"pricing" jsonb,
	"last_synced" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "upstream_servers_name_idx" ON "upstream_servers" ("name");
CREATE INDEX IF NOT EXISTS "upstream_models_server_idx" ON "upstream_models" ("upstream_server_id");
CREATE INDEX IF NOT EXISTS "upstream_models_model_id_idx" ON "upstream_models" ("model_id");
CREATE INDEX IF NOT EXISTS "upstream_models_enabled_idx" ON "upstream_models" ("enabled");

-- Create unique constraint for enabled models to prevent conflicts
CREATE UNIQUE INDEX IF NOT EXISTS "unique_enabled_model_idx" ON "upstream_models" ("display_name") WHERE "enabled" = true;

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "upstream_models" ADD CONSTRAINT "upstream_models_upstream_server_id_upstream_servers_id_fk" FOREIGN KEY ("upstream_server_id") REFERENCES "upstream_servers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;