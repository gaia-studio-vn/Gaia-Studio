import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { isAuthUnavailable } from '@/lib/supabase/network';
import { isEmailAllowed, NOT_INVITED } from '@/lib/access';

/** Google → Supabase → đây: đổi `code` lấy phiên đăng nhập rồi về trang người dùng định vào. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next') ?? '/studio';
  // Chỉ cho chuyển về đường dẫn nội bộ.
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/studio';

  // error=network: không hỏi được Supabase; error=1: đăng nhập không thành công vì lý do khác.
  let reason = '1';
  if (code && isSupabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const allowed = await isEmailAllowed(data.user?.email).catch(() => null);
      if (allowed === false) {
        // Nhóm riêng: email chưa được mời thì không giữ phiên.
        await supabase.auth.signOut({ scope: 'local' });
        return NextResponse.redirect(`${origin}/login?error=${NOT_INVITED}`);
      }
      if (allowed) return NextResponse.redirect(`${origin}${next}`);
      // Không đọc được danh sách thành viên: báo lỗi kết nối như khi Supabase không trả lời.
      reason = 'network';
    } else {
      console.error('[auth] đổi code lỗi', error.message);
      if (isAuthUnavailable(error)) reason = 'network';
    }
  }
  return NextResponse.redirect(`${origin}/login?error=${reason}&next=${encodeURIComponent(next)}`);
}
