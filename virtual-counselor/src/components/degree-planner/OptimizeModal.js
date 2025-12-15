import React from 'react';

function OptimizeModal({ show, onClose, optimizeSpeed, setOptimizeSpeed, includeSummer, setIncludeSummer, ensureFullTime, setEnsureFullTime, onOptimize }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4 dark:text-white">Optimize Schedule</h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name="speed"
              value="accelerated"
              checked={optimizeSpeed === 'accelerated'}
              onChange={(e) => setOptimizeSpeed(e.target.value)}
              className="w-4 h-4"
            />
            <span className="dark:text-gray-200">Accelerated (23 credits/semester)</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name="speed"
              value="normal"
              checked={optimizeSpeed === 'normal'}
              onChange={(e) => setOptimizeSpeed(e.target.value)}
              className="w-4 h-4"
            />
            <span className="dark:text-gray-200">Normal (15-18 credits/semester)</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name="speed"
              value="relaxed"
              checked={optimizeSpeed === 'relaxed'}
              onChange={(e) => setOptimizeSpeed(e.target.value)}
              className="w-4 h-4"
            />
            <span className="dark:text-gray-200">Relaxed (12 credits/semester minimum)</span>
          </label>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSummer}
              onChange={(e) => setIncludeSummer(e.target.checked)}
              className="w-4 h-4 text-wsu-crimson rounded focus:ring-wsu-crimson"
            />
            <span className="dark:text-gray-200 font-medium">Include Summer Terms</span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={ensureFullTime}
              onChange={(e) => setEnsureFullTime(e.target.checked)}
              className="w-4 h-4 text-wsu-crimson rounded focus:ring-wsu-crimson"
            />
            <div className="flex flex-col">
                <span className="dark:text-gray-200 font-medium">Ensure Full Time (12+ credits)</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">Allows exceeding relaxed limit (up to 14) to reach 12 credits.</span>
            </div>
          </label>
        </div>
        <div className="flex space-x-3 mt-6">
          <button
            onClick={onOptimize}
            className="flex-1 px-4 py-2 bg-wsu-crimson text-white rounded-lg hover:bg-red-800"
          >
            Optimize
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default OptimizeModal;
