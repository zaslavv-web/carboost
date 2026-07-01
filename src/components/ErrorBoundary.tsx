import { Component, ReactNode } from "react";
import { clearStoredAuthState } from "@/lib/authStorage";

interface State {
  error: Error | null;
}

/**
 * App-level ErrorBoundary. Prevents a single page crash from rendering a blank
 * white screen — especially important on mobile where there's no devtools.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Surface in console + (optionally) analytics
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    // Bounce home — usually recovers from a broken route
    try { window.location.assign("/"); } catch { /* noop */ }
  };

  clearSession = () => {
    clearStoredAuthState({ includeToken: true, reason: "error_boundary" });
    try { window.location.assign("/login"); } catch { /* noop */ }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 shadow-elevated text-center space-y-4">
          <div className="text-3xl">⚠️</div>
          <h1 className="text-lg font-semibold text-foreground">Что-то пошло не так</h1>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || "Произошла непредвиденная ошибка."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={this.reset}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Перезагрузить
            </button>
            <button
              onClick={this.clearSession}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm font-medium hover:bg-secondary transition-colors"
            >
              Выйти и очистить сессию
            </button>
          </div>
        </div>
      </div>
    );
  }
}
