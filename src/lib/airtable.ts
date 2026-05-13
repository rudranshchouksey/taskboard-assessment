import Airtable from "airtable";

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

export type AirtableExportFailure = {
  taskId: string;
  error: string;
  permanent: boolean;
};

export type AirtableExportResult = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  failures: AirtableExportFailure[];
};

const MAX_RETRIES = 3;

function getBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }

  const airtable = new Airtable({ apiKey });
  return airtable.base(baseId);
}

function getTableName() {
  return process.env.AIRTABLE_TABLE_NAME || "Tasks";
}

function isTransientError(error: unknown) {
  const statusCode = (error as { statusCode?: number })?.statusCode ?? 0;
  return statusCode === 429 || statusCode >= 500;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isTransientError(error)) {
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError;
}

function toFields(task: ExportTask) {
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

async function findExistingRecordId(taskId: string): Promise<string | null> {
  const base = getBase();
  const table = getTableName();

  const records = await withRetry(
    () =>
      base(table)
        .select({
          maxRecords: 1,
          filterByFormula: `{Task ID} = "${taskId}"`,
        })
        .firstPage()
  );

  return records[0]?.id ?? null;
}

export async function exportTasksToAirtable(
  tasks: ExportTask[]
): Promise<AirtableExportResult> {
  const base = getBase();
  const table = getTableName();

  const result: AirtableExportResult = {
    total: tasks.length,
    created: 0,
    updated: 0,
    failed: 0,
    failures: [],
  };

  for (const task of tasks) {
    try {
      const existingRecordId = await findExistingRecordId(task.id);
      const fields = toFields(task);

      if (existingRecordId) {
        await withRetry(() => base(table).update(existingRecordId, fields));
        result.updated += 1;
      } else {
        await withRetry(() => base(table).create(fields));
        result.created += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        taskId: task.id,
        error: error instanceof Error ? error.message : "unknown error",
        permanent: !isTransientError(error),
      });
    }
  }

  return result;
}