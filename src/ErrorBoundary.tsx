// A screen that fails to draw shows this instead of a blank page, with a way
// back to the tour list. Going to another screen clears it.

import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private clear = () => this.setState({ error: null });

  componentDidMount() {
    window.addEventListener('hashchange', this.clear);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.clear);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="app">
        <main className="screen">
          <header className="screen-head">
            <h1 className="title">This screen could not be shown</h1>
            <p className="note">Nothing was deleted. Your tours are still saved on this device.</p>
          </header>
          <p className="note money">{error.message}</p>
          <a
            className="btn"
            href="#/tours"
            onClick={() => {
              // The address may already be the tour list, in which case nothing else would clear this.
              this.clear();
            }}
          >
            Back to the tour list
          </a>
          <button className="btn quiet" type="button" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </main>
      </div>
    );
  }
}
