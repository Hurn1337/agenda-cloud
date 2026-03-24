import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.APP_PASSWORD || "666";

  if (password === correct) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("agenda_auth", "authenticated", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return response;
  }
  return NextResponse.json({ error: "wrong" }, { status: 401 });
}
