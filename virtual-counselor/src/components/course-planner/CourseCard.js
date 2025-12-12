import React from 'react';
import { stripHtml, parseInstructors, formatDayTime } from './utils';

// Course Card Component
function CourseCard({ courseKey, course, sections, isExpanded, onToggle, onAdd, onShowDetails, selectedCourses }) {
  const isAdded = (section) => selectedCourses.some(c => c.uniqueId === section.uniqueId);

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-3 text-left hover:bg-gray-100 transition flex items-center justify-between"
      >
        <div className="flex-1">
          <div className="font-semibold text-gray-900">
            {course.prefix || course.coursePrefix} {course.courseNumber}
            <span className="ml-2 text-xs font-normal text-gray-500">
              {course.credits} credit{course.credits !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-sm text-gray-600 line-clamp-1">{stripHtml(course.title)}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
            {sections.length} section{sections.length > 1 ? 's' : ''}
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200 p-3 space-y-2 bg-white">
          {sections.map(section => (
            <div
              key={section.uniqueId}
              className={`border rounded-lg p-3 transition ${
                isAdded(section) ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">Section {section.sectionNumber}</span>
                    {/* Section type badge: prefer explicit isLab flag, fall back to sectionTitle containing "lab" */}
                    {(() => {
                      const title = (stripHtml(section.sectionTitle || '')).toLowerCase();
                      const isLab = section.isLab || title.includes('lab');
                      const tag = isLab ? 'Lab' : 'Lecture';
                      return (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${isLab ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {tag}
                        </span>
                      );
                    })()}
                    {section.seatsAvailable > 0 ? (
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                        {section.seatsAvailable} seats
                      </span>
                    ) : (
                      <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
                        Full
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">{parseInstructors(section)}</div>
                  <div className="text-sm text-gray-500">
                    {formatDayTime(section.dayTime)}
                  </div>
                  {section.location && section.location !== 'ARR ARR' && (
                    <div className="text-xs text-gray-400 mt-1">{section.location}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onShowDetails(section)}
                    className="p-2 text-gray-500 hover:text-wsu-crimson hover:bg-gray-100 rounded-lg transition"
                    title="View details"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  {isAdded(section) ? (
                    <span className="px-3 py-2 text-xs bg-green-600 text-white rounded-lg">
                      Added
                    </span>
                  ) : (
                    <button
                      onClick={() => onAdd(section)}
                      className="px-3 py-2 text-xs bg-wsu-crimson text-white rounded-lg hover:bg-red-800 transition"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CourseCard;
