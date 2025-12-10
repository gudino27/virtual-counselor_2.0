import React, { useState } from 'react';
import Navbar from './components/Navbar';
import DegreePlanner from './components/DegreePlanner';
import CoursePlanner from './components/CoursePlanner';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('planner');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 safe-area-pb">
        {activeTab === 'planner' && <DegreePlanner />}
        {activeTab === 'search' && <CoursePlanner />}
      </main>
    </div>
  );
}

export default App;
