import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadLocale } from './i18n/store';
import { readInitialLang } from './i18n/I18nProvider';
import ErrorBoundary from './components/ErrorBoundary';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { installHorizontalWheel } from './utils/horizontalWheel';

// a normal mouse wheel scrolls tab bars and other horizontal rows that overflow (see utils/horizontalWheel)
installHorizontalWheel();

function render() {
  ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
      {/* Last-resort boundary: if the shell itself (layout/i18n) throws, show the error card instead of a blank window. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Only the active language's dictionaries are fetched (one chunk); t() is synchronous, so wait for them.
// A failed chunk still renders (texts fall back to the inline defaults).
loadLocale(readInitialLang()).catch(() => {}).finally(render);