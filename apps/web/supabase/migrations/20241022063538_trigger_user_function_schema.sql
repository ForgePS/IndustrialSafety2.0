set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql
SET search_path TO '' AS $function$ BEGIN
INSERT INTO public.users (user_id, name, email, role_id)
VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'name',
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), '2')::int
  );
RAISE NOTICE 'User (%) has been added in the public.user table',
NEW.email;
RETURN NEW;
END;
$function$;
