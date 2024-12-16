alter table "public"."billing" drop constraint "billing_pkey";
drop index if exists "public"."billing_pkey";
alter table "public"."billing"
add column "currency" character varying;
alter table "public"."billing"
add column "interval" character varying;
alter table "public"."billing"
add column "plan_variant" character varying not null;
alter table "public"."billing"
alter column "order_id"
set not null;
CREATE UNIQUE INDEX billing_pkey ON public.billing USING btree (user_id, order_id);
alter table "public"."billing"
add constraint "billing_pkey" PRIMARY KEY using index "billing_pkey";
