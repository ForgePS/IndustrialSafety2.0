-- Enable row-level security
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Policy for SELECT operations (only for 'user_avatars' bucket)
CREATE POLICY objects_select_policy ON storage.objects FOR
SELECT USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'user_avatars'
  );
-- Policy for INSERT operations (only for 'user_avatars' bucket)
CREATE POLICY objects_insert_policy ON storage.objects FOR
INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id = 'user_avatars'
  );
-- Policy for UPDATE operations (only for 'user_avatars' bucket)
CREATE POLICY objects_update_policy ON storage.objects FOR
UPDATE USING (
    auth.role() = 'authenticated'
    AND bucket_id = 'user_avatars'
  );
-- Policy for DELETE operations (only for 'user_avatars' bucket)
CREATE POLICY objects_delete_policy ON storage.objects FOR DELETE USING (
  auth.role() = 'authenticated'
  AND bucket_id = 'user_avatars'
);
