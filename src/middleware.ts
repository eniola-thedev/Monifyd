import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  if (!user && path.startsWith("/dashboard")) return NextResponse.redirect(new URL("/login", req.url));
  if (user && (path === "/login" || path === "/signup")) return NextResponse.redirect(new URL("/dashboard", req.url));
  return res;
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/signup"] };
