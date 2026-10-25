import type { NextRequest } from 'next/server';
import { handle, json, readJson } from '@/lib/api.server';
import { getAdminOverview, inviteMember, removeMember, requireAdminApi, setMemberRole } from '@/lib/admin.server';

/** Mời: { email, role: 'member' | 'admin' }. Trả lại dữ liệu trang Quản trị mới. */
export const POST = handle(async (req: NextRequest) => {
  const actor = await requireAdminApi();
  const { email, role } = await readJson<{ email?: string; role?: string }>(req);
  await inviteMember(actor, email, role);
  return json(await getAdminOverview(actor), 201);
});

/** Đổi vai trò (chỉ chủ nhóm): { email, role }. */
export const PATCH = handle(async (req: NextRequest) => {
  const actor = await requireAdminApi();
  const { email, role } = await readJson<{ email?: string; role?: string }>(req);
  await setMemberRole(actor, email, role);
  return json(await getAdminOverview(actor));
});

/** Gỡ quyền dùng GAIA: ?email=… */
export const DELETE = handle(async (req: NextRequest) => {
  const actor = await requireAdminApi();
  await removeMember(actor, req.nextUrl.searchParams.get('email'));
  return json(await getAdminOverview(actor));
});
