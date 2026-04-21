import React from "react";

export default function DegreePlannerStats({
  showGradeScale,
  setShowGradeScale,
  gpa,
  creditsAchieved,
  creditsPlanned,
  creditsRequired,
  progress,
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      <button
        type="button"
        onClick={() => setShowGradeScale(!showGradeScale)}
        aria-pressed={showGradeScale}
        aria-label="Cumulative GPA - tap to view grade scale"
        className="bg-white px-3 py-2 rounded-md shadow hover:shadow-md transition touch-manipulation w-full text-sm cursor-pointer text-center"
      >
        <div className="text-xl font-bold text-wsu-crimson">{gpa}</div>
        <div className="text-xs text-gray-600">Cumulative GPA</div>
        <div className="text-[11px] text-gray-400 mt-1">Tap for scale</div>
      </button>

      <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
        <div className="text-xl font-bold text-green-600">
          {creditsAchieved}
        </div>
        <div className="text-xs text-gray-600">Credits Achieved</div>
      </div>

      <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
        <div className="text-xl font-bold text-blue-600">
          {creditsPlanned}
        </div>
        <div className="text-xs text-gray-600">Credits Planned</div>
      </div>

      <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
        <div className="text-xl font-bold text-purple-600">
          {creditsRequired}
        </div>
        <div className="text-xs text-gray-600">Credits Required</div>
      </div>

      <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
        <div className="min-h-[2.25rem] flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-gray-900 break-words">
            {progress || "Not Started"}
          </div>
          <div className="text-xs text-gray-600 mt-1">Ready to Graduate</div>
        </div>
      </div>
    </div>
  );
}
