import React from "react";

export default function DegreePlannerStats({
  showGradeScale,
  setShowGradeScale,
  gpa,
  creditsAchieved,
  creditsPlanned,
  creditsRequired,
  progress,
  belowMinGradeCount = 0,
  degreeMinGrade = null,
  graduationProjection = null,
}) {
  return (
    <div className="space-y-2">
    {graduationProjection && graduationProjection.semestersLeft > 0 && creditsRequired > 0 && (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>
          <strong>{Math.max(creditsRequired - creditsAchieved, 0)} credits remaining</strong>
          {' '}— at your average of <strong>~{graduationProjection.avgPerSemester} credits/semester</strong> you have approximately{' '}
          <strong>{graduationProjection.semestersLeft} more semester{graduationProjection.semestersLeft !== 1 ? 's' : ''}</strong>
          {' '}({graduationProjection.yearsLeft > 0 ? `~${graduationProjection.yearsLeft} more year${graduationProjection.yearsLeft !== 1 ? 's' : ''}` : 'less than 1 year'}).
          {graduationProjection.extraYearsNeeded > 0 && (
            <span className="ml-1 font-semibold text-blue-900">
              {graduationProjection.extraYearsNeeded} extra year tab{graduationProjection.extraYearsNeeded !== 1 ? 's' : ''} added to your plan.
            </span>
          )}
        </span>
      </div>
    )}
    {belowMinGradeCount > 0 && degreeMinGrade && (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-md text-sm text-amber-800">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>
          <strong>{belowMinGradeCount} course{belowMinGradeCount > 1 ? 's' : ''}</strong> matched your plan but received below the <strong>{degreeMinGrade}</strong> minimum required for your degree — they may not count toward the major.
        </span>
      </div>
    )}
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
    </div>
  );
}
