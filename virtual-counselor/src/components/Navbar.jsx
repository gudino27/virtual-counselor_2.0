import { useState } from 'react';
import logo from '../logo-1024.png';

function Navbar({ activeTab, setActiveTab, theme, toggleTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { id: 'planner', label: 'Degree Planner' },
    { id: 'search', label: 'Course Search' },
    { id: 'chat', label: 'Advisor Chat' }, // Addition for advisor chat screen
  ];

  return (
    <nav className="sticky top-0 z-999 bg-[#981e32] dark:bg-[#7d1829] text-white shadow-lg navbar-fixed transition-all duration-300"style={{zIndex:999}}>
      <div className="container-custom">
        <div className="flex items-center justify-between h-22">
          {/* Logo Section */}
          <div className="flex items-center space-x-3">
             <img src={logo} alt="VC Logo" className="w-20 h-20 rounded-lg shadow-sm logo-spin" />
            <div>
              <h1 className="text-lg md:text-xl font-bold leading-tight">Virtual Counselor</h1>
              <p className="text-[10px] md:text-xs text-red-100 dark:text-red-200 font-medium tracking-wide uppercase">Washington State University</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => setActiveTab(link.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === link.id
                    ? 'bg-white dark:bg-gray-800 text-[#981e32] dark:text-white shadow-md transform scale-105'
                    : 'text-red-50 dark:text-red-100 hover:bg-white/10 dark:hover:bg-white/20 hover:text-white'
                }`}
              >
                {link.label}
              </button>
            ))}

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="p-2 rounded-lg text-red-50 hover:bg-white/10 dark:hover:bg-white/20 transition-colors"
            >
              {theme === 'light' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
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
          mobileMenuOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-2 bg-[#8a1b2d] dark:bg-[#6b1422] shadow-inner">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => {
                setActiveTab(link.id);
                setMobileMenuOpen(false);
              }}
              className={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all ${
                activeTab === link.id
                  ? 'bg-white dark:bg-gray-800 text-[#981e32] dark:text-white shadow-sm translate-x-1'
                  : 'text-red-50 dark:text-red-100 hover:bg-white/10 dark:hover:bg-white/20'
              }`}
            >
              {link.label}
            </button>
          ))}

          {/* Mobile Theme Toggle */}
          <button
            onClick={() => {
              toggleTheme();
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all text-red-50 dark:text-red-100 hover:bg-white/10 dark:hover:bg-white/20 flex items-center gap-3"
          >
            {theme === 'light' ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Dark Mode
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Light Mode
              </>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
