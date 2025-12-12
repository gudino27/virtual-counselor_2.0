import React from 'react';

function OptimizeModal({ show, onClose, optimizeSpeed, setOptimizeSpeed, onOptimize }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Optimize Schedule</h3>
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
            <span>Accelerated (23 credits/semester)</span>
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
            <span>Normal (15-18 credits/semester)</span>
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
            <span>Relaxed (12 credits/semester minimum)</span>
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
            className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default OptimizeModal;
