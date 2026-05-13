"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import {
  apiFetch,
  clearSession,
  getStoredUser,
} from "@/lib/api-client";
import type {
  ApiProjectDetail,
  ApiProjectMember,
  ApiTask,
  Role,
  TaskStatus,
} from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetail } from "@/components/TaskDetail";

type ProjectResponse = {
  project: ApiProjectDetail;
};

type CreateTaskInput = {
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string | null;
};

type AirtableExportResponse = {
  ok: boolean;
  project: {
    id: string;
    name: string;
  };
  result: {
    total: number;
    created: number;
    updated: number;
    failed: number;
    failures: Array<{
      taskId: string;
      error: string;
      permanent: boolean;
    }>;
  };
};

type ApiActivity = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  };
  task?: {
    id: string;
    title: string;
  } | null;
};

type ActivityResponse = {
  activity: ApiActivity[];
};

function groupTasks(tasks: ApiTask[]) {
  return STATUS_ORDER.reduce<Record<TaskStatus, ApiTask[]>>((acc, status) => {
    acc[status] = tasks
      .filter((task) => task.status === status)
      .sort((a, b) => a.position - b.position);
    return acc;
  }, {} as Record<TaskStatus, ApiTask[]>);
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTask, setActiveTask] = useState<ApiTask | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [assigneeId, setAssigneeId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", id],
    queryFn: () => apiFetch<ProjectResponse>(`/api/projects/${id}`),
  });

  const project = projectQuery.data?.project;

  const activityQuery = useQuery({
    queryKey: ["activity", id],
    queryFn: () => apiFetch<ActivityResponse>(`/api/projects/${id}/activity`),
    enabled: !!id,
    retry: false,
  });

  const grouped = useMemo(() => {
    if (!project) {
      return groupTasks([]);
    }
    return groupTasks(project.tasks);
  }, [project]);

  const createTask = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiFetch<{ task: ApiTask }>(`/api/projects/${id}/tasks`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setAssigneeId("");
      setFormError(null);
      setShowCreateForm(false);
      await queryClient.invalidateQueries({ queryKey: ["project", id] });
      await queryClient.invalidateQueries({ queryKey: ["activity", id] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "failed to create task");
    },
  });

  const exportTasks = useMutation({
    mutationFn: () =>
      apiFetch<AirtableExportResponse>(`/api/projects/${id}/export/airtable`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      const { total, created, updated, failed, failures } = data.result;

      let message = `Export complete — ${total} total, ${created} created, ${updated} updated, ${failed} failed`;

      if (failed > 0 && failures.length > 0) {
        const preview = failures
          .slice(0, 2)
          .map((failure) => `${failure.taskId}: ${failure.error}`)
          .join(" | ");
        message += ` — sample failures: ${preview}`;
      }

      setExportMessage(message);
    },
    onError: (error) => {
      setExportMessage(
        error instanceof Error ? error.message : "export failed"
      );
    },
  });

  function handleLogout() {
    clearSession();
    router.replace("/");
  }

  if (projectQuery.isLoading) {
    return (
      <main className="min-h-screen bg-bg text-text px-6 py-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm text-muted">loading project...</p>
        </div>
      </main>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <main className="min-h-screen bg-bg text-text px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-4">
          <Link href="/projects" className="text-sm text-accent hover:underline">
            ← back to projects
          </Link>
          <p className="text-sm text-red-400">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : "failed to load project"}
          </p>
        </div>
      </main>
    );
  }

  const myMembership =
    project.memberships.find((membership) => membership.user.id === currentUser?.id) ?? null;

  const currentRole: Role = myMembership?.role ?? "viewer";
  const canCreateTask = currentRole === "admin" || currentRole === "member";
  const canExportTasks = currentRole === "admin" || currentRole === "member";

  return (
    <main className="min-h-screen bg-bg text-text px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <Link href="/projects" className="text-sm text-accent hover:underline">
              ← back to projects
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
            <p className="max-w-2xl text-sm text-muted">
              {project.description || "No description provided."}
            </p>
            <p className="text-xs text-muted">
              signed in as {currentUser?.name} ({currentUser?.email})
            </p>
            <p className="text-xs text-muted">
              your role: <span className="capitalize">{currentRole}</span>
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 md:items-end">
            <button
              onClick={handleLogout}
              className="rounded-md border border-border px-4 py-2 text-sm hover:border-muted"
            >
              logout
            </button>

            {canExportTasks && (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <button
                  onClick={() => {
                    setExportMessage(null);
                    exportTasks.mutate();
                  }}
                  disabled={exportTasks.isPending}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
                >
                  {exportTasks.isPending ? "exporting…" : "export tasks to airtable"}
                </button>

                {exportMessage && (
                  <p className="max-w-md text-xs text-muted md:text-right">
                    {exportMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        </header>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">members</h2>
              <p className="text-xs text-muted">
                project membership controls read/write access.
              </p>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {project.memberships.map((membership) => (
              <li
                key={membership.id}
                className="rounded-md border border-border bg-bg p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{membership.user.name}</p>
                    <p className="text-xs text-muted">{membership.user.email}</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 text-xs capitalize text-muted">
                    {membership.role}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold">tasks</h2>
              <p className="text-xs text-muted">
                click a card to view details, comments, and task actions.
              </p>
            </div>

            {canCreateTask && (
              <button
                onClick={() => {
                  setShowCreateForm((open) => !open);
                  setFormError(null);
                }}
                className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-indigo-500"
              >
                {showCreateForm ? "close new task" : "new task"}
              </button>
            )}
          </div>

          {showCreateForm && canCreateTask && (
            <form
              className="mb-6 grid gap-3 rounded-md border border-border bg-bg p-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                setFormError(null);

                createTask.mutate({
                  title,
                  description: description || undefined,
                  status,
                  assigneeId: assigneeId || null,
                });
              }}
            >
              <label className="block">
                <span className="text-xs text-muted">title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs text-muted">status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  {STATUS_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {STATUS_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs text-muted">description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs text-muted">assignee</span>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">unassigned</option>
                  {project.memberships.map((membership) => (
                    <option key={membership.user.id} value={membership.user.id}>
                      {membership.user.name}
                    </option>
                  ))}
                </select>
              </label>

              {formError && (
                <p className="text-sm text-red-400 md:col-span-2">{formError}</p>
              )}

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={createTask.isPending}
                  className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {createTask.isPending ? "creating…" : "create task"}
                </button>
              </div>
            </form>
          )}

          <div className="grid gap-4 lg:grid-cols-4">
            {STATUS_ORDER.map((columnStatus) => (
              <section
                key={columnStatus}
                className="rounded-lg border border-border bg-bg p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {STATUS_LABELS[columnStatus]}
                  </h3>
                  <span className="text-xs text-muted">
                    {grouped[columnStatus].length}
                  </span>
                </div>

                <div className="space-y-3">
                  {grouped[columnStatus].length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted">
                      no tasks
                    </p>
                  ) : (
                    grouped[columnStatus].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => setActiveTask(task)}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">recent activity</h2>
            <p className="text-xs text-muted">
              most recent changes are shown first.
            </p>
          </div>

          {activityQuery.isLoading && (
            <p className="text-xs text-muted">loading activity…</p>
          )}

          {activityQuery.isError && (
            <p className="text-xs text-muted">
              activity feed unavailable.
            </p>
          )}

          {!activityQuery.isLoading &&
            !activityQuery.isError &&
            (activityQuery.data?.activity?.length ?? 0) === 0 && (
              <p className="text-xs text-muted italic">no activity yet.</p>
            )}

          {!!activityQuery.data?.activity?.length && (
            <ul className="space-y-3">
              {activityQuery.data.activity.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-bg p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm">{item.message}</p>
                      {item.task?.title && (
                        <p className="mt-1 text-xs text-muted">
                          task: {item.task.title}
                        </p>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {activeTask && (
        <TaskDetail
          task={activeTask}
          projectId={project.id}
          members={project.memberships as ApiProjectMember[]}
          onClose={() => setActiveTask(null)}
        />
      )}
    </main>
  );
}
