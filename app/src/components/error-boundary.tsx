import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Si una pantalla falla (p. ej. por un registro mal formado que llegó de un
 * respaldo o de Drive) se muestra el error en vez de dejar la app en blanco.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
        <p className="font-semibold text-destructive">Esta pantalla tuvo un error</p>
        <p className="font-mono text-xs">{this.state.error.message}</p>
        <Button variant="outline" className="justify-self-start" onClick={() => this.setState({ error: null })}>
          Reintentar
        </Button>
      </div>
    );
  }
}
