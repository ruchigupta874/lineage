import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ROUTES } from '@/config/constants/routes';
import { COLUMN_PARAM, LENS_PARAM, LEVEL_PARAM, LINEAGE_PARAM } from '@/features/lineage/constants';
import EnterpriseLineage from '@/features/lineage/pages/EnterpriseLineage';
import EntityLineage from '@/features/lineage/pages/EntityLineage';
import ErrorBoundary from './ErrorBoundary';
import styles from './App.module.css';

/** The params of a lineage view, which before `/lineage` existed were linked to at `/`. */
const LINEAGE_VIEW_PARAMS = [LINEAGE_PARAM, LENS_PARAM, LEVEL_PARAM, COLUMN_PARAM];

/**
 * The enterprise overview — unless the URL is an older link to a lineage view
 * (`/?asset=…`), which goes on to the lineage page so it still opens.
 */
function Home() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (LINEAGE_VIEW_PARAMS.some((key) => params.has(key))) {
    return <Navigate to={{ pathname: ROUTES.lineage, search }} replace />;
  }
  return <EnterpriseLineage />;
}

/**
 * Two pages: the enterprise overview the app opens on, and one asset's
 * lineage, which the overview's search and cards lead to.
 *
 * On the lineage page the focus asset and the level are kept in the query
 * string (`/lineage?asset=…&level=column`), so a view can be linked to and
 * Back returns to the previous one.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className={styles.app}>
          <Routes>
            <Route path={ROUTES.home} element={<Home />} />
            <Route path={ROUTES.lineage} element={<EntityLineage />} />
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
