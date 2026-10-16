import { NextResponse } from "next/server";
import { borrarBase } from "@/lib/db/mailing";

export const runtime = "nodejs";

/** DELETE /api/mailing/bases/:id */
export const DELETE = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return (await borrarBase(id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Base no encontrada" }, { status: 404 });
};
