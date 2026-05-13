import { prisma } from "@/lib/prisma";

export type RecordActivityInput = {
  projectId: string;
  taskId?: string | null;
  actorId: string;
  type:
    | "task_created"
    | "task_status_changed"
    | "task_assignee_changed"
    | "comment_added";
  message: string;
  metadata?: Record<string, unknown>;
};

export async function recordActivity(input: RecordActivityInput) {
  try {
    await prisma.activity.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        actorId: input.actorId,
        type: input.type,
        message: input.message,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error("activity_write_failed", {
      type: input.type,
      projectId: input.projectId,
      taskId: input.taskId,
      actorId: input.actorId,
      error,
    });
  }
}