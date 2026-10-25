-- GAIA Studio: thành viên và quản trị viên (25/10/2026).
-- Danh sách email được dùng GAIA chuyển từ biến môi trường GAIA_ALLOWED_EMAILS vào bảng này, để quản trị viên
-- mời/gỡ người ngay trên trang Quản trị (/admin), không phải sửa biến môi trường rồi deploy lại.
-- • Chủ nhóm KHÔNG nằm trong bảng: là email trong biến môi trường GAIA_OWNER_EMAIL, nên không ai đổi được qua giao diện.
--   Chỉ chủ nhóm cấp credit, thêm quản trị viên và đổi vai trò.
-- • role 'admin': mời và gỡ thành viên. role 'member': chỉ dùng GAIA.
-- Bật RLS, không có policy: chỉ server (khoá secret) đọc/ghi được.
--
-- Chạy một lần trong Supabase → SQL Editor TRƯỚC khi chạy code mới. Chạy lại lần nữa cũng không sao.

create table if not exists public.gaia_members (
  email text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by text,
  created_at timestamptz not null default now()
);

alter table public.gaia_members enable row level security;
