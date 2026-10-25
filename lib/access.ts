// Ai được dùng GAIA và với vai trò gì (25/10/2026).
// - Chủ nhóm: email trong GAIA_OWNER_EMAIL. Làm được mọi việc, kể cả cấp credit và thêm quản trị viên.
// - Quản trị viên / thành viên: bảng gaia_members (supabase/migrations/0004_members.sql), sửa trên trang /admin.
// - Mặc định là nhóm riêng: chỉ chủ nhóm và người trong bảng đăng nhập được, tắt nạp tiền.
//   GAIA_OPEN_SIGNUP=1 thì ai có tài khoản Google cũng vào được và bật nạp tiền (khi mở bán công khai).
// Không import 'server-only' vì proxy.ts cũng dùng file này. Không đưa vào client: khoá secret chỉ có ở server.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './supabase/network';
import type { Role } from './types';

export type { Role };

/** Mã lỗi `?error=` ở trang đăng nhập khi email chưa được mời. */
export const NOT_INVITED = 'not_invited';

/** Không đọc được danh sách thành viên (mất kết nối Supabase): chưa biết người này có được vào hay không. */
export class AccessUnavailableError extends Error {
  constructor() {
    super('Không đọc được danh sách thành viên.');
  }
}

const normalize = (email: string | null | undefined) => (email ?? '').trim().toLowerCase();

export function ownerEmail(): string {
  return normalize(process.env.GAIA_OWNER_EMAIL);
}

/** Nhóm riêng: chỉ người được mời đăng nhập, không bán credit. */
export function isPrivateGroup(): boolean {
  return process.env.GAIA_OPEN_SIGNUP !== '1';
}

// ── Danh sách thành viên, giữ tạm 30 giây trong bộ nhớ ──
// Mỗi request đều kiểm tra quyền (getUser), mà mỗi lần hỏi Supabase mất ~250 ms; giữ tạm để không thêm lượt hỏi.
// Trên Vercel có thể có nhiều bản chạy song song: gỡ quyền ở bản này thì bản khác thấy chậm tối đa 30 giây.
const TTL_MS = 30_000;
// Email không có trong bản đang giữ (vd. vừa được mời ở bản chạy khác): đọc lại, nhưng không quá mỗi 3 giây một lần.
const RECHECK_MS = 3_000;
let cache: { at: number; members: Map<string, Exclude<Role, 'owner'>> } | null = null;
let loading: Promise<Map<string, Exclude<Role, 'owner'>>> | null = null;
let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AccessUnavailableError();
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout },
  });
  return client;
}

async function loadMembers(): Promise<Map<string, Exclude<Role, 'owner'>>> {
  const { data, error } = await db().from('gaia_members').select('email, role');
  if (error) {
    // Chưa chạy 0004: coi như chưa mời ai (chỉ chủ nhóm vào được), không coi là mất kết nối.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      console.error('[access] chưa có bảng gaia_members, hãy chạy supabase/migrations/0004_members.sql');
      return new Map();
    }
    throw new AccessUnavailableError();
  }
  return new Map((data ?? []).map((r) => [normalize(r.email), r.role === 'admin' ? 'admin' : 'member']));
}

async function members(maxAge = TTL_MS): Promise<Map<string, Exclude<Role, 'owner'>>> {
  if (cache && Date.now() - cache.at < maxAge) return cache.members;
  loading ??= loadMembers()
    .then((m) => {
      cache = { at: Date.now(), members: m };
      return m;
    })
    .catch((err) => {
      // Lỗi tạm thời mà còn bản cũ thì dùng bản cũ, không đá người dùng ra.
      if (cache) return cache.members;
      throw err;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Gọi sau khi mời, gỡ hoặc đổi vai trò để lần kiểm tra sau đọc lại từ database. */
export function invalidateMembers() {
  cache = null;
}

/** Vai trò của email này, null nếu không được dùng GAIA. Ném AccessUnavailableError khi không đọc được danh sách. */
export async function roleOf(email: string | null | undefined): Promise<Role | null> {
  const e = normalize(email);
  if (!e) return null;
  if (e === ownerEmail()) return 'owner';
  // Người vừa được mời vào được ngay; người bị gỡ thì bản chạy khác thấy chậm tối đa TTL_MS.
  const role = (await members()).get(e) ?? (await members(RECHECK_MS)).get(e);
  if (role) return role;
  return isPrivateGroup() ? null : 'member';
}

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  return (await roleOf(email)) !== null;
}

export const isAdminRole = (role: Role | null | undefined): boolean => role === 'owner' || role === 'admin';
