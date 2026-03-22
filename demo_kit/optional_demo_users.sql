-- Optional extra operator accounts for role-play during demos.
-- Run after server_database/schema.sql (and after any seed that creates user_id 1).
-- password_hash is bcrypt(plaintext). Plaintext for both rows: demo2026
-- Regenerate: npm run hash-password -- demo2026

USE familis_db;

INSERT INTO users (username, email, password_hash, role) VALUES
  ('demo_staff', 'staff@familis.com', '$2b$10$Khi386Y/Ok4rZyqKnF4E7e0hVsJGTddnLsFB8jx8vub7hexJOkDZq', 'staff'),
  ('demo_admin2', 'director@familis.com', '$2b$10$Khi386Y/Ok4rZyqKnF4E7e0hVsJGTddnLsFB8jx8vub7hexJOkDZq', 'admin')
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  password_hash = VALUES(password_hash),
  role = VALUES(role);
