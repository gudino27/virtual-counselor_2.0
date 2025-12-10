import React, { useState } from 'react';

function Navbar({ activeTab, setActiveTab }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { id: 'planner', label: 'Degree Planner' },
    { id: 'search', label: 'Course Search' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-[#981e32] text-white shadow-lg navbar-fixed transition-all duration-300">
      <div className="container-custom">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center space-x-3">
             <img src="/src/assets/logo.png" alt="VC Logo" className="w-10 h-10 rounded-lg shadow-sm border border-white/20" />
            <div>
              <h1 className="text-lg md:text-xl font-bold leading-tight">Virtual Counselor</h1>
              <p className="text-[10px] md:text-xs text-red-100 font-medium tracking-wide uppercase">Washington State University</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => setActiveTab(link.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === link.id
                    ? 'bg-white text-[#981e32] shadow-md transform scale-105'
                    : 'text-red-50 hover:bg-white/10 hover:text-white'
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-none"
            aria-label="Toggle menu"
          >
            <svg 
              className={`w-6 h-6 transition-transform duration-300 ${mobileMenuOpen ? 'rotate-90' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <div 
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileMenuOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-2 bg-[#8a1b2d] shadow-inner">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => {
                setActiveTab(link.id);
                setMobileMenuOpen(false);
              }}
              className={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all ${
                activeTab === link.id
                  ? 'bg-white text-[#981e32] shadow-sm translate-x-1'
                  : 'text-red-50 hover:bg-white/10'
              }`}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
