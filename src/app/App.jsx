import { BrowserRouter } from 'react-router-dom';
import EntityLineage from '@/features/lineage/pages/EntityLineage';
import ErrorBoundary from './ErrorBoundary';
import styles from './App.module.css';

/**
 * The whole app is the lineage screen, at every path.
 *
 * The router is here only for the URL: the focus asset and the level are kept
 * in the query string (`?asset=…&level=column`), so a view can be linked to and
 * Back returns to the previous one. There are no routes to match.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className={styles.app}>
          <EntityLineage />
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
