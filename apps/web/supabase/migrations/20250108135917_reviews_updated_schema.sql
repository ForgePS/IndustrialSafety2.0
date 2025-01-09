alter table "public"."reviews" drop column "platform";

alter table "public"."reviews" add column "platform_id" bigint;

drop type "public"."reviews_platform_enum";

alter table "public"."reviews" add constraint "reviews_platform_id_fkey" FOREIGN KEY (platform_id) REFERENCES review_platforms(id) ON DELETE SET NULL not valid;

alter table "public"."reviews" validate constraint "reviews_platform_id_fkey";


