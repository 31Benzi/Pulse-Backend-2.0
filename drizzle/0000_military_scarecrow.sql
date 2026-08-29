CREATE TABLE IF NOT EXISTS "banned_ips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"reason" text,
	"banned_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "banned_ips_ip_unique" UNIQUE("ip")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_auths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"account_id" text NOT NULL,
	"secret" text NOT NULL,
	"user_agent" text,
	"location" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"accepted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incoming" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outgoing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "friends_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_shop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matchmaking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"session_id" text NOT NULL,
	"playlist" text NOT NULL,
	"region" text NOT NULL,
	"build_unique_id" text NOT NULL,
	"ip" text,
	"port" integer,
	CONSTRAINT "matchmaking_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"profiles" jsonb NOT NULL,
	CONSTRAINT "profiles_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"matchmaking_id" text NOT NULL,
	"is_server" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"arena_division" integer DEFAULT 1 NOT NULL,
	"arena_hype" integer DEFAULT 0 NOT NULL,
	"last_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_auths" ADD CONSTRAINT "device_auths_account_id_users_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("account_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "friends" ADD CONSTRAINT "friends_account_id_users_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("account_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matchmaking" ADD CONSTRAINT "matchmaking_account_id_users_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("account_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_users_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("account_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tokens" ADD CONSTRAINT "tokens_account_id_users_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("account_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
