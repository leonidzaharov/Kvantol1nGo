import { getClassroomDashboardSnapshot } from "@/lib/classroom-dashboard";
import { requireAdmin } from "@/lib/server-guard";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    await requireAdmin();
  } catch {
    return new Response(null, { status: 404 });
  }

  const { id } = await params;
  const sessionId = Number.parseInt(id, 10);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const snapshot = await getClassroomDashboardSnapshot(sessionId);
  if (!snapshot) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
