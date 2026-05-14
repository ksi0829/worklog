import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {

  let response = NextResponse.next();

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
            response.cookies.set(name, value, options);
          });

        },

      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  // 공개 페이지
  const isPublicPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico");

  // 로그인 안 된 경우
  if (!user && !isPublicPage) {

    const url = req.nextUrl.clone();

    url.pathname = "/login";

    return NextResponse.redirect(url);

  }

  // 로그인 상태
  if (user) {

    // 로그인 사용자가 login 접근 시 홈 이동
    if (pathname.startsWith("/login")) {

      const url = req.nextUrl.clone();

      url.pathname = "/";

      return NextResponse.redirect(url);

    }

    // 비밀번호 변경 여부 체크
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();

    const mustChange =
      profile?.must_change_password === true;

    // 최초 비밀번호 변경 강제
    if (
      mustChange &&
      !pathname.startsWith("/change-password")
    ) {

      const url = req.nextUrl.clone();

      url.pathname = "/change-password";

      return NextResponse.redirect(url);

    }

  }

  return response;

}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};