-- Create the 'user_avatars' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('user_avatars', 'user_avatars', true);
-- Create the 'review_images' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('review_images', 'review_images', true);
