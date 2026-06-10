/**
 * Phase 13 — Supabase client удалён из рантайма.
 *
 * Файл может перегенерироваться Lovable Cloud, поэтому держим здесь
 * inert-заглушку без импорта `@supabase/supabase-js`. Любое обращение
 * к `supabase.*` бросит явную ошибку — используйте laravelDb / laravelRpc /
 * laravelAuthApi / laravelStorage из `src/integrations/laravel/*`.
 */

const handler: ProxyHandler<object> = {
  get(_t, prop) {
    throw new Error(
      `[supabase] Удалён в Phase 13 — используйте laravelDb / laravelRpc / laravelAuthApi / laravelStorage. Обращение: .${String(prop)}`,
    );
  },
};

export const supabase: any = new Proxy({}, handler);
