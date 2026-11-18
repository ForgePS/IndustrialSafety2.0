-- Forge Creator 2.0 runtime navigation permission metadata.
update public.forge_experience_elements
set settings = coalesce(settings, '{}'::jsonb) || '{"required_permission":"tenant.settings.view"}'::jsonb
where element_key = 'nav.company_settings';
