import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    activity: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    getProjectMembership: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import { getCurrentUser, getProjectMembership } from "@/lib/auth";
import { GET } from "@/app/api/projects/[id]/activity/route";
import { recordActivity } from "@/lib/activity";

describe("GET /api/projects/:id/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "p_1" });
    (prisma.activity.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/projects/p_1/activity"),
      { params: Promise.resolve({ id: "p_1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for non-members", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u_1" });
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/projects/p_1/activity"),
      { params: Promise.resolve({ id: "p_1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns recent-first activity for members", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u_1" });
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "viewer" });

    const res = await GET(
      new NextRequest("http://localhost/api/projects/p_1/activity"),
      { params: Promise.resolve({ id: "p_1" }) }
    );

    expect(res.status).toBe(200);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "p_1" },
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("recordActivity", () => {
  it("does not throw if activity write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    (prisma.activity.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db failed"));

    await expect(
      recordActivity({
        projectId: "p_1",
        taskId: "t_1",
        actorId: "u_1",
        type: "task_created",
        message: "created task",
      })
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });
});