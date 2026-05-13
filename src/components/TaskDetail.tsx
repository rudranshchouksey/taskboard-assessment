"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type {
  ApiTask,
  ApiProjectMember,
  TaskStatus,
  Role,
  ApiComment,
} from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type Props = {
  task: ApiTask;
  projectId: string;
  members: ApiProjectMember[];
  onClose: () => void;
};

export function TaskDetail({ task, projectId, members, onClose }: Props) {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();

  const currentMembership =
    members.find((m) => m.user.id === currentUser?.id) ?? null;
  const currentRole: Role = currentMembership?.role ?? "viewer";
  const canMutateTask = currentRole === "admin" || currentRole === "member";
  const canPostComment = canMutateTask;

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ["comments", task.id],
    queryFn: () =>
      apiFetch<{ comments: ApiComment[] }>(`/api/tasks/${task.id}/comments`),
  });

  const postComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ comment: ApiComment }>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: async () => {
      setCommentBody("");
      setCommentError(null);
      await queryClient.invalidateQueries({ queryKey: ["comments", task.id] });
    },
    onError: (err) =>
      setCommentError(err instanceof Error ? err.message : "comment failed"),
  });

  const updateTask = useMutation({
    mutationFn: (input: Partial<ApiTask>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "save failed"),
  });

  const deleteTask = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "delete failed"),
  });

  function onSave() {
    setError(null);
    updateTask.mutate({
      title,
      description,
      status,
      assigneeId: assigneeId || null,
    });
  }

  const comments = commentsData?.comments ?? [];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-border rounded-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">task details</h2>
          <button onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted">title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canMutateTask}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-muted">description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={!canMutateTask}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-muted">status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={!canMutateTask}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted">assignee</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!canMutateTask}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-60"
            >
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-3" role="alert">
            {error}
          </p>
        )}

        {canMutateTask && (
          <div className="flex items-center justify-between gap-3 mb-6">
            <button
              onClick={() => deleteTask.mutate()}
              disabled={deleteTask.isPending}
              className="text-sm text-red-400 hover:text-red-300"
            >
              delete task
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted"
              >
                cancel
              </button>
              <button
                onClick={onSave}
                disabled={updateTask.isPending}
                className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {updateTask.isPending ? "saving…" : "save"}
              </button>
            </div>
          </div>
        )}

        <section className="border-t border-border pt-5">
          <h3 className="text-sm font-medium mb-3">comments</h3>

          {commentsLoading && (
            <p className="text-xs text-muted mb-3">loading comments…</p>
          )}

          {!commentsLoading && comments.length === 0 && (
            <p className="text-xs text-muted italic mb-3">no comments yet.</p>
          )}

          {comments.length > 0 && (
            <ul className="space-y-3 mb-4">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="bg-bg border border-border rounded-md p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {comment.author.name}
                    </span>
                    <span className="text-xs text-muted">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}

          {canPostComment ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentBody.trim()) return;
                postComment.mutate(commentBody.trim());
              }}
              className="space-y-2"
            >
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="add a comment..."
                rows={3}
                className="block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              {commentError && (
                <p className="text-xs text-red-400" role="alert">
                  {commentError}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={postComment.isPending || !commentBody.trim()}
                  className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {postComment.isPending ? "posting…" : "post comment"}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-xs text-muted italic">
              viewers can read comments but cannot post.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}