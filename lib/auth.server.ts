import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { headers } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured } from './env';
import { createSupabaseServer } from './supabase/server';
import { supabaseAdmin } from './supabase/admin';
import { isAuthUnavailable } from './supabase/network';
import { AUTH_UNAVAILABLE_HEADER, AuthUnavailableError } from './auth-unavailable';
import { ApiError } from './api.server';
import { isEmailAllowed } from './access';
import type { Profile, Role } from './types';

/**
 * Người dùng hiện tại (đã xác thực với Supabase), hoặc null.
 * Không hỏi được Supabase thì ném AuthUnavailableError: chưa biết người dùng là ai, không được coi là chưa đăng nhập.
 */
export async function getUser(): Promise<User | null> {
  // Luôn render theo request (kể cả khi chưa cấu hình Supabase), để build không "đóng băng" trang.
  await connection();
  if (!isSupabaseConfigured()) return null;
  // proxy.ts vừa không hỏi được Supabase: báo lỗi ngay, không chờ thử lại thêm lần nữa.
  if ((await headers()).has(AUTH_UNAVAILABLE_HEADER)) throw new AuthUnavailableError();
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (isAuthUnavailable(error)) {
    console.error('[auth] không hỏi được Supabase', error?.message);
    throw new AuthUnavailableError();
  }
  // Nhóm riêng: email đã bị gỡ quyền thì coi như chưa đăng nhập. Trang chuyển sang /login,
  // ở đó proxy.ts xoá phiên và báo lý do. Không đọc được danh sách thành viên thì cũng là mất kết nối.
  if (data.user) {
    const allowed = await isEmailAllowed(data.user.email).catch(() => {
      throw new AuthUnavailableError();
    });
    if (!allowed) return null;
  }
  return data.user ?? null;
}

/** Dùng trong trang: chưa đăng nhập thì chuyển sang /login rồi quay lại `nextPath`. */
export async function requireUserPage(nextPath: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * Dùng trong trang thay cho `requireUserPage`, để trang không phải chờ Supabase xác thực xong rồi mới tải dữ liệu
 * (mỗi lần hỏi Supabase ~250 ms từ máy dev).
 * - `userId` lấy từ JWT đã kiểm chữ ký tại chỗ, không gọi mạng (proxy.ts vừa làm mới token), nên trang tải dữ liệu ngay.
 * - `verified` vẫn hỏi Supabase như `requireUserPage` (phiên có thể đã bị thu hồi). Trang PHẢI await nó cùng lúc với
 *   dữ liệu (Promise.all) trước khi hiển thị bất cứ thứ gì.
 */
export async function pageSession(nextPath: string): Promise<{ userId: string; verified: Promise<User> }> {
  await connection();
  if (isSupabaseConfigured() && !(await headers()).has(AUTH_UNAVAILABLE_HEADER)) {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (userId) {
      const verified = requireUserPage(nextPath).then((user) => {
        if (user.id !== userId) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
        return user;
      });
      // Lỗi (chuyển hướng, Supabase không trả lời) vẫn tới trang qua Promise.all; dòng này chỉ tránh cảnh báo
      // "unhandled rejection" khi trang dừng sớm (vd. notFound) trước khi await `verified`.
      verified.catch(() => {});
      return { userId, verified };
    }
  }
  // Chưa có phiên hợp lệ, hoặc Supabase không trả lời: để requireUserPage chuyển hướng / báo lỗi như cũ.
  const user = await requireUserPage(nextPath);
  return { userId: user.id, verified: Promise.resolve(user) };
}

/**
 * Gắn vào `Promise.all([verified, ...dữ liệu])` của trang: `.catch(preferAuthError(verified))`.
 * Mất kết nối tới Supabase thì truy vấn dữ liệu thường hỏng trước bước xác thực, và trang chỉ báo "Có lỗi khi tải
 * trang" chung chung. Ở đây chờ `verified` trước: nó lỗi (chuyển sang /login, AuthUnavailableError) thì lỗi đó được
 * ưu tiên, để trang báo đúng "Không kết nối được máy chủ đăng nhập" (case H01, 18/10/2026).
 */
export function preferAuthError(verified: Promise<User>) {
  return async (err: unknown): Promise<never> => {
    await verified;
    throw err;
  };
}

/** Dùng trong API route: chưa đăng nhập thì trả 401. */
export async function requireUserApi(): Promise<User> {
  if (!isSupabaseConfigured()) {
    throw new ApiError(503, 'not_configured', 'GAIA chưa được cấu hình đăng nhập.');
  }
  const user = await getUser().catch((err) => {
    // 503 chứ không phải 401: client giữ người dùng ở lại trang, không chuyển sang /login.
    if (err instanceof AuthUnavailableError) throw new ApiError(503, 'auth_unavailable', err.message);
    throw err;
  });
  if (!user) throw new ApiError(401, 'unauthorized', 'Bạn cần đăng nhập để tiếp tục.');
  return user;
}

type ProfileRow = { email: string | null; full_name: string | null; avatar_url: string | null } | null;

/** Dòng `profiles` của người dùng; chỉ cần user id nên tải song song được với `pageSession().verified`. */
export async function getProfileRow(userId: string): Promise<ProfileRow> {
  const { data } = await supabaseAdmin()
    .from('profiles')
    .select('email, full_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  return data as ProfileRow;
}

export async function getProfile(user: User): Promise<Profile> {
  return toProfile(user, await getProfileRow(user.id));
}

/**
 * Hồ sơ hiển thị: ưu tiên dòng `profiles`, thiếu thì lấy từ metadata Google của tài khoản.
 * `role` lấy bằng `roleOf(user.email)` (lib/access.ts); sau getUser() thì danh sách thành viên đã nằm sẵn trong bộ nhớ.
 */
export function toProfile(user: User, data: ProfileRow, role: Role | null = null): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  return {
    id: user.id,
    email: data?.email ?? user.email ?? null,
    name: data?.full_name ?? meta.full_name ?? meta.name ?? null,
    avatarUrl: data?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null,
    role,
  };
}
