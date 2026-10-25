import type { NextRequest } from 'next/server';
import { handle, json, readJson } from '@/lib/api.server';
import { getAdminOverview, grantCredits, requireAdminApi } from '@/lib/admin.server';
import { getBalance } from '@/lib/credits.server';

/** Cấp credit (chỉ chủ nhóm): { email, amount, note? }. Trả lại dữ liệu trang Quản trị và số dư của chính người cấp. */
export const POST = handle(async (req: NextRequest) => {
  const actor = await requireAdminApi();
  const { email, amount, note } = await readJson<{ email?: string; amount?: number; note?: string }>(req);
  await grantCredits(actor, email, amount, note);
  const [overview, balance] = await Promise.all([getAdminOverview(actor), getBalance(actor.user.id)]);
  return json({ ...overview, myBalance: balance }, 201);
});
