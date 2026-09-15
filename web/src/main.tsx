// Mount the dashboard and bundle its fonts locally, without runtime font-service requests.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/lora';
import '@fontsource-variable/lora/wght-italic.css';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
