import React, { useState, Suspense, lazy, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import './index.css';

// Lazy load heavy components for better initial bundle size
const DegreePlanner = lazy(() => import('./components/DegreePlanner'));
const CoursePlanner = lazy(() => import('./components/CoursePlanner'));

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-wsu-crimson rounded-full animate-spin"></div>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('planner');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#333',
            color: '#fff',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
      {/* Toaster mounted for app-wide toasts */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 safe-area-pb">
        <Suspense fallback={<LoadingSpinner />}>
          {activeTab === 'planner' && <DegreePlanner />}
          {activeTab === 'search' && <CoursePlanner />}
        </Suspense>
      </main>
    </div>
  );
}

export default App;

