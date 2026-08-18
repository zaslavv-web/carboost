/**
 * Epic B1 — Интеграция с 1С:ЗУП 8.3.
 * Подключения, маппинг полей, импорт (файл/OData) и журнал синхронизаций.
 */
import { laravel } from "./client";

export type OneCEntity = "department" | "position" | "employee" | "payroll";
export type RunStatus = "running" | "success" | "partial" | "failed";
export type RecordAction = "created" | "updated" | "skipped" | "failed";

export interface OneCConnection {
  id: string;
  name: string;
  base_url: string | null;
  auth_type: "basic" | "none";
  username: string | null;
  is_active: boolean;
  verify_tls: boolean;
  options?: Record<string, unknown>;
  last_sync_at?: string | null;
  last_status?: RunStatus | null;
  last_error?: string | null;
}

export interface FieldMapping {
  id?: string;
  entity: OneCEntity;
  source_field: string;
  target_field: string;
  transform?: string | null;
}

export interface TargetField {
  key: string;
  label: string;
  required: boolean;
}

export interface SyncRun {
  id: string;
  entity: OneCEntity;
  source: "file" | "odata";
  status: RunStatus;
  dry_run: boolean | number;
  total: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface SyncRecord {
  id: string;
  external_id: string | null;
  title: string | null;
  action: RecordAction;
  error: string | null;
  retry_count: number;
}

export interface ImportResult {
  ok: boolean;
  run_id?: string;
  status?: RunStatus;
  total?: number;
  stats?: Record<RecordAction, number>;
  message?: string;
}

export const oneC = {
  listConnections: () =>
    laravel.get<{ data: OneCConnection[] }>("/integrations/1c/connections"),
  createConnection: (body: Partial<OneCConnection> & { secret?: string }) =>
    laravel.post<OneCConnection>("/integrations/1c/connections", body),
  updateConnection: (id: string, body: Partial<OneCConnection> & { secret?: string }) =>
    laravel.patch<OneCConnection>(`/integrations/1c/connections/${id}`, body),
  deleteConnection: (id: string) =>
    laravel.delete(`/integrations/1c/connections/${id}`),
  testConnection: (id: string) =>
    laravel.post<{ ok: boolean; message: string; status?: number }>(
      `/integrations/1c/connections/${id}/test`,
    ),

  targetFields: () =>
    laravel.get<{
      entities: OneCEntity[];
      fields: Record<OneCEntity, TargetField[]>;
      odata_paths: Record<OneCEntity, string>;
    }>("/integrations/1c/target-fields"),

  listMappings: (entity: OneCEntity) =>
    laravel.get<{ data: FieldMapping[] }>(`/integrations/1c/mappings?entity=${entity}`),
  saveMappings: (entity: OneCEntity, mappings: FieldMapping[], connectionId?: string | null) =>
    laravel.post<{ ok: boolean; count: number }>("/integrations/1c/mappings", {
      entity,
      connection_id: connectionId ?? null,
      mappings: mappings.map((m) => ({
        source_field: m.source_field,
        target_field: m.target_field,
        transform: m.transform ?? null,
      })),
    }),

  preview: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return laravel.post<{ ok: boolean; columns: string[]; total: number; sample: any[]; message?: string }>(
      "/integrations/1c/preview",
      fd,
    );
  },

  importFile: (file: File, entity: OneCEntity, opts?: { dryRun?: boolean; connectionId?: string | null }) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entity", entity);
    fd.append("dry_run", opts?.dryRun ? "1" : "0");
    if (opts?.connectionId) fd.append("connection_id", opts.connectionId);
    return laravel.post<ImportResult>("/integrations/1c/import", fd);
  },

  pull: (connectionId: string, entity: OneCEntity, opts?: { path?: string; top?: number; dryRun?: boolean }) =>
    laravel.post<ImportResult>("/integrations/1c/pull", {
      connection_id: connectionId,
      entity,
      path: opts?.path || null,
      top: opts?.top ?? 1000,
      dry_run: opts?.dryRun ?? false,
    }),

  listRuns: () => laravel.get<{ data: SyncRun[] }>("/integrations/1c/runs"),
  runRecords: (id: string, action?: RecordAction) =>
    laravel.get<{ run: SyncRun; data: SyncRecord[] }>(
      `/integrations/1c/runs/${id}${action ? `?action=${action}` : ""}`,
    ),
  retryRun: (id: string) => laravel.post<ImportResult>(`/integrations/1c/runs/${id}/retry`),

  payrollSummary: () =>
    laravel.get<{ data: { period: string; kind: string; entries: number; total: number }[] }>(
      "/integrations/1c/payroll-summary",
    ),
};

export const ENTITY_LABELS: Record<OneCEntity, string> = {
  department: "Подразделения",
  position: "Должности",
  employee: "Сотрудники (кадровые события)",
  payroll: "Начисления и удержания",
};
