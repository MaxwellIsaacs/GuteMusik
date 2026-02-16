import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import { MiniPlayer } from './components/MiniPlayer';
import { ServerProvider } from './context/ServerContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ServerProvider>
      <MiniPlayer />
    </ServerProvider>
  </React.StrictMode>
);
