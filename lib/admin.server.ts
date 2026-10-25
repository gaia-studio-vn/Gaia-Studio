import 'server-only';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase/admin';
import { ApiError } from './api.server';
import { requireUserApi } from './auth.server';
import { getProviderBalance } from './gommo';
import { invalidateMembers, isAdminRole, isPrivateGroup, ownerEmail, roleOf } from './access';
import type { AdminGrant, AdminMember, AdminOverview, Role } from './types';

// Trang Quản trị (/admin). Quyền (chủ dự án chốt 25/10/2026):
// - Chủ nhóm (GAIA_OWNER_EMAIL): mọi việc, kể cả cấp credit, thêm quản trị viên và đổi vai trò.
// - Quản trị viên: mời và gỡ thành viên. Không cấp credit, không thêm/gỡ quản trị viên.
// Mọi kiểm tra quyền nằm ở đây (server), giao diện chỉ ẩn nút cho gọn.

const db = () => supabaseAdmin();
const MAX_GRANT = 100_000_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GRANT_TITLE = 'Tặng credit'; // tiêu đề gaia_grant ghi vào credit_ledger

export type AdminActor = { user: User; email: string; role: 'owner' | 'admin' };

/** Dùng trong API /api/admin/*: không phải quản trị viên thì trả 404 như trang không tồn tại. */
export async function requireAdminApi(): Promise<AdminActor> {
  const user = await requireUserApi();
  const role = await roleOf(user.email);
  if (!isAdminRole(role)) throw new ApiError(404, 'not_found', 'Không tìm thấy trang này.');
  return { user, email: (user.email ?? '').toLowerCase(), role: role as 'owner' | 'admin' };
}

function cleanEmail(raw: unknown): string {
  const email = String(raw ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) throw new ApiError(400, 'bad_email', 'Email không hợp lệ.');
  return email;
}

type MemberRow = { email: string; role: 'admin' | 'member'; created_at: string };
type ProfileRow = { id: string; email: string | null; full_name: string | null };

export async function getAdminOverview(actor: { email: string; role: 'owner' | 'admin' }): Promise<AdminOverview> {
  const now = new Date().toISOString();
  const [members, profiles, lots, ledger, providerBalance] = await Promise.all([
    db().from('gaia_members').select('email, role, created_at').order('created_at', { ascending: true }),
    db().from('profiles').select('id, email, full_name').limit(2000),
    db().from('credit_lots').select('user_id, remaining').gt('remaining', 0).gt('expires_at', now).limit(10000),
    db()
      .from('credit_ledger')
      .select('id, user_id, delta, detail, created_at')
      .eq('kind', 'topup')
      .eq('title', GRANT_TITLE)
      .order('id', { ascending: false })
      .limit(20),
    getProviderBalance(),
  ]);
  for (const r of [members, profiles, lots, ledger]) if (r.error) throw r.error;

  const byEmail = new Map<string, ProfileRow>();
  const byId = new Map<string, ProfileRow>();
  for (const p of (profiles.data ?? []) as ProfileRow[]) {
    if (p.email) byEmail.set(p.email.toLowerCase(), p);
    byId.set(p.id, p);
  }
  const balances = new Map<string, number>();
  let outstanding = 0;
  for (const l of (lots.data ?? []) as { user_id: string; remaining: number }[]) {
    balances.set(l.user_id, (balances.get(l.user_id) ?? 0) + l.remaining);
    outstanding += l.remaining;
  }

  const row = (email: string, role: Role, invitedAt: string | null): AdminMember => {
    const p = byEmail.get(email);
    return {
      email,
      name: p?.full_name ?? null,
      role,
      userId: p?.id ?? null,
      balance: p ? (balances.get(p.id) ?? 0) : null,
      invitedAt,
    };
  };
  const owner = ownerEmail();
  const list: AdminMember[] = owner ? [row(owner, 'owner', null)] : [];
  const rows = ((members.data ?? []) as MemberRow[]).filter((m) => m.email !== owner);
  // Quản trị viên lên trước, rồi thành viên; trong mỗi nhóm theo thứ tự được mời.
  for (const m of rows.filter((r) => r.role === 'admin')) list.push(row(m.email, 'admin', m.created_at));
  for (const m of rows.filter((r) => r.role === 'member')) list.push(row(m.email, 'member', m.created_at));
  // Mở công khai: ai đăng nhập cũng là thành viên, kể cả khi không có trong bảng.
  if (!isPrivateGroup()) {
    const listed = new Set(list.map((m) => m.email));
    for (const p of (profiles.data ?? []) as ProfileRow[]) {
      const email = p.email?.toLowerCase();
      if (email && !listed.has(email)) list.push(row(email, 'member', null));
    }
  }

  const grants: AdminGrant[] = ((ledger.data ?? []) as { id: number; user_id: string; delta: number; detail: string | null; created_at: string }[]).map(
    (g) => ({
      id: g.id,
      email: byId.get(g.user_id)?.email ?? null,
      name: byId.get(g.user_id)?.full_name ?? null,
      amount: g.delta,
      note: g.detail,
      createdAt: g.created_at,
    }),
  );

  return {
    me: { email: actor.email, role: actor.role },
    ownerName: owner ? (byEmail.get(owner)?.full_name ?? null) : null,
    providerBalance,
    outstanding,
    members: list,
    grants,
  };
}

