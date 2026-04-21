import { useEffect } from 'react';

export default function KeyboardShortcutsModal({ show, onClose }) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [show, onClose]);

  if (!show) return null;

  const shortcuts = [
    {
      category: 'General',
      items: [
        { keys: ['?'], description: 'Show this help dialog' },
        { keys: ['Esc'], description: 'Close dialogs and modals' },
      ],
    },
    {
      category: 'Degree Planner',
      items: [
        { keys: ['Ctrl', 'Z'], mac: ['⌘', 'Z'], description: 'Undo last change' },
        { keys: ['Ctrl', 'Shift', 'Z'], mac: ['⌘', 'Shift', 'Z'], description: 'Redo last undone change' },
        { keys: ['Ctrl', 'Y'], mac: ['⌘', 'Y'], description: 'Redo (alternative)' },
      ],
    },
  ];

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-wsu-crimson to-red-700 px-6 py-4 text-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <h2 className="text-xl font-bold">Keyboard Shortcuts</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{section.category}</h3>
              <div className="space-y-2">
                {section.items.map((item, index) => {
                  const keys = isMac && item.mac ? item.mac : item.keys;
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className="text-gray-700 dark:text-gray-300 text-sm">{item.description}</span>
                      <div className="flex items-center gap-1">
                        {keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            {keyIndex > 0 && <span className="text-gray-400 dark:text-gray-500 text-xs">+</span>}
                            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded shadow-sm min-w-[2rem] text-center">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Tip */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Pro Tip</p>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-1">
                  Press <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-blue-100 dark:bg-blue-800 border border-blue-300 dark:border-blue-700 rounded">?</kbd> anytime to view these shortcuts
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
