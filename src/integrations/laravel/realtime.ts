/**
 * Drop-in subset of `supabase.channel(...).on('postgres_changes', cb).subscribe()`
 * (Phase 11).
 *
 * Backed by Laravel Reverb (или любой Pusher-совместимый сервер). Лениво
 * грузит `laravel-echo` + `pusher-js`, чтобы не раздувать main bundle, если
 * realtime не используется. На текущем фронтенде нет активных каналов — этот
 * модуль готов как scaffold для будущих фич.
 *
 * Конфиг через env:
 *   VITE_REVERB_KEY=...           VITE_REVERB_HOST=ws.your-domain.tld
 *   VITE_REVERB_PORT=443          VITE_REVERB_SCHEME=https
 *
 * На бэке Reverb настраивается отдельно (см. README-realtime.md).
 */

type PostgresChangesPayload<T = any> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T | null;
  old: T | null;
  schema: string;
  table: string;
};

type Filter = {
  event: "*" | "INSERT" | "UPDATE" | "DELETE";
  schema?: string;
  table?: string;
  filter?: string;
};

let echoPromise: Promise<any> | null = null;

const getEcho = async () => {
  if (echoPromise) return echoPromise;
  echoPromise = (async () => {
    const [{ default: Echo }, Pusher] = await Promise.all([
      import(/* @vite-ignore */ "laravel-echo"),
      import(/* @vite-ignore */ "pusher-js"),
    ]);
    (window as any).Pusher = (Pusher as any).default ?? Pusher;
    return new Echo({
      broadcaster: "reverb",
      key: import.meta.env.VITE_REVERB_KEY,
      wsHost: import.meta.env.VITE_REVERB_HOST,
      wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
      wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
      forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? "https") === "https",
      enabledTransports: ["ws", "wss"],
    });
  })();
  return echoPromise;
};

class LaravelChannel {
  private listeners: Array<{ filter: Filter; cb: (p: PostgresChangesPayload) => void }> = [];
  private subscribed = false;
  private rawChannel: any = null;

  constructor(private readonly name: string) {}

  on(event: "postgres_changes", filter: Filter, cb: (p: PostgresChangesPayload) => void) {
    if (event === "postgres_changes") {
      this.listeners.push({ filter, cb });
    }
    return this;
  }

  async subscribe(callback?: (status: "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR") => void) {
    try {
      const echo = await getEcho();
      this.rawChannel = echo.private(this.name);
      // Bind to a single broadcast event "PostgresChange" emitted by the
      // server (see app/Events/PostgresChange.php). Server pushes the same
      // payload shape Supabase Realtime uses, so existing handlers Just Work.
      this.rawChannel.listen("PostgresChange", (p: PostgresChangesPayload) => {
        for (const { filter, cb } of this.listeners) {
          if (filter.table && filter.table !== p.table) continue;
          if (filter.event !== "*" && filter.event !== p.eventType) continue;
          cb(p);
        }
      });
      this.subscribed = true;
      callback?.("SUBSCRIBED");
    } catch (e) {
      console.error("[laravelRealtime] subscribe failed", e);
      callback?.("CHANNEL_ERROR");
    }
    return this;
  }

  async unsubscribe() {
    if (!this.subscribed) return;
    try {
      const echo = await getEcho();
      echo.leave(this.name);
    } catch {
      /* ignore */
    }
    this.subscribed = false;
  }
}

export const laravelRealtime = {
  channel(name: string) {
    return new LaravelChannel(name);
  },
  removeChannel(channel: LaravelChannel) {
    void channel.unsubscribe();
  },
};
