import { handle, json } from '@/lib/api.server';
import { getAdminOverview, requireAdminApi } from '@/lib/admin.server';

/** Dữ liệu trang Quản trị: số dư, credit đã cấp, thành viên, lịch sử cấp credit. */
export const GET = handle(async () => {
  const actor = await requireAdminApi();
  return json(await getAdminOverview(actor));
});
