alter table "public"."faqs" drop constraint "faq_category_id_fkey";

alter table "public"."faqs" drop column "categoryId";

alter table "public"."faqs" drop column "isFeatured";

alter table "public"."faqs" add column "category_id" bigint;

alter table "public"."faqs" add column "is_featured" boolean not null;

alter table "public"."reviews" drop column "avatarImage";

alter table "public"."reviews" drop column "isFeatured";

alter table "public"."reviews" drop column "videoUrl";

alter table "public"."reviews" add column "avatar_image" character varying;

alter table "public"."reviews" add column "is_featured" boolean not null;

alter table "public"."reviews" add column "video_url" character varying;

alter table "public"."faqs" add constraint "faq_category_id_fkey" FOREIGN KEY (category_id) REFERENCES faq_categories(id) ON DELETE SET NULL not valid;

alter table "public"."faqs" validate constraint "faq_category_id_fkey";


