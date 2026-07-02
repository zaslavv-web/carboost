import { Component, ReactNode } from "react";
import { clearStoredAuthState } from "@/lib/authStorage";

interface Props {
  children: ReactNode;
  /** When this key changes, the boundary auto-resets. Useful for per-route reset. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  key?: string;
}

/**
 * App-level ErrorBoundary. Prevents a single page crash from rendering a blank
 * white screen. When `resetKey` changes (e.g. route pathname), the boundary
 * resets automatically so a broken page doesn't lock the whole shell.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) {
      return { key: props.resetKey, error: null };
    }
    return null;
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    try { window.location.assign("/"); } catch { /* noop */ }
  };

  clearSession = () => {
    clearStoredAuthState({ includeToken: true, reason: "error_boundary" });
    try { window.location.assign("/login"); } catch { /* noop */ }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 shadow-elevated text-center space-y-4">
          <div className="text-3xl">⚠️</div>
          <h1 className="text-lg font-semibold text-foreground">Страница не смогла загрузиться</h1>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || "Произошла непредвиденная ошибка."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Повторить
            </button>
            <button
              onClick={this.reset}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-secondary transition-colors"
            >
              На главную
            </button>
            <button
              onClick={this.clearSession}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-secondary transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }
}
