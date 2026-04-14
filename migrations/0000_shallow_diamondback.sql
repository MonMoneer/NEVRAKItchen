CREATE TABLE "admin_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT 'NIVRA Kitchen' NOT NULL,
	"logo_url" text DEFAULT '',
	"primary_color" text DEFAULT '#2563eb' NOT NULL,
	"footer_text" text DEFAULT 'NIVRA Kitchen - Professional Kitchen Design' NOT NULL,
	"grid_enabled" boolean DEFAULT true NOT NULL,
	"midpoint_enabled" boolean DEFAULT true NOT NULL,
	"snap_radius" integer DEFAULT 12 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "depth_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"cabinet_type" text NOT NULL,
	"value" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "element_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"default_width" integer DEFAULT 60 NOT NULL,
	"default_depth" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finishing_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"multiplier" numeric(4, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "height_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"cabinet_type" text NOT NULL,
	"value" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"cabinet_type" text NOT NULL,
	"depth" integer NOT NULL,
	"height" integer NOT NULL,
	"price_per_unit" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_type" text NOT NULL,
	"price_per_meter" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_data" text NOT NULL,
	"file_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"client_phone" text DEFAULT '' NOT NULL,
	"client_email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT 'estimated_price' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"selected_finishing" text DEFAULT '1',
	"project_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"assigned_to" integer
);
--> statement-breakpoint
CREATE TABLE "space_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"space_id" integer NOT NULL,
	"data" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'kitchen' NOT NULL,
	"canvas_data" jsonb,
	"site_measurement_data" jsonb,
	"finishing" text DEFAULT '1',
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"reference_image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'sales' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wall_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"space_id" integer NOT NULL,
	"type" text NOT NULL,
	"wall_id" text DEFAULT '' NOT NULL,
	"distance_cm" integer DEFAULT 0 NOT NULL,
	"height_cm" integer DEFAULT 0 NOT NULL,
	"photo" text DEFAULT '',
	"note" text DEFAULT '' NOT NULL,
	"pos_x" integer DEFAULT 0 NOT NULL,
	"pos_y" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_project_id_saved_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saved_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_projects" ADD CONSTRAINT "saved_projects_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_photos" ADD CONSTRAINT "space_photos_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_project_id_saved_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."saved_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_points" ADD CONSTRAINT "wall_points_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;