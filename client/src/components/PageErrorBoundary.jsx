import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Contain page failures so navigation and account controls remain available.
export class PageErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Console page failed:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="console-recovery" role="alert">
      <AlertTriangle size={28}/><h1>This page could not be displayed</h1>
      <p>Your session is still active. Retry this page or choose another section from the navigation.</p>
      <button onClick={() => this.setState({ failed: false })}><RefreshCw size={16}/> Retry page</button>
    </section>;
  }
}
