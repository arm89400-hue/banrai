-- Admins can give or take the admin role on the People page. Empty means
-- "not set yet": the ADMIN_EMAILS server setting decides for that account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN;
