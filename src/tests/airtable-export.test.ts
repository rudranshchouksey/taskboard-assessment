import { describe, it, expect } from "vitest";
import {
  AirtableMockClient,
  AirtableError,
  type AirtableFields,
} from "@/lib/airtable-mock";

type ExportTask = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  assignee: { name: string } | null;
};

function toFields(task: ExportTask): AirtableFields {
  return {
    "Task ID": task.id,
    "Project ID": task.projectId,
    Title: task.title,
    Description: task.description ?? "",
    Status: task.status,
    Assignee: task.assignee?.name ?? "Unassigned",
    Position: task.position,
    "Created At": task.createdAt.toISOString(),
    "Updated At": task.updatedAt.toISOString(),
  };
}

async function exportWithMock(client: AirtableMockClient, tasks: ExportTask[]) {
  const result = {
    total: tasks.length,
    created: 0,
    updated: 0,
    failed: 0,
    failures: [] as { taskId: string; permanent: boolean; error: string }[],
  };

  for (const task of tasks) {
    try {
      const existing = client.__getRecords().find(
        (r) => r.fields["Task ID"] === task.id
      );

      if (existing) {
        await client.update(existing.id, toFields(task));
        result.updated += 1;
      } else {
        await client.create({
          id: task.id,
          fields: toFields(task),
        });
        result.created += 1;
      }
    } catch (error) {
      const statusCode = (error as AirtableError).statusCode ?? 0;
      result.failed += 1;
      result.failures.push({
        taskId: task.id,
        permanent: !(statusCode === 429 || statusCode >= 500),
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return result;
}

function makeTask(id: string): ExportTask {
  return {
    id,
    projectId: "p_1",
    title: `Task ${id}`,
    description: "desc",
    status: "todo",
    position: 0,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    assignee: { name: "Meera" },
  };
}

describe("Airtable export", () => {
  it("creates records on first export", async () => {
    const client = new AirtableMockClient();
    const result = await exportWithMock(client, [makeTask("t1"), makeTask("t2")]);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(client.__getRecordCount()).toBe(2);
  });

  it("updates existing records on rerun instead of duplicating", async () => {
    const client = new AirtableMockClient();

    await exportWithMock(client, [makeTask("t1"), makeTask("t2")]);
    const result = await exportWithMock(client, [makeTask("t1"), makeTask("t2")]);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);
    expect(client.__getRecordCount()).toBe(2);
  });

  it("continues when one record fails", async () => {
    const client = new AirtableMockClient();

    const originalCreate = client.create.bind(client);
    client.create = async (input) => {
      if (input.id === "t2") {
        throw new AirtableError("validation failed", "invalid_request", 422);
      }
      return originalCreate(input);
    };

    const result = await exportWithMock(client, [
      makeTask("t1"),
      makeTask("t2"),
      makeTask("t3"),
    ]);

    expect(result.created).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures[0].taskId).toBe("t2");
    expect(result.failures[0].permanent).toBe(true);
  });

  it("maps unassigned tasks correctly", async () => {
    const client = new AirtableMockClient();
    const task = { ...makeTask("t1"), assignee: null };

    await exportWithMock(client, [task]);

    expect(client.__getRecords()[0].fields["Assignee"]).toBe("Unassigned");
  });
});