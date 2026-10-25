import type { Metadata } from 'next';
import { getProfileRow, pageSession, preferAuthError, toProfile } from '@/lib/auth.server';
import { getCreditSummary, getLedger } from '@/lib/credits.server';
import { getTopup } from '@/lib/payments.server';
import { isPayosConfigured } from '@/lib/env';
import { isPrivateGroup, roleOf } from '@/lib/access';
import { CreditProvider } from '@/components/CreditContext';
import { ToastProvider } from '@/components/Toasts';
import { CreditPage } from '@/components/credit/CreditPage';

export const metadata: Metadata = { title: 'Credit' };

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { userId, verified } = await pageSession('/credit');
  const { order } = await searchParams;
  // Quay lại từ trang PayOS (?order=...) hoặc tải lại trang khi đang chờ chuyển khoản.
  const orderCode = Number(order);

  // Xác thực và tải dữ liệu cùng lúc (xem pageSession).
  const [user, profileRow, summary, ledger, resume] = await Promise.all([
    verified,
    getProfileRow(userId),
    getCreditSummary(userId),
    getLedger(userId),
    Number.isSafeInteger(orderCode) && orderCode > 0 ? getTopup(userId, orderCode).catch(() => null) : null,
  ]).catch(preferAuthError(verified));
  const profile = toProfile(user, profileRow, await roleOf(user.email));
  // Đã trả xong thì số dư có thể vừa đổi trong lúc hỏi PayOS.
  const [finalSummary, finalLedger] =
    resume?.status === 'paid' ? await Promise.all([getCreditSummary(userId), getLedger(userId)]) : [summary, ledger];

  return (
    <CreditProvider initial={finalSummary.balance} canTopup={!isPrivateGroup()}>
      <ToastProvider>
        <CreditPage
          profile={profile}
          initialSummary={finalSummary}
          initialLedger={finalLedger}
          resume={resume && (resume.status === 'pending' || resume.status === 'paid') ? resume : null}
          paymentsEnabled={isPayosConfigured()}
        />
      </ToastProvider>
    </CreditProvider>
  );
}
