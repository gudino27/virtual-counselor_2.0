import React from 'react';
import { GRADE_POINTS } from './CourseRow';

function GradeScaleModal({ show, onClose }) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="WSU Grade Scale"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black bg-opacity-40" />
      <div
        className="relative z-10 w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-lg">WSU Grade Scale</h3>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800 rounded p-1"
            aria-label="Close grade scale"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-700 mb-3">This shows the standard grade-to-point mapping used for GPA calculations.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {Object.entries(GRADE_POINTS).map(([grade, points]) => (
              <div key={grade} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                <div className="font-medium">{grade}</div>
                <div className="text-gray-600">{points.toFixed(1)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-500">Tip: press <span className="font-medium">Esc</span> or tap outside to close.</div>
        </div>
      </div>
    </div>
  );
}

export default GradeScaleModal;
