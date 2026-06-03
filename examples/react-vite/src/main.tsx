import React from 'react';
import { createRoot } from 'react-dom/client';
import { Survey } from './Survey';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <main style={{ maxWidth: 560, margin: '3rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Apex Survey — React example</h1>
      <Survey />
    </main>
  </React.StrictMode>,
);
