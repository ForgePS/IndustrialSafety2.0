-- Inserting data into the auth.users table
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    is_anonymous
  )
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'b4f0bc91-7da1-49f9-93fc-61267a286311',
    'authenticated',
    'authenticated',
    'admin@jetship.com',
    '$2a$10$0OEgz6NqZR/va3LFCNyWKukJHMClq9xHygxT5KtzC9sHX8WCHswBu',
    '2024-09-06 12:51:05.127533+00',
    NULL,
    '',
    '2024-09-06 12:50:57.662781+00',
    '',
    NULL,
    '',
    '',
    NULL,
    '2024-09-06 12:51:05.132539+00',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "b4f0bc91-7da1-49f9-93fc-61267a286311", "name": "admin", "email": "admin@jetship.com", "email_verified": false, "phone_verified": false}',
    NULL,
    '2024-09-06 12:50:57.59149+00',
    '2024-09-06 12:51:05.138132+00',
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bd3baa93-5635-48c7-88bb-4554f5d2d18b',
    'authenticated',
    'authenticated',
    'user@jetship.com',
    '$2a$10$H2aSXXFbo3doNqQZrpXCyu3frCO6qDTTwcDaOYo5IIVJrCW3p/ws2',
    '2024-09-06 12:02:18.272764+00',
    NULL,
    '',
    '2024-09-06 12:02:02.771488+00',
    '',
    NULL,
    '',
    '',
    NULL,
    '2024-09-06 12:02:18.285089+00',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "bd3baa93-5635-48c7-88bb-4554f5d2d18b", "name": "user", "email": "user@jetship.com", "email_verified": false, "phone_verified": false}',
    NULL,
    '2024-09-06 12:02:02.759585+00',
    '2024-09-06 12:02:18.289192+00',
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd0339e22-19f3-40cd-9844-b10d124ef301',
    'authenticated',
    'authenticated',
    'editor@jetship.com',
    '$2a$10$hdp6p4Ku3C5aPBkWDGkdYu1hAhPT2rDjGfRCz9l/wtnIgozIMvKOa',
    '2024-09-06 12:01:11.328815+00',
    NULL,
    '',
    '2024-09-06 12:00:53.246404+00',
    '',
    NULL,
    '',
    '',
    NULL,
    '2024-09-06 12:01:11.332127+00',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "d0339e22-19f3-40cd-9844-b10d124ef301", "name": "editor", "email": "editor@jetship.com", "email_verified": false, "phone_verified": false}',
    NULL,
    '2024-09-06 12:00:53.225679+00',
    '2024-09-06 12:01:11.33647+00',
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL,
    false
  );
-- Inserting data into the auth.identities table
INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    id
  )
VALUES (
    'b4f0bc91-7da1-49f9-93fc-61267a286311',
    'b4f0bc91-7da1-49f9-93fc-61267a286311',
    '{"sub": "b4f0bc91-7da1-49f9-93fc-61267a286311", "name": "admin", "email": "admin@jetship.com", "email_verified": false, "phone_verified": false}',
    'email',
    '2024-09-06 12:50:57.64298+00',
    '2024-09-06 12:50:57.64301+00',
    '2024-09-06 12:50:57.64301+00',
    'a54dee2d-3127-4bac-abfe-4ac945221036'
  ),
  (
    'bd3baa93-5635-48c7-88bb-4554f5d2d18b',
    'bd3baa93-5635-48c7-88bb-4554f5d2d18b',
    '{"sub": "bd3baa93-5635-48c7-88bb-4554f5d2d18b", "name": "user", "email": "user@jetship.com", "email_verified": false, "phone_verified": false}',
    'email',
    '2024-09-06 12:02:02.766408+00',
    '2024-09-06 12:02:02.766697+00',
    '2024-09-06 12:02:02.766697+00',
    '712eb358-41b7-4b73-bc77-7d9c5968a08b'
  ),
  (
    'd0339e22-19f3-40cd-9844-b10d124ef301',
    'd0339e22-19f3-40cd-9844-b10d124ef301',
    '{"sub": "d0339e22-19f3-40cd-9844-b10d124ef301", "name": "editor", "email": "editor@jetship.com", "email_verified": false, "phone_verified": false}',
    'email',
    '2024-09-06 12:00:53.237137+00',
    '2024-09-06 12:00:53.23734+00',
    '2024-09-06 12:00:53.23734+00',
    'c64213a4-6add-4ddb-9bd2-7e69b7b117c9'
  );
-- The handle_new_user function will be called whenever a new row is inserted into the auth.users table.
create trigger on_auth_user_created
after
insert on auth.users for each row execute function handle_new_user();
-- The handle_update_user function will be called whenever a row is updated in the auth.users table.
create trigger on_auth_user_updated
after
update on auth.users for each row
  when (
    OLD.raw_user_meta_data->>'email' IS DISTINCT
    FROM NEW.raw_user_meta_data->>'email'
      OR OLD.raw_user_meta_data->>'name' IS DISTINCT
    FROM NEW.raw_user_meta_data->>'name'
  ) execute function handle_update_user();
-- Inserting data into the roles table
INSERT INTO public.roles (id, role)
VALUES (1, 'admin'),
  (2, 'user'),
  (3, 'editor');
-- Inserting data into the permissions table
INSERT INTO public.permissions (id, permission)
VALUES (1, 'create_reviews'),
  (2, 'create_blog_section'),
  (3, 'create_users'),
  (4, 'create_permission'),
  (5, 'create_roles'),
  (6, 'view_reviews'),
  (7, 'view_blog_section'),
  (8, 'view_users'),
  (9, 'view_permission'),
  (10, 'view_roles'),
  (11, 'update_reviews'),
  (12, 'update_settings'),
  (13, 'update_blog_section'),
  (14, 'update_users'),
  (15, 'update_permission'),
  (16, 'update_roles'),
  (17, 'delete_reviews'),
  (18, 'delete_blog_section'),
  (19, 'delete_users'),
  (20, 'delete_permission'),
  (21, 'delete_roles'),
  (22, 'impersonate_users');
-- Inserting data into the role_permissions table
INSERT INTO public.role_permissions (id, role_id, permission_id)
VALUES (1, 1, 1),
  (2, 1, 2),
  (3, 1, 3),
  (4, 1, 4),
  (5, 1, 5),
  (6, 1, 6),
  (7, 1, 7),
  (8, 1, 8),
  (9, 1, 9),
  (10, 1, 10),
  (11, 1, 11),
  (12, 1, 12),
  (13, 1, 13),
  (14, 1, 14),
  (15, 1, 15),
  (16, 1, 16),
  (17, 1, 17),
  (18, 1, 18),
  (19, 1, 19),
  (20, 1, 20),
  (21, 1, 21),
  (22, 1, 22),
  (23, 3, 1),
  (24, 3, 6),
  (25, 3, 11),
  (26, 3, 17);
-- Inserting data into the users table
INSERT INTO public.users (user_id, name, email)
VALUES (
    'b4f0bc91-7da1-49f9-93fc-61267a286311',
    'admin',
    'admin@jetship.com'
  ),
  (
    'bd3baa93-5635-48c7-88bb-4554f5d2d18b',
    'user',
    'user@jetship.com'
  ),
  (
    'd0339e22-19f3-40cd-9844-b10d124ef301',
    'editor',
    'editor@jetship.com'
  );
-- Empty the user_roles table
TRUNCATE TABLE public.user_roles;
-- Inserting data into the user_roles table
INSERT INTO public.user_roles (user_id, role_id)
VALUES (1, 1),
  (2, 2),
  (3, 3);
-- Inserting data into the settings_configuration table
INSERT INTO public.settings_configuration (id, key, value)
VALUES (
    1,
    'general_settings',
    '{"application":{"site_name":"ChatFlow AI","title":"Demo: %s | ChatFlow AI - NextJS Boilerplate PRO","support_email":"hello.themeselection@gmail.com","description":"Automate customer support with ChatFlow AI. Boost satisfaction, resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution."},"tracking":{"google_tag_manager":"","providers":[{"name":"Google Analytics","snippet":""},{"name":"Post Hog","snippet":""},{"name":"Chatbot","snippet":""}]},"social_links":[{"title":"facebook","icon":"TbBrandFacebook","url":"https://www.facebook.com/ThemeSelections"},{"title":"x","icon":"TbBrandX","url":"https://twitter.com/Theme_Selection"},{"title":"linkedin","icon":"TbBrandLinkedin","url":"https://www.linkedin.com/company/themeselection"},{"title":"instagram","icon":"TbBrandInstagram","url":"https://www.instagram.com/themeselection"},{"title":"youtube","icon":"TbBrandYoutube","url":"https://www.youtube.com/channel/UCuryo5s0CW4aP83itLjIdZg"},{"title":"github","icon":"TbBrandGithub","url":"https://github.com/themeselection"}],"pages_components":{"blog_enabled":true},"share_this_enabled":true}'
  ),
  (2, 'payment_provider', 'stripe');
