import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProfileRow, pageSession, preferAuthError, toProfile } from '@/lib/auth.server';
import { getBalance } from '@/lib/credits.server';
import { getAdminOverview } from '@/lib/admin.server';
import { isAdminRole, isPrivateGroup, roleOf } from '@/lib/access';
import { CreditProvider } from '@/components/CreditContext';
import { ToastProvider } from '@/components/Toasts';
import { AdminPage } from '@/components/admin/AdminPage';

export const metadata: Metadata = { title: 'Quản trị', robots: { index: false } };

/** Trang Quản trị: chỉ chủ nhóm và quản trị viên mở được; người khác thấy 404. */
export default async function Page() {
  const { userId, verified } = await pageSession('/admin');
  const [user, profileRow, balance] = await Promise.all([verified, getProfileRow(userId), getBalance(userId)]).catch(
    preferAuthError(verified),
  );
  // getUser() vừa đọc danh sách thành viên nên roleOf lấy từ bộ nhớ, không hỏi Supabase thêm lần nữa.
  const role = await roleOf(user.email);
  if (!isAdminRole(role)) notFound();
  const overview = await getAdminOverview({ email: (user.email ?? '').toLowerCase(), role: role as 'owner' | 'admin' });

  return (
    <CreditProvider initial={balance} canTopup={!isPrivateGroup()}>
      <ToastProvider>
        <AdminPage profile={toProfile(user, profileRow, role)} initial={overview} />
      </ToastProvider>
    </CreditProvider>
  );
}
