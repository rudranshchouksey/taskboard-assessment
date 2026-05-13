import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
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
import { PATCH } from "@/app/api/tasks/[id]/route";

const TASK = {
  id: "t_1",
  projectId: "p_1",
  title: "Original title",
  status: "todo",
  position: 0,
};

const USER = { id: "u_1", email: "meera@taskboard.dev", name: "Meera" };

function makeRequest(body?: object) {
  return new NextRequest("http://localhost/api/tasks/t_1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("PATCH /api/tasks/:id authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TASK);
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...TASK,
      assignee: null,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(makeRequest({ title: "x" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a member", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await PATCH(makeRequest({ title: "x" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("returns 403 when user is a viewer", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "viewer" });

    const res = await PATCH(makeRequest({ title: "x" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("allows member to edit task", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "member" });

    const res = await PATCH(makeRequest({ title: "Updated title" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(200);
    expect(prisma.task.update).toHaveBeenCalledOnce();
  });
});