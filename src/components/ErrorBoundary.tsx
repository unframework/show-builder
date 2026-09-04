import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
}

// Top-level catch so a render-time throw shows the error on screen instead of a
// blank page — the only practical way to read a crash on a phone. The reset
// buttons cover the usual culprit (a saved bank the new build can't render) and a
// plain reload.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] render crash', error, info);
    this.setState({ info: info.componentStack ?? '' });
  }

  private clearPresets = (): void => {
    localStorage.removeItem('gothicFolly.presets');
    location.reload();
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-dvh overflow-auto bg-base-300 p-4 text-base-content">
        <h1 className="text-error text-lg font-semibold">The UI hit an error</h1>
        <p className="mt-2 font-mono text-sm break-words">
          {error.name}: {error.message}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => location.reload()}
          >
            Reload
          </button>
          <button type="button" className="btn btn-sm" onClick={this.clearPresets}>
            Clear saved presets &amp; reload
          </button>
        </div>
        <pre className="mt-4 max-h-[50dvh] overflow-auto rounded bg-base-200 p-2 text-xs whitespace-pre-wrap">
          {error.stack}
          {info}
        </pre>
      </div>
    );
  }
}
