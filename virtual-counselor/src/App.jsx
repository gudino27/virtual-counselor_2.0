import React, { useState, Suspense, lazy, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ChatWidget from './components/ChatWidget'; // <-- Import the ChatWidget
import { saveTheme, loadTheme } from './utils/storage';
import './index.css';

// Lazy load heavy components for better initial bundle size
const DegreePlanner = lazy(() => import('./components/DegreePlanner'));
const CoursePlanner = lazy(() => import('./components/CoursePlanner'));
const ChatPage = lazy(() => import('./components/ChatPage'));

// Loading spinner component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-gray-200 dark:border-gray-700 border-t-wsu-crimson rounded-full animate-spin"></div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('planner');
  const [theme, setTheme] = useState('light');

  // Load theme on mount
  useEffect(() => {
    const savedTheme = loadTheme();
    setTheme(savedTheme);
    document.documentElement.className = savedTheme;
  }, []);

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    saveTheme(newTheme);
    document.documentElement.className = newTheme;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors duration-300 relative">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: theme === 'dark' ? '#1e293b' : '#333',
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
      
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} toggleTheme={toggleTheme} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 safe-area-pb">
        <Suspense fallback={<LoadingSpinner />}>
          {activeTab === 'planner' && <DegreePlanner />}
          {activeTab === 'search' && <CoursePlanner />}
          {activeTab === 'chat' && <ChatPage />}      {/* Chat Page addition */}
        </Suspense>
      </main>

      {/* Mount ChatWidget at the root level so it persists across tab changes & hide floating widget if already on full screen chat */}      
      {activeTab !== 'chat' && <ChatWidget />}

    </div>
  );
}

export default App;