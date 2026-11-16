import { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '@/components/ui/Button';
import styles from './ErrorBoundary.module.css';

/**
 * Catches render errors so a broken view says so instead of leaving a blank
 * page.
 *
 * Still a class: `getDerivedStateFromError` has no hook equivalent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nothing collects these yet. When error reporting exists, this is its hook.
    console.error('Unhandled render error', error, info);
  }

  render() {
    const { error } = this.state;
    const { children, title = 'The lineage view failed to load' } = this.props;

    if (!error) return children;

    return (
      <div className={styles.wrap} role="alert">
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.hint}>
          {error.message || 'An unexpected error stopped this view from rendering.'}
        </p>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
  title: PropTypes.string,
};
