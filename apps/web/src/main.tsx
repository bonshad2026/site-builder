import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { AppRoot } from './app/AppRoot';
import { routes } from './app/routes';
import './styles/index.css';

const makeRouter = (basename: string | undefined) => createBrowserRouter(routes, { basename });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot
      initialPath={window.location.pathname}
      makeRouter={makeRouter}
      replaceUrl={(url) => window.history.replaceState(null, '', url)}
    />
  </StrictMode>,
);
