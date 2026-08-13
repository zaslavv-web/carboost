import { laravel } from "@/integrations/laravel/client";
import { laravelDb } from "@/integrations/laravel/db";

export const fetchHrdDirectory = async () => {
  const response = await laravel.get<{ data: any[] }>("/profiles?per_page=200");
  if (response.error) throw response.error;
  return response.data?.data || [];
};

export const fetchHrdPositions = async () => {
  const { data, error } = await laravelDb
    .from("positions")
    .select("id,title,department,competency_profile,psychological_profile")
    .order("title")
    .limit(200);
  if (error) throw error;
  return data || [];
};