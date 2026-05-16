/**
 * Phase 13 — Supabase client удалён.
 *
 * Файл оставлен как inert-заглушка: Lovable-окружение может его перегенерировать,
 * но рантайма он не выполняет. Никаких сетевых вызовов к *.supabase.co.
 *
 * Если что-то в коде по ошибке импортирует `supabase` отсюда — TS/рантайм
 * сразу укажет на проблему через explicit throw в proxy ниже.
 */

const handler: ProxyHandler<object> = {
  get(_t, prop) {
    throw new Error(
      `[supabase] Удалён в Phase 13 — используйте laravelDb / laravelRpc / laravelAuthApi / laravelStorage. Обращение: .${String(prop)}`,
    );
  },
};

export const supabase: any = new Proxy({}, handler);
