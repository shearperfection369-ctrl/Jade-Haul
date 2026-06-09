import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Top-level error boundary so a transient API or render error never crashes
 * the whole cockpit. Renders an in-shell error panel with a Reload button.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="p-6 lg:p-10">
        <div className="jade-panel jade-tracing-border p-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/15 border border-destructive/40 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <div className="font-[Unbounded] text-xl">Jade hit a snag</div>
              <div className="mono text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
                The cockpit caught the error · the rest of the app is fine
              </div>
            </div>
          </div>
          <div className="mt-5 p-4 rounded-lg bg-secondary/60 text-sm break-all font-mono">
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div className="flex gap-2 mt-5">
            <Button onClick={this.reset} data-testid="error-retry">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
            <Button variant="outline" onClick={() => (window.location.href = "/driver")}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
