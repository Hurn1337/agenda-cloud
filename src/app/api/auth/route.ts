import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.APP_PASSWORD || "666";

  if (password === correct) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "wrong" }, { status: 401 });
}
