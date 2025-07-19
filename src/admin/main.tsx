import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered:', registration);
        
        // Check if PWA can be installed
        window.addEventListener('beforeinstallprompt', (e) => {
          console.log('PWA can be installed - beforeinstallprompt fired');
          e.preventDefault();
          // Store the event so it can be triggered later
          (window as any).deferredPrompt = e;
          
          // Optional: Show install button or notification
          console.log('Install prompt available');
        });
        
        window.addEventListener('appinstalled', () => {
          console.log('PWA was installed');
          (window as any).deferredPrompt = null;
        });
      })
      .catch(error => console.log('SW registration failed:', error));
  });
  
  // Log manifest details for debugging
  fetch('/manifest.json')
    .then(response => response.json())
    .then(manifest => console.log('Manifest loaded:', manifest))
    .catch(error => console.log('Manifest loading failed:', error));
    
  // Add some user engagement to trigger install criteria
  let interactionCount = 0;
  ['click', 'keydown', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      interactionCount++;
      if (interactionCount === 1) {
        console.log('User interaction detected - PWA install criteria improving');
      }
    }, { once: true });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Theme appearance="dark" accentColor="blue">
          <App />
        </Theme>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);