import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const pathname = req.nextUrl.pathname;

  // 공개 경로
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/change-password") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico");

  // 로그인 안 했는데 보호 경로 접근 -> /login
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();

    const mustChange = profile?.must_change_password === true;

    // 최초 비밀번호 변경 강제 상태이면 /change-password 외 전부 막기
    if (mustChange && !pathname.startsWith("/change-password")) {
      const url = req.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }

    // 로그인된 사용자가 /login 접근하면 홈으로
    if (pathname.startsWith("/login")) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // ✅ /change-password 는 로그인 사용자가 언제든 접근 가능
    // 여기서는 더 이상 / 로 튕기지 않음
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};