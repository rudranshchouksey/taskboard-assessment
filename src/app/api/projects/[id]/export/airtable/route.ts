import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  getProjectMembership,
} from "@/lib/auth";
import { exportTasksToAirtable } from "@/lib/airtable";

type Params = { params: Promise<{ id: string }> };

function canExport(role: string) {
  return role === "admin" || role === "member";
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) return notFound("project not found");

  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canExport(membership.role)) {
    return forbidden("viewers cannot export tasks");
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignee: {
        select: { name: true },
      },
    },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });

  const result = await exportTasksToAirtable(tasks);

  return NextResponse.json({
    ok: true,
    project: {
      id: project.id,
      name: project.name,
    },
    result,
  });
}