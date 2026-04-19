import { type NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  TOKEN_EXP_COOKIE_NAME,
} from "@/lib/auth";

const AUTH_COOKIES = [COOKIE_NAME, REFRESH_COOKIE_NAME, TOKEN_EXP_COOKIE_NAME] as const;

function getOrigin(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  return `${requestUrl.protocol}//${host}`;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = formData.get("redirect") as string | null;
  const target =
    redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : "/auth/login";
  const response = NextResponse.redirect(new URL(target, getOrigin(request)));
  AUTH_COOKIES.forEach((name) => response.cookies.delete(name));
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect");
  const target =
    redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : "/auth/login";
  const response = NextResponse.redirect(new URL(target, getOrigin(request)));
  AUTH_COOKIES.forEach((name) => response.cookies.delete(name));
  return response;
}
