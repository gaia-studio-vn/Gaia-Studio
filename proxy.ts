import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { fetchWithTimeout, isAuthUnavailable } from '@/lib/supabase/network';
import { AUTH_UNAVAILABLE_HEADER } from '@/lib/auth-unavailable';
import { isEmailAllowed, NOT_INVITED } from '@/lib/access';

// Next 16: "proxy" thay cho "middleware". Mỗi request trang: làm mới phiên Supabase (ghi cookie mới
// nếu token hết hạn) và chặn trang cần đăng nhập. API route tự kiểm tra đăng nhập.

const PROTECTED = ['/studio', '/credit', '/admin'];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Chuyển hướng phải mang theo cookie vừa làm mới, nếu không token mới bị mất và lần sau
  // lại dùng refresh token cũ (Supabase có thể thu hồi cả phiên).
  const redirect = (to: URL) => {
    const res = NextResponse.redirect(to);
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  };
  const path = request.nextUrl.pathname;

  if (path === '/login') {
    // Trang cần đăng nhập đẩy sang đây khi Supabase báo phiên không còn (vd. đã đăng xuất ở nơi khác) dù chữ ký
    // JWT vẫn hợp lệ. Vì vậy ở đây hỏi thẳng Supabase, không chỉ đọc chữ ký, để không chuyển qua lại mãi.
    // Phiên không còn thì getUser() xoá cookie phiên qua setAll ở trên.
    const { data } = await supabase.auth.getUser();
    if (!data.user) return response;
    // Không đọc được danh sách thành viên: chưa biết người này có được vào không, cứ hiện trang đăng nhập.
    const allowed = await isEmailAllowed(data.user.email).catch(() => null);
    if (allowed === null) return response;
    if (!allowed) {
      // Nhóm riêng: email không (còn) trong danh sách. Xoá phiên trên máy này rồi ở lại trang đăng nhập, kèm lý do.
      await supabase.auth.signOut({ scope: 'local' });
      if (request.nextUrl.searchParams.get('error') === NOT_INVITED) return response;
      const login = request.nextUrl.clone();
      login.searchParams.set('error', NOT_INVITED);
      return redirect(login);
    }
    // Đã đăng nhập: về đúng trang người dùng định vào (vd. /credit), mặc định /studio.
    return redirect(internalUrl(request.nextUrl.searchParams.get('next'), request.url));
  }

  // getClaims() kiểm chữ ký JWT tại chỗ (khoá bất đối xứng) và làm mới token khi cần, nhanh hơn getUser().
  // Ở đây chỉ dùng để chuyển hướng; trang và API vẫn tự xác thực lại bằng getUser().
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  // Không hỏi được Supabase (vd. lúc làm mới token) thì chưa biết người dùng đã đăng nhập hay chưa:
  // để trang tự kiểm tra lại và báo lỗi kết nối, không đẩy sang /login.
  const unknown = !signedIn && isAuthUnavailable(error);

  if (!signedIn && !unknown && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return redirect(login);
  }
  if (unknown) {
    // Mỗi lần làm mới token thất bại, supabase-js tự thử lại tới ~25 giây; báo trang khỏi thử thêm lần nữa.
    const headers = new Headers(request.headers);
    headers.set(AUTH_UNAVAILABLE_HEADER, '1');
    const res = NextResponse.next({ request: { headers } });
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  }
  return response;
}

/** `next` nếu là đường dẫn nội bộ, ngược lại /studio (chặn chuyển sang trang ngoài như `//evil.com`). */
function internalUrl(next: string | null, base: string): URL {
  const fallback = new URL('/studio', base);
  try {
    const target = new URL(next || '/studio', base);
    return target.origin === fallback.origin ? target : fallback;
  } catch {
    return fallback;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/|icon.svg|apple-icon.png|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
