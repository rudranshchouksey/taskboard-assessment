import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findUnique: vi.fn() },
    comment: { findMany: vi.fn(), create: vi.fn() },
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
import { GET, POST } from "@/app/api/tasks/[id]/comments/route";

const TASK = { id: "t_1", projectId: "p_1" };
const USER = { id: "u_1", name: "Meera", email: "meera@taskboard.dev" };
const COMMENT = {
  id: "c_1",
  taskId: "t_1",
  authorId: "u_1",
  body: "Looks good",
  createdAt: new Date("2024-06-01"),
  author: USER,
};

function getReq() {
  return new NextRequest("http://localhost/api/tasks/t_1/comments", {
    headers: { Authorization: "Bearer valid" },
  });
}

function postReq(body: object) {
  return new NextRequest("http://localhost/api/tasks/t_1/comments", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/tasks/:id/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TASK);
    (prisma.comment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([COMMENT]);
  });

  it("returns 401 when unauthenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(getReq(), { params: Promise.resolve({ id: "t_1" }) });
    expect(res.status).toBe(401);
  });

  it("allows viewers to read comments", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "viewer" });

    const res = await GET(getReq(), { params: Promise.resolve({ id: "t_1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comments).toHaveLength(1);
  });

  it("loads comments in chronological order", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "member" });

    await GET(getReq(), { params: Promise.resolve({ id: "t_1" }) });

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "asc" },
      }),
    );
  });
});

describe("POST /api/tasks/:id/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TASK);
    (prisma.comment.create as ReturnType<typeof vi.fn>).mockResolvedValue(COMMENT);
  });

  it("blocks viewers from posting", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "viewer" });

    const res = await POST(postReq({ body: "test" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(403);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  it("allows members to post comments", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "member" });

    const res = await POST(postReq({ body: "test comment" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(201);
    expect(prisma.comment.create).toHaveBeenCalled();
  });

  it("rejects empty comments", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(USER);
    (getProjectMembership as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "member" });

    const res = await POST(postReq({ body: "" }), {
      params: Promise.resolve({ id: "t_1" }),
    });

    expect(res.status).toBe(400);
  });
});