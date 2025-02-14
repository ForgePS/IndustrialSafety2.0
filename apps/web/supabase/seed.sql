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
-- Inserting data into the roles table with hierarchy values
INSERT INTO public.roles (role, hierarchy)
VALUES ('admin', 1),
  ('user', 3),
  ('editor', 2) ON CONFLICT (id) DO
UPDATE
SET hierarchy = EXCLUDED.hierarchy;
-- Inserting data into the permissions table
INSERT INTO public.permissions (permission)
VALUES ('create_reviews'),
  ('create_users'),
  ('create_permission'),
  ('create_roles'),
  ('create_faqs'),
  ('view_reviews'),
  ('view_settings'),
  ('view_users'),
  ('view_permission'),
  ('view_roles'),
  ('view_faqs'),
  ('update_reviews'),
  ('update_settings'),
  ('update_users'),
  ('update_permission'),
  ('update_roles'),
  ('update_faqs'),
  ('delete_reviews'),
  ('delete_users'),
  ('delete_permission'),
  ('delete_roles'),
  ('delete_faqs'),
  ('impersonate_users'),
  ('manage_blog_section');
-- Inserting data into the role_permissions table
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id,
  p.id
FROM public.roles r
  CROSS JOIN public.permissions p
WHERE (r.role = 'admin')
  OR (
    r.role = 'editor'
    AND p.permission IN (
      'create_reviews',
      'view_reviews',
      'update_reviews',
      'delete_reviews'
    )
  ) ON CONFLICT DO NOTHING;
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
INSERT INTO public.settings_configuration (key, value)
VALUES (
    'general_settings',
    '{"application":{"site_name":"ChatFlow AI","title":"%s | ChatFlow AI - Next.js Boilerplate PRO - Tailwind CSS + Shadcn","support_email":"hello.themeselection@gmail.com","description":"Automate customer support with ChatFlow AI. Resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution."},"tracking":{"google_tag_manager":"","providers":[{"name":"Google Analytics","snippet":""},{"name":"Post Hog","snippet":""},{"name":"Chatbot","snippet":""}]},"social_links":[{"title":"facebook","icon":"TbBrandFacebook","url":"https://www.facebook.com/ThemeSelections"},{"title":"x","icon":"TbBrandX","url":"https://x.com/Theme_Selection"},{"title":"linkedin","icon":"TbBrandLinkedin","url":"https://www.linkedin.com/company/themeselection"},{"title":"instagram","icon":"TbBrandInstagram","url":"https://www.instagram.com/themeselection"},{"title":"youtube","icon":"TbBrandYoutube","url":"https://www.youtube.com/channel/UCuryo5s0CW4aP83itLjIdZg"},{"title":"github","icon":"TbBrandGithub","url":"https://github.com/themeselection"}],"pages_components":{"blog_enabled":true},"share_this_enabled":true}'
  ),
  ('payment_provider', 'stripe');
-- Inserting data into the review_platforms table
INSERT INTO public.review_platforms (logo_url, platform_name, slug)
VALUES ('', 'twitter', 'twitter'),
  ('', 'trustpilot', 'trustpilot'),
  ('', 'g2', 'g2');
-- Inserting data into the reviews table
INSERT INTO public.reviews (
    username,
    rating,
    content,
    designation,
    country,
    title,
    link,
    review_url,
    is_featured,
    video_url,
    platform_id
  )
VALUES (
    'Sarah M',
    5,
    'ChatFlow has been a game-changer for our customer service team. The AI chatbot handles most inquiries with ease, and the analytics provide incredible insights into customer needs. Highly recommended for startups looking to scale their support efficiently!',
    'CEO',
    'UK',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Sara L',
    5,
    'I can''t believe how quickly we managed to integrate ChatFlow into our website. The AI took only a few hours of training, and now it''s handling customer questions 24/7. The seamless integration with our CRM is a huge plus!',
    'CEO',
    'US',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Alex P',
    5,
    'The customization options are great, and the platform''s flexibility allows us to tweak the chatbot''s responses to suit our needs. The only downside is the occasional delay in real-time updates, but overall, it''s been a solid investment for our e-commerce business.',
    'CTO',
    'US',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Carlos G',
    5,
    'It''s been great overall! The chatbot has reduced our manual work significantly, although I do wish it could handle some more complex inquiries without needing human intervention. Still, it''s a huge time-saver.',
    'Manager',
    'BR',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Deepak R',
    5,
    'I can''t believe how quickly we managed to integrate ChatFlow into our website. The AI took only a few hours of training, and now it''s handling customer questions 24/7.The seamless integration with our CRM is a huge plus!',
    'VP',
    'IN',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Rajesh K',
    5,
    'The customization options are great, and the platform''s flexibility allows us to tweak the chatbot''s responses to suit our needs. The only downside is the occasional delay in real-time updates, but overall, it''s been a solid investment for our e-commerce business.',
    'VP',
    'IN',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Anna K',
    5,
    'The sentiment analysis feature really helps us understand how our customers feel about our service. It''s like having a support team that never sleeps. The support from ChatFlow''s team has been stellar as well.',
    'CTO',
    'DE',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  ),
  (
    'Lily T',
    5,
    'ChatFlow has been a game-changer for our customer service team. The AI chatbot handles most inquiries with ease, and the analytics provide incredible insights into customer needs. Highly recommended for startups looking to scale their support efficiently!',
    'CEO',
    'UK',
    NULL,
    '#',
    '',
    true,
    NULL,
    NULL
  );
-- Inserting data into the faq_categories table
INSERT INTO public.faq_categories (title, icon)
VALUES ('Getting Started', 'TbRocket'),
  ('Technical Details', 'TbDeviceLaptop'),
  ('Licensing and Support', 'TbLifebuoy'),
  ('Additional', 'TbLayoutGridAdd');
-- Inserting data into the faqs table
INSERT INTO public.faqs (title, description, category_id, is_featured)
VALUES (
    'What is Chatflow AI, and how does it benefit my business?',
    '<p>Chatflow AI is an AI-powered customer support chatbot that automates responses to common queries, provides personalized assistance, and enhances customer engagement, helping you save time and improve satisfaction.</p>',
    1,
    true
  ),
  (
    'Is there a demo available?',
    '<p>Yes, you can try out a live demo to explore how Chatflow AI works before making a purchase.</p>',
    1,
    true
  ),
  (
    'What platforms does Chatflow AI support?',
    '<p>Chatflow AI integrates with various platforms including websites, messaging apps, and CRMs.</p>',
    1,
    true
  ),
  (
    'Do I need technical expertise to set up Chatflow AI?',
    '<p>Chatflow AI is designed to be user-friendly, so no coding or technical expertise is required to get started.</p>',
    1,
    false
  ),
  (
    'How does Chatflow AI handle customer queries?',
    '<p>Chatflow AI uses advanced natural language processing to understand and respond to customer queries in real-time.</p>',
    2,
    true
  ),
  (
    'Can I customize Chatflow AI for my specific industry?',
    '<p>Yes, Chatflow AI can be customized to fit your industry needs, offering tailored responses and behavior.</p>',
    2,
    false
  ),
  (
    'How does the AI learn and improve over time?',
    '<p>Chatflow AI continuously learns from interactions using machine learning algorithms to improve accuracy and response relevance.</p>',
    2,
    true
  ),
  (
    'What are the system requirements for running Chatflow AI?',
    '<p>Minimal system resources are required as Chatflow AI operates in the cloud, ensuring high performance.</p>',
    2,
    false
  ),
  (
    'What pricing plans are available?',
    '<p>Chatflow AI offers three pricing tiers: Starter, Professional, and Enterprise, each with different features and storage capacities.</p>',
    3,
    false
  ),
  (
    'Can I upgrade my plan at any time?',
    '<p>Yes, you can easily upgrade your plan as your business grows and you need more features or capacity.</p>',
    3,
    false
  ),
  (
    'What kind of support is available?',
    '<p>24/7 support is available through email, live chat, and a dedicated support team depending on your plan.</p>',
    3,
    false
  ),
  (
    'Is there a free trial available?',
    '<p>You can explore a limited free version to test the features of Chatflow AI.</p>',
    3,
    false
  ),
  (
    'How does real-time sentiment analysis work in Chatflow AI?',
    '<p>The AI analyzes customer emotions and moods during interactions to provide empathetic and personalized responses.</p>',
    4,
    false
  ),
  (
    'How fast can I deploy Chatflow AI?',
    '<p>Chatflow AI is ready for instant deployment, allowing you to integrate and launch it within minutes.</p>',
    4,
    false
  ),
  (
    'Does Chatflow AI support multilingual conversations?',
    '<p>Yes, Chatflow AI offers multilingual support, enabling communication in multiple languages to cater to global customers.</p>',
    4,
    false
  ),
  (
    'Can I track the performance of my chatbot?',
    '<p>Yes, you can monitor chatbot performance through detailed analytics, tracking engagement, and customer satisfaction.</p>',
    4,
    false
  ),
  (
    'How does the pricing work?',
    '<p>Our pricing plans are flexible and designed to meet the needs of businesses of all sizes. You can choose from monthly or annual subscriptions, with special discounts for the first 100 customers.</p>',
    3,
    true
  );
