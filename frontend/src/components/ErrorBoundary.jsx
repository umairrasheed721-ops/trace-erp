import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("🛡️ UI Safety Net Caught Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" style={{
          padding: '40px',
          textAlign: 'center',
          background: 'var(--bg-surface)',
          border: '1px solid var(--red)',
          borderRadius: '12px',
          margin: '20px'
        }}>
          <h2 style={{ color: 'var(--red)' }}>⚠️ Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)' }}>This component crashed, but the rest of the ERP is still safe.</p>
          <pre style={{ 
            fontSize: '0.75rem', 
            background: 'black', 
            padding: '10px', 
            borderRadius: '6px',
            textAlign: 'left',
            marginTop: '20px',
            overflow: 'auto',
            maxHeight: '200px'
          }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '20px' }}
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