/** Mời một email. Chỉ chủ nhóm mời được quản trị viên. */
export async function inviteMember(actor: AdminActor, rawEmail: unknown, rawRole: unknown) {
  const email = cleanEmail(rawEmail);
  const role = rawRole === 'admin' ? 'admin' : 'member';
  if (role === 'admin' && actor.role !== 'owner') {
    throw new ApiError(403, 'owner_only', 'Chỉ chủ nhóm thêm được quản trị viên.');
  }
  if (email === ownerEmail()) throw new ApiError(400, 'is_owner', 'Đây là email của chủ nhóm.');
  const { error } = await db().from('gaia_members').insert({ email, role, invited_by: actor.email });
  if (error?.code === '23505') throw new ApiError(409, 'exists', 'Email này đã có trong danh sách.');
  if (error) throw error;
  invalidateMembers();
}

/** Gỡ quyền dùng GAIA (dữ liệu vẫn giữ). Quản trị viên chỉ gỡ được thành viên. */
export async function removeMember(actor: AdminActor, rawEmail: unknown) {
  const email = cleanEmail(rawEmail);
  if (email === ownerEmail()) throw new ApiError(400, 'is_owner', 'Không gỡ được chủ nhóm.');
  const { data, error } = await db().from('gaia_members').select('role').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'not_found', 'Email này không có trong danh sách.');
  if (data.role === 'admin' && actor.role !== 'owner') {
    throw new ApiError(403, 'owner_only', 'Chỉ chủ nhóm gỡ được quản trị viên.');
  }
  const { error: delError } = await db().from('gaia_members').delete().eq('email', email);
  if (delError) throw delError;
  invalidateMembers();
}

/** Đổi vai trò quản trị viên ↔ thành viên. Chỉ chủ nhóm. */
export async function setMemberRole(actor: AdminActor, rawEmail: unknown, rawRole: unknown) {
  if (actor.role !== 'owner') throw new ApiError(403, 'owner_only', 'Chỉ chủ nhóm đổi được vai trò.');
  const email = cleanEmail(rawEmail);
  if (rawRole !== 'admin' && rawRole !== 'member') throw new ApiError(400, 'bad_role', 'Vai trò không hợp lệ.');
  const { data, error } = await db().from('gaia_members').update({ role: rawRole }).eq('email', email).select('email');
  if (error) throw error;
  if (!data?.length) throw new ApiError(404, 'not_found', 'Email này không có trong danh sách.');
  invalidateMembers();
}

/** Cấp credit. Chỉ chủ nhóm (người trả tiền). Người nhận phải đã đăng nhập GAIA ít nhất một lần. */
export async function grantCredits(actor: AdminActor, rawEmail: unknown, rawAmount: unknown, rawNote: unknown) {
  if (actor.role !== 'owner') throw new ApiError(403, 'owner_only', 'Chỉ chủ nhóm cấp được credit.');
  const email = cleanEmail(rawEmail);
  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_GRANT) {
    throw new ApiError(400, 'bad_amount', 'Số credit phải là số nguyên dương.');
  }
  const note = String(rawNote ?? '').trim().slice(0, 200) || null;
  // Người nhận phải còn quyền dùng GAIA (chủ nhóm hoặc có trong danh sách).
  if (!(await roleOf(email))) throw new ApiError(400, 'not_member', 'Email này không có quyền dùng GAIA.');
  const { data: profile, error } = await db().from('profiles').select('id').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!profile) {
    throw new ApiError(400, 'not_joined', 'Người này chưa đăng nhập GAIA lần nào, nên chưa cấp credit được.');
  }
  const { error: grantError } = await db().rpc('gaia_grant', { p_user: profile.id, p_amount: amount, p_detail: note });
  if (grantError) throw grantError;
}
