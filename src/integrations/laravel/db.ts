/**
 * Drop-in subset of `supabase.from(table).select().eq()...` (Phase 10).
 *
 * Implements the chainable PostgREST-style query builder against the Laravel
 * `/api/db/{table}` bridge. Covers what the project actually uses:
 *   .select(cols)        .eq/.neq/.gt/.gte/.lt/.lte
 *   .in(col, [...])      .is(col, null)
 *   .like/.ilike         .order(col, { ascending })
 *   .limit(n)            .range(from, to)
 *   .single()            .maybeSingle()
 *   .insert(row|rows)    .update(values).eq(...)
 *   .upsert(row|rows)    .delete().eq(...)
 *
 * The terminal step is `await`-able and returns `{ data, error }`.
 */

import { laravel, type LaravelInvokeResult } from "./client";

type Filter = { op: string; col: string; value: any };

class QueryBuilder<T = any> implements PromiseLike<LaravelInvokeResult<T> & { count: number | null }> {
  private filters: Filter[] = [];
  private selectCols?: string;
  private orderParts: string[] = [];
  private limitN?: number;
  private rangeFrom?: number;
  private rangeTo?: number;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: any = undefined;
  private singleMode: "single" | "maybe" | null = null;
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private headOnly = false;
  private upsertOnConflict?: string;

  constructor(private readonly table: string) {}

  select(cols: string = "*", options: { count?: "exact" | "planned" | "estimated"; head?: boolean } = {}) {
    this.selectCols = cols;
    if (options.count) this.countMode = options.count;
    if (options.head) this.headOnly = true;
    return this;
  }

  eq(col: string, value: any)  { return this.add("eq",  col, value); }
  neq(col: string, value: any) { return this.add("neq", col, value); }
  gt(col: string, value: any)  { return this.add("gt",  col, value); }
  gte(col: string, value: any) { return this.add("gte", col, value); }
  lt(col: string, value: any)  { return this.add("lt",  col, value); }
  lte(col: string, value: any) { return this.add("lte", col, value); }
  like(col: string, p: string)  { return this.add("like",  col, p); }
  ilike(col: string, p: string) { return this.add("ilike", col, p); }
  in(col: string, values: any[]) { return this.add("in", col, values.join(",")); }
  is(col: string, value: null | "null") { return this.add("is", col, "null"); }

  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orderParts.push(`${col}.${opts.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; }

  single()      { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe";  return this; }

  insert(values: any | any[]) { this.mode = "insert"; this.payload = values; return this; }
  upsert(values: any | any[], options: { onConflict?: string } = {}) {
    this.mode = "upsert"; this.payload = values;
    if (options.onConflict) this.upsertOnConflict = options.onConflict;
    return this;
  }
  update(values: any)         { this.mode = "update"; this.payload = values; return this; }
  delete()                    { this.mode = "delete"; return this; }

  // ---- Promise contract ----
  then<TR1 = LaravelInvokeResult<T> & { count: number | null }, TR2 = never>(
    onFulfilled?: ((v: LaravelInvokeResult<T> & { count: number | null }) => TR1 | PromiseLike<TR1>) | null,
    onRejected?: ((reason: any) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return this.execute().then(onFulfilled as any, onRejected as any);
  }

  private add(op: string, col: string, value: any) {
    this.filters.push({ op, col, value });
    return this;
  }

  private buildQuery(): string {
    const params = new URLSearchParams();
    if (this.selectCols) params.set("select", this.selectCols);
    if (this.orderParts.length) params.set("order", this.orderParts.join(","));
    if (this.limitN != null) params.set("limit", String(this.limitN));
    if (this.rangeFrom != null && this.rangeTo != null) {
      params.set("range", `${this.rangeFrom}-${this.rangeTo}`);
    }
    if (this.singleMode === "single") params.set("single", "1");
    if (this.singleMode === "maybe")  params.set("maybeSingle", "1");
    if (this.countMode) params.set("count", this.countMode);
    if (this.headOnly) params.set("head", "1");
    for (const f of this.filters) params.append(`${f.op}.${f.col}`, String(f.value));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  private async execute(): Promise<LaravelInvokeResult<T> & { count: number | null }> {
    const path = `/db/${this.table}${this.buildQuery()}`;
    const unwrap = (r: LaravelInvokeResult<any>): LaravelInvokeResult<T> & { count: number | null } => {
      if (r.error) return { data: null, error: r.error, count: null };
      const body = r.data as any;
      return {
        data: (body?.data ?? null) as T | null,
        error: null,
        count: typeof body?.count === "number" ? body.count : null,
      };
    };

    switch (this.mode) {
      case "select":
        return unwrap(await laravel.get(path));
      case "insert":
      case "upsert":
        return unwrap(await laravel.post(path, {
          values: this.payload,
          upsert: this.mode === "upsert",
          onConflict: this.upsertOnConflict,
        }));
      case "update":
        return unwrap(await laravel.patch(path, { values: this.payload }));
      case "delete":
        return unwrap(await laravel.delete(path));
    }
  }
}

export const laravelDb = {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table);
  },
};
