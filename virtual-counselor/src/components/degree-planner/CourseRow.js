import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchCatalogCourses } from '../../utils/api';

// Grade points for GPA calculation
export const GRADE_POINTS = {
  'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0, 'P': 0.0
};

// Debounce hook
function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);

  const debouncedFn = useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return debouncedFn;
}

// CourseNotes - separates note rendering and includes mobile-first collapsed behavior
function CourseNotes({ notes }) {
  const isArray = Array.isArray(notes);
  const [open, setOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        // default expanded on md+ (desktop), collapsed on small screens
        return window.matchMedia('(min-width: 768px)').matches;
      }
    } catch (e) {}
    return false;
  });

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-2"
        aria-expanded={open}
      >
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium text-sm">Notes</span>
        <span className="text-xs text-gray-500">{isArray ? notes.length : 1}</span>
      </button>

      {open && (
        <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
          <strong className="text-sm text-gray-700">Details:</strong>
          <div className="mt-1 space-y-1">
            {isArray
              ? notes.map((fn, i) => (
                  <div key={i} className="leading-snug">{fn}</div>
                ))
              : <div className="leading-snug">{notes}</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// Course Row Component with autocomplete
function CourseRow({ course, onUpdate, onRemove, yearId, term, openCatalog, openClassCalc }) {
  const textareaRef = useRef(null);
  const [courseSuggestions, setCourseSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState(null);
  const [expandedInfoIdx, setExpandedInfoIdx] = useState(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [course.name]);

  // Debounced search function
  const performSearch = useCallback(async (value) => {
    if (value.length < 2) {
      setCourseSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchLoading(true);
    try {
      const data = await searchCatalogCourses(value, 8);
      setCourseSuggestions(data.courses || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error searching catalog:', error);
      setCourseSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const debouncedSearch = useDebounce(performSearch, 300);

  const handleCourseSearch = (value) => {
    onUpdate(course.id, 'name', value);
    debouncedSearch(value);
  };

  const selectCourse = (courseData) => {
    const courseName = courseData.code || `${courseData.prefix} ${courseData.number}`;
    onUpdate(course.id, 'name', courseName);
    onUpdate(course.id, 'credits', parseInt(courseData.credits) || 0);
    // Store description for potential tooltip display
    if (courseData.description) {
      onUpdate(course.id, 'description', courseData.description);
    }
    setShowSuggestions(false);
    setSelectedCourseInfo(null);
  };

  // Truncate description for dropdown display
  const truncateDesc = (desc, maxLen = 100) => {
    if (!desc) return '';
    return desc.length > maxLen ? desc.slice(0, maxLen) + '...' : desc;
  };

  // Determine whether this row is a placeholder/elective that should show the catalog Select button.
  const hasCourseCode = (name) => {
    if (!name) return false;
    return /\b[A-Za-z]{2,6}\s*\.?\s*\d{3}\b/.test(name);
  };

  const isPlaceholderRow = () => {
    const nm = String(course.name || '');
    if (!nm.trim()) return true;
    // obvious elective/requirement tokens
    if (/elective|requirement|u-?core/i.test(nm)) return true;
    // if the name is just a bracketed attribute (e.g., "[WRTG]") treat as placeholder
    if (/^\s*\[.*\]\s*$/.test(nm) && !hasCourseCode(nm)) return true;
    return false;
  };

  return (
    <div className="space-y-2 group relative">
      <div className="flex gap-2 items-start">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={course.name}
            onChange={(e) => handleCourseSearch(e.target.value)}
            onFocus={() => course.name.length > 1 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Type course name (e.g., CPTS 121)"
            rows={1}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded resize-none overflow-hidden focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          />

          {/* Loading indicator */}
          {searchLoading && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-wsu-crimson rounded-full animate-spin"></div>
                Searching catalog...
              </div>
            </div>
          )}

          {/* Course Suggestions Dropdown */}
          {showSuggestions && !searchLoading && courseSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {courseSuggestions.map((c, idx) => (
                <div
                  key={c.code || `${c.prefix}-${c.number}-${idx}`}
                  className="border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50">
                    {/* Info icon button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedInfoIdx(expandedInfoIdx === idx ? null : idx);
                      }}
                      className="mt-0.5 p-1 text-gray-400 hover:text-wsu-crimson rounded hover:bg-gray-100"
                      title="View course details"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>

                    {/* Main course info - clickable to select */}
                    <button
                      type="button"
                      onClick={() => selectCourse(c)}
                      className="flex-1 text-left"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900">
                            {c.code || `${c.prefix} ${c.number}`}
                          </div>
                          <div className="text-xs text-gray-700 truncate">{c.title}</div>
                          {c.description && expandedInfoIdx !== idx && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {truncateDesc(c.description, 100)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                          <span className="text-xs font-medium text-gray-600">{c.credits || '—'} cr</span>
                          {c.ucore && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-800 rounded">
                              {c.ucore}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Expanded course details */}
                  {expandedInfoIdx === idx && (
                    <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                      <div className="text-xs space-y-2">
                        {/* Full description */}
                        {c.description && (
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">Description</div>
                            <div className="text-gray-600 leading-relaxed">{c.description}</div>
                          </div>
                        )}

                        {/* Prerequisites */}
                        {c.prerequisite_raw && (
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">Prerequisites</div>
                            <div className="text-gray-600">{c.prerequisite_raw}</div>
                          </div>
                        )}

                        {/* UCORE designation */}
                        {c.ucore && (
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">UCORE</div>
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">
                              {c.ucore}
                            </span>
                          </div>
                        )}

                        {/* Credits */}
                        <div>
                          <div className="font-semibold text-gray-700 mb-1">Credits</div>
                          <div className="text-gray-600">{c.credits || c.credits_phrase || 'Variable'}</div>
                        </div>

                        {/* Select button */}
                        <button
                          type="button"
                          onClick={() => selectCourse(c)}
                          className="mt-2 w-full py-1.5 bg-wsu-crimson text-white text-xs font-medium rounded hover:bg-opacity-90"
                        >
                          Select this course
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No results message */}
          {showSuggestions && !searchLoading && courseSuggestions.length === 0 && course.name.length >= 2 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2">
              <div className="text-sm text-gray-500">No courses found matching "{course.name}"</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Show 'Select' button only for true placeholders (not rows already containing a code like 'ENGL 101 [WRTG]') */}
          {(!course.catalogCourseId && isPlaceholderRow()) && (
            <button
              onClick={() => openCatalog && openCatalog(course.id, yearId, term)}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              title="Select course from catalog"
            >
              Select
            </button>
          )}

          {/* Grade calculator trigger (visible on all sizes) */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); console.log('[CourseRow] calc button clicked', course.name); if (openClassCalc) openClassCalc(course.name || 'Course'); else console.warn('openClassCalc is not provided'); }}
            aria-label="Open grade calculator"
            title="Open grade calculator"
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 7h10" />
              <path d="M7 11h4" />
              <path d="M7 15h4" />
            </svg>
            <span className="sr-only">Open grade calculator</span>
          </button>

          <button
            onClick={() => onRemove(course.id)}
            aria-label="Remove course"
            title="Remove course"
            className="text-red-600 hover:text-red-800 text-sm px-2 focus:outline-none"
          >
            ×
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <input
          type="number"
          value={course.credits || ''}
          onChange={(e) => onUpdate(course.id, 'credits', parseInt(e.target.value) || 0)}
          placeholder="Cr"
          min="0"
          max="18"
          className="input-field text-sm"
        />

        <select
          value={course.status || 'not-taken'}
          onChange={(e) => onUpdate(course.id, 'status', e.target.value)}
          className="select-field text-sm"
        >
          <option value="not-taken">Not Taken</option>
          <option value="planned">Planned</option>
          <option value="in-progress">In Progress</option>
          <option value="taken">Taken</option>
        </select>

        <select
          value={course.grade || ''}
          onChange={(e) => onUpdate(course.id, 'grade', e.target.value)}
          disabled={course.status === 'not-taken' || course.status === 'planned'}
          className="select-field text-sm disabled:bg-gray-100"
        >
          <option value="">—</option>
          {Object.keys(GRADE_POINTS).map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <div className="px-2 py-1 text-sm text-gray-600 text-right">
          {course.grade && course.credits ? ((GRADE_POINTS[course.grade] || 0) * course.credits).toFixed(1) : '—'}
        </div>
      </div>
      {/* Footnotes / Notes for the course - collapsible on mobile */}
      {((Array.isArray(course.footnotes) && course.footnotes.length > 0) || (course.footnotes && !Array.isArray(course.footnotes))) && (() => {
        return (
          <CourseNotes notes={course.footnotes} />
        );
      })()}
    </div>
  );
}

export default CourseRow;
export { CourseNotes };
