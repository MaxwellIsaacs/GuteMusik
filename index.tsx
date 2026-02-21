import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { ServerProvider } from './context/ServerContext';
import { AudioProvider } from './context/AudioContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ServerProvider>
      <AudioProvider>
        <App />
      </AudioProvider>
    </ServerProvider>
  </React.StrictMode>
);