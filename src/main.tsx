import {StrictMode, Suspense, lazy, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Maintenance from './components/Maintenance.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { ConfirmProvider } from './components/ConfirmDialog.tsx';
import './index.css';

// Admin console is code-split so it never ships in regular users' initial load.
const AdminDashboard = lazy(() => import('./components/AdminDashboard.tsx'));

// Flipped to false once the database migration + cutover is complete. While
// true, only the holding page renders — App and its Firestore listeners never
// mount, so no reads are consumed.
const MAINTENANCE_MODE = false;

// The admin console lives at #admin so it needs no server routing and stays
// reachable even during maintenance.
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const getHash = () => window.location.hash.replace(/^#\/?/, '');

function Root() {
  const hash = useSyncExternalStore(subscribeHash, getHash);
  if (hash === 'admin') return <Suspense fallback={<div className="min-h-dvh bg-natural-bg" />}><AdminDashboard /></Suspense>;
  if (MAINTENANCE_MODE) return <Maintenance />;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
