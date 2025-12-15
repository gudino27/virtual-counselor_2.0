import React from "react";

export default function DegreePlannerHeader({
  undo,
  redo,
  canUndo,
  canRedo,
  onOptimize,
  onExport,
  onPrintPDF,
  onExportICS,
  onImport,
  onReset,
  onWhatIf,
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {/* Undo/Redo Buttons */}
      <button
        onClick={undo}
        disabled={!canUndo}
        className="w-auto px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition touch-manipulation text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Undo last change"
        title="Undo (Ctrl+Z)"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          />
        </svg>
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className="w-auto px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition touch-manipulation text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Redo last undone change"
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
          />
        </svg>
      </button>

      <button
        onClick={onWhatIf}
        className="w-full sm:w-auto px-3 py-2 sm:px-4 sm:py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition touch-manipulation text-sm flex items-center gap-1 justify-center"
        aria-label="What-If Analysis"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>What-If</span>
      </button>

      <button
        onClick={onOptimize}
        className="w-full sm:w-auto px-3 py-2 sm:px-4 sm:py-2 bg-wsu-crimson text-white rounded-md hover:bg-red-800 transition touch-manipulation text-sm"
        aria-label="Optimize schedule"
      >
        Optimize
      </button>

      {/* Export Dropdown */}
      <div className="relative group inline-block text-left w-full sm:w-auto">
        <button
            type="button"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition touch-manipulation text-sm"
        >
            <span>Export</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </button>
        {/* Dropdown Menu */}
        <div className="hidden group-hover:block absolute right-0 mt-0 w-48 bg-white rounded-md shadow-lg z-50 border border-gray-200">
            <div className="py-1">
                <button
                    onClick={onExport}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                    Export to Excel
                </button>
                <button
                    onClick={onPrintPDF}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                    Export as PDF
                </button>
                <button
                    onClick={onExportICS}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-100"
                >
                   Export to Calendar (.ics)
                </button>
            </div>
        </div>
      </div>

      <label className="w-full sm:w-auto flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition cursor-pointer touch-manipulation text-sm">
        <span>Import</span>
        <input
          type="file"
          accept=".xlsx"
          onChange={onImport}
          className="hidden"
        />
      </label>
      <button
        onClick={onReset}
        className="w-full sm:w-auto px-3 py-2 sm:px-3 sm:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition touch-manipulation text-sm"
        title="Reset Plan"
        aria-label="Reset plan"
      >
        Reset
      </button>
    </div>
  );
}
