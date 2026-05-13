import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { updateTaskSchema } from "@/schemas/task";
import { recordActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return badRequest("invalid input", parsed.error.flatten());

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("task not found");

  const membership = await getProjectMembership(user.id, existing.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot edit tasks");
  }

  const task = await prisma.task.update({
    where: { id },
    data: parsed.data,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  if (parsed.data.status && parsed.data.status !== existing.status) {
  await recordActivity({
    projectId: existing.projectId,
    taskId: existing.id,
    actorId: user.id,
    type: "task_status_changed",
    message: `${user.name} changed "${task.title}" from ${existing.status} to ${parsed.data.status}`,
    metadata: {
      from: existing.status,
      to: parsed.data.status,
    },
  });
}

if (
  Object.prototype.hasOwnProperty.call(parsed.data, "assigneeId") &&
  parsed.data.assigneeId !== existing.assigneeId
) {
  const previousAssignee = existing.assigneeId
    ? await prisma.user.findUnique({
        where: { id: existing.assigneeId },
        select: { name: true },
      })
    : null;

  const nextAssignee = parsed.data.assigneeId
    ? await prisma.user.findUnique({
        where: { id: parsed.data.assigneeId },
        select: { name: true },
      })
    : null;

  await recordActivity({
    projectId: existing.projectId,
    taskId: existing.id,
    actorId: user.id,
    type: "task_assignee_changed",
    message: `${user.name} changed assignee on "${task.title}" from ${previousAssignee?.name ?? "unassigned"} to ${nextAssignee?.name ?? "unassigned"}`,
    metadata: {
      fromAssigneeId: existing.assigneeId,
      toAssigneeId: parsed.data.assigneeId ?? null,
    },
  });
}

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("task not found");

  const membership = await getProjectMembership(user.id, existing.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot delete tasks");
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
