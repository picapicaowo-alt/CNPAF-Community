import { NextResponse } from "next/server";
import { requireUser, jsonError } from "@/lib/http";
import { listRegistry } from "@/lib/registries";

export async function GET(req: Request, { params }: { params: Promise<{ registryKey: string }> }) {
  const { error } = await requireUser();
  if (error) return error;
  const { registryKey } = await params;
  const status = new URL(req.url).searchParams.get("status");
  const result = await listRegistry(registryKey, status);
  return result ? NextResponse.json(result) : jsonError("Registry not found", 404);
}
