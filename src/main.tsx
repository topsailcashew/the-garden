import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Maintenance from './components/Maintenance.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { ConfirmProvider } from './components/ConfirmDialog.tsx';
import './index.css';

// Flipped to false once the database migration + cutover is complete. While
// true, only the holding page renders — App and its Firestore listeners never
// mount, so no reads are consumed.
const MAINTENANCE_MODE = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {MAINTENANCE_MODE ? (
      <Maintenance />
    ) : (
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    )}
  </StrictMode>,
);
