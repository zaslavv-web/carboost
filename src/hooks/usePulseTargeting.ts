import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { laravel } from "@/integrations/laravel/client";

export type PulseTargetType = "department" | "subdivision" | "position" | "user";
export interface PulseTarget { id?: string; target_type: PulseTargetType; target_ref: string }
export interface PulseInvitee { id: string; email: string; status: string }
export interface PulseResolvedUser { email: string; user_id: string; full_name: string | null; in_company: boolean }

export function useAudience(surveyId: string | null) {
  return useQuery({
    queryKey: ["pulse-audience", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await laravel.get<{ count: number; users: Array<{ user_id: string; full_name: string | null }> }>(
        `/pulse-surveys/${surveyId}/audience`,
      );
      if (error) throw new Error(error.message);
      return data!;
    },
  });
}

export function useTargets(surveyId: string | null) {
  return useQuery({
    queryKey: ["pulse-targets", surveyId],
    enabled: !!surveyId,
    queryFn: async () => {
      const { data, error } = await laravel.get<{ targets: PulseTarget[]; invitees: PulseInvitee[] }>(
        `/pulse-surveys/${surveyId}/targets`,
      );
      if (error) throw new Error(error.message);
      return data!;
    },
  });
}

export function useSaveTargets(surveyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targets: Array<{ type: PulseTargetType; ref: string }>) => {
      const { data, error } = await laravel.post(`/pulse-surveys/${surveyId}/targets`, { targets });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pulse-targets", surveyId] });
      qc.invalidateQueries({ queryKey: ["pulse-audience", surveyId] });
    },
  });
}

export function useResolveRoster(surveyId: string | null) {
  return useMutation({
    mutationFn: async (emails: string[]) => {
      const { data, error } = await laravel.post<{ found: PulseResolvedUser[]; not_found: string[] }>(
        `/pulse-surveys/${surveyId}/roster/resolve`,
        { emails },
      );
      if (error) throw new Error(error.message);
      return data!;
    },
  });
}

export function useCommitRoster(surveyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { user_ids: string[]; external_emails: string[] }) => {
      const { data, error } = await laravel.post(`/pulse-surveys/${surveyId}/roster/commit`, payload);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pulse-targets", surveyId] });
      qc.invalidateQueries({ queryKey: ["pulse-audience", surveyId] });
    },
  });
}

export function useBulkQuestions(surveyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (questions: Array<{ title: string; kind: string; options?: string[] | null; is_required?: boolean }>) => {
      const { data, error } = await laravel.post<{ imported: number }>(
        `/pulse-surveys/${surveyId}/questions/bulk`,
        { questions },
      );
      if (error) throw new Error(error.message);
      return data!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pulse-questions", surveyId] }),
  });
}
