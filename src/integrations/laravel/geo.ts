import { laravel } from "./client";

export interface GeoInfo {
  country: string | null;
  is_ru: boolean;
  providers: {
    email: boolean;
    google: boolean;
    yandex: boolean;
  };
  reason: string | null;
}

export const geoApi = {
  info: () => laravel.get<GeoInfo>("/geo"),
};
