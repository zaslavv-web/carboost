/**
 * Leaves module — REST helpers (Iteration 1).
 *
 * Backend: /api/leave-types, /api/leave-balances, /api/leave-requests,
 *          /api/leave-compensations
 */
import { laravel } from "./client";

export type LeaveTypeCode =
  | "annual"
  | "sick_paid"
  | "sick_unpaid"
  | "maternity"
  | "study"
  | "day_off"
  | "unpaid";

export interface LeaveType {
  id: string;
  company_id: string;
  code: LeaveTypeCode | string;
  title: string;
  paid: boolean;
  accrual_days_per_year: number;
  requires_medical_cert: boolean;
  is_active: boolean;
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  leave_type_id: string;
  accrued_days: number;
  used_days: number;
  carryover_days: number;
  leaveType?: LeaveType;
}

export type LeaveStatus =
  | "pending_manager"
  | "pending_hr"
  | "approved"
  | "rejected"
  | "cancelled";

export interface LeaveRequestFile {
  id: string;
  request_id: string;
  file_url: string;
  file_name?: string | null;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  company_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason?: string | null;
  status: LeaveStatus;
  manager_id?: string | null;
  manager_comment?: string | null;
  manager_decision_at?: string | null;
  hr_id?: string | null;
  hr_comment?: string | null;
  hr_decision_at?: string | null;
  substitute_user_id?: string | null;
  paid_days?: number | null;
  unpaid_days?: number | null;
  created_at: string;
  leaveType?: LeaveType;
  files?: LeaveRequestFile[];
}

export interface LeaveCompensation {
  id: string;
  user_id: string;
  unused_days: number;
  daily_rate: number;
  total_amount: number;
  currency: string;
  calculated_at?: string | null;
  paid_at?: string | null;
  notes?: string | null;
}

interface Paginated<T> {
  data: T[];
  total: number;
  current_page: number;
  last_page: number;
}

const unwrap = <T,>(r: Paginated<T> | T[] | null | undefined): T[] => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return (r as Paginated<T>).data ?? [];
};

export const leavesApi = {
  // Types
  listTypes: async (onlyActive = true) => {
    const { data, error } = await laravel.get<Paginated<LeaveType>>(
      `/leave-types${onlyActive ? "?only_active=1" : ""}`,
    );
    if (error) throw new Error(error.message);
    return unwrap(data);
  },
  createType: (payload: Partial<LeaveType>) => laravel.post<LeaveType>("/leave-types", payload),
  updateType: (id: string, payload: Partial<LeaveType>) =>
    laravel.patch<LeaveType>(`/leave-types/${id}`, payload),
  deleteType: (id: string) => laravel.delete(`/leave-types/${id}`),

  // Balances
  listBalances: async (userId?: string) => {
    const qs = userId ? `?user_id=${userId}` : "";
    const { data, error } = await laravel.get<Paginated<LeaveBalance>>(`/leave-balances${qs}`);
    if (error) throw new Error(error.message);
    return unwrap(data);
  },
  upsertBalance: (payload: Partial<LeaveBalance>) =>
    laravel.post<LeaveBalance>("/leave-balances", payload),

  // Requests
  listRequests: async (scope: "mine" | "inbox" | "all" = "mine", status?: LeaveStatus) => {
    const params = new URLSearchParams({ scope });
    if (status) params.set("status", status);
    const { data, error } = await laravel.get<Paginated<LeaveRequest>>(
      `/leave-requests?${params.toString()}`,
    );
    if (error) throw new Error(error.message);
    return unwrap(data);
  },
  createRequest: (payload: {
    leave_type_id: string;
    start_date: string;
    end_date: string;
    reason?: string;
    substitute_user_id?: string;
    files?: { file_url: string; file_name?: string }[];
  }) => laravel.post<LeaveRequest>("/leave-requests", payload),
  approve: (id: string, comment?: string) =>
    laravel.post<LeaveRequest>(`/leave-requests/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    laravel.post<LeaveRequest>(`/leave-requests/${id}/reject`, { comment }),
  cancel: (id: string) => laravel.post<LeaveRequest>(`/leave-requests/${id}/cancel`),

  // Compensations
  listCompensations: async (userId?: string) => {
    const qs = userId ? `?user_id=${userId}` : "";
    const { data, error } = await laravel.get<Paginated<LeaveCompensation>>(
      `/leave-compensations${qs}`,
    );
    if (error) throw new Error(error.message);
    return unwrap(data);
  },
  calculateCompensation: (payload: {
    user_id: string;
    daily_rate: number;
    currency?: string;
    notes?: string;
  }) => laravel.post<LeaveCompensation>("/leave-compensations/calculate", payload),
  markCompensationPaid: (id: string) =>
    laravel.post<LeaveCompensation>(`/leave-compensations/${id}/paid`),
};
