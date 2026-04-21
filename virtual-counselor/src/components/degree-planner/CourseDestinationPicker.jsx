import { useState } from 'react';
import { Calendar } from 'lucide-react';

export default function CourseDestinationPicker({ show, onClose, course, currentYear, currentTerm, years, onMove }) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedTerm, setSelectedTerm] = useState(currentTerm);

  if (!show) return null;

  const terms = [
    { key: 'fall', label: 'Fall' },
    { key: 'spring', label: 'Spring' },
    { key: 'summer', label: 'Summer' },
  ];

  const handleMove = () => {
    if (selectedYear === currentYear && selectedTerm === currentTerm) {
      onClose();
      return;
    }
    onMove(course, currentYear, currentTerm, selectedYear, selectedTerm);
    onClose();
  };

  const courseName = course?.name || 'Course';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Move Course"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-wsu-crimson to-red-700 px-6 py-4 text-white">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <h2 className="text-xl font-bold">Move Course</h2>
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
          {/* Course Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Moving Course</p>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-1 font-semibold">{courseName}</p>
                <p className="text-xs text-blue-700 dark:text-blue-500 mt-1">
                  From: {years.find(y => y.id === currentYear)?.name} - {terms.find(t => t.key === currentTerm)?.label}
                </p>
              </div>
            </div>
          </div>

          {/* Year Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Select Destination Year
            </label>
            <div className="grid grid-cols-2 gap-3">
              {years.map(year => (
                <button
                  key={year.id}
                  onClick={() => setSelectedYear(year.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedYear === year.id
                      ? 'border-wsu-crimson bg-red-50 dark:bg-red-900/20 text-wsu-crimson dark:text-red-400'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1"><Calendar className="w-6 h-6 mx-auto" /></div>
                    <div className="font-semibold text-sm">{year.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Term Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Select Destination Term
            </label>
            <div className="grid grid-cols-3 gap-3">
              {terms.map(term => (
                <button
                  key={term.key}
                  onClick={() => setSelectedTerm(term.key)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedTerm === term.key
                      ? 'border-wsu-crimson bg-red-50 dark:bg-red-900/20 text-wsu-crimson dark:text-red-400'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1">{term.icon}</div>
                    <div className="font-semibold text-sm">{term.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview Destination */}
          {(selectedYear !== currentYear || selectedTerm !== currentTerm) && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-300">Moving To</p>
                  <p className="text-sm text-green-800 dark:text-green-400 mt-1">
                    {years.find(y => y.id === selectedYear)?.name} - {terms.find(t => t.key === selectedTerm)?.label}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Same location warning */}
          {selectedYear === currentYear && selectedTerm === currentTerm && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-300">Same Location</p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-400 mt-1">
                    Course is already in this location
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={selectedYear === currentYear && selectedTerm === currentTerm}
            className="flex-1 px-4 py-2 bg-wsu-crimson text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            Move Course
          </button>
        </div>
      </div>
    </div>
  );
}
