import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchCatalogCourses } from '../../utils/api';
import { loadRecentCourses, saveRecentCourse } from '../../utils/storage';

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
function CourseRow({ course, onUpdate, onRemove, onMoveClick, yearId, term, openCatalog, openClassCalc, completedCourses = [], duplicateCourses = new Set() }) {
  const textareaRef = useRef(null);
  const [courseSuggestions, setCourseSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCourseInfo, setSelectedCourseInfo] = useState(null);
  const [expandedInfoIdx, setExpandedInfoIdx] = useState(null);
  const [recentCourses, setRecentCourses] = useState([]);

  // Check if prerequisites are met for this course
  const checkPrereqsMet = () => {
    // Override: User manually marked as met
    if (course.prereqsMetOverride) return { met: true, missing: [] };

    // If course has no prerequisites info, assume met
    if (!course.prerequisites || course.prerequisites.length === 0) return { met: true, missing: [] };

    const completedSet = new Set(completedCourses.map(c => c.toUpperCase()));
    const missing = [];

    // Prerequisites can be a flat array of course codes
    const prereqCodes = Array.isArray(course.prerequisites)
      ? course.prerequisites.map(p => String(p).toUpperCase())
      : [];

    prereqCodes.forEach(prereq => {
      if (!completedSet.has(prereq)) {
        missing.push(prereq);
      }
    });

    return { met: missing.length === 0, missing };
  };

  const prereqStatus = checkPrereqsMet();

  // Check if this course is a duplicate
  const isDuplicate = (() => {
    if (!course.name) return false;
    // Robust extraction matching analyzeDegreeProgress
    const match = course.name.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
    if (match) {
      const code = `${match[1].trim().toUpperCase()} ${match[2]}`;
      return duplicateCourses.has ? duplicateCourses.has(code) : duplicateCourses[code];
    }
    return false;
  })();

  // Load recent courses on mount
  useEffect(() => {
    const loadedRecent = loadRecentCourses();
    setRecentCourses(loadedRecent);
  }, []);

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
    // Show recent courses if input is short
    if (value.length < 2) {
      setCourseSuggestions([]);
      setShowSuggestions(false);
    } else {
      debouncedSearch(value);
    }
  };

  const selectCourse = (courseData) => {
    const courseName = courseData.code || `${courseData.prefix} ${courseData.number}`;
    onUpdate(course.id, 'name', courseName);
    onUpdate(course.id, 'credits', parseInt(courseData.credits) || 0);
    // Store description for potential tooltip display
    if (courseData.description) {
      onUpdate(course.id, 'description', courseData.description);
    }
    // Store prerequisites for prereq checking
    if (courseData.prerequisite_codes || courseData.prerequisiteCodes) {
      const prereqs = courseData.prerequisite_codes || courseData.prerequisiteCodes;
      onUpdate(course.id, 'prerequisites', Array.isArray(prereqs) ? prereqs : []);
    }

    // Save to recent courses
    saveRecentCourse(courseData);
    const updatedRecent = loadRecentCourses();
    setRecentCourses(updatedRecent);

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
      {/* Duplicate Course Warning Banner */}
      {isDuplicate && course.name && (
        <div className="flex items-center gap-2 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>
            <strong>Duplicate:</strong> This course appears multiple times in your plan
          </span>
        </div>
      )}

      {/* Prerequisite Warning Banner */}
      {!prereqStatus.met && course.name && course.status !== 'taken' && (
        <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="flex-1">
            <strong>Missing prerequisites:</strong> {prereqStatus.missing.join(', ')}
          </span>
          <button 
            onClick={() => onUpdate(course.id, 'prereqsMetOverride', true)}
            className="text-xs underline hover:text-amber-900 whitespace-nowrap"
            title="Dismiss this warning"
          >
            Mark as Met
          </button>
        </div>
      )}

      <div className="flex gap-2 items-start">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={course.name}
            onChange={(e) => handleCourseSearch(e.target.value)}
            onFocus={() => {
              // Show suggestions on focus if there's text or recent courses
              if (course.name.length > 1 || recentCourses.length > 0) {
                setShowSuggestions(true);
              }
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Type course name (e.g., CPTS 121)"
            rows={1}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded resize-none overflow-hidden focus:ring-2 focus:ring-wsu-crimson focus:border-transparent dark:bg-gray-700 dark:text-white"
          />

          {/* Loading indicator */}
          {searchLoading && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-wsu-crimson rounded-full animate-spin"></div>
                Searching catalog...
              </div>
            </div>
          )}

          {/* Course Suggestions Dropdown */}
          {showSuggestions && !searchLoading && (courseSuggestions.length > 0 || (course.name.length < 2 && recentCourses.length > 0)) && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {/* Recent Courses Section */}
              {course.name.length < 2 && recentCourses.length > 0 && (
                <div className="border-b border-gray-200 dark:border-gray-700">
                  <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recent Courses
                  </div>
                  {recentCourses.slice(0, 5).map((c, idx) => (
                    <div
                      key={`recent-${c.code || c.prefix}-${idx}`}
                      className="border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                        {/* Info icon button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedInfoIdx(expandedInfoIdx === `recent-${idx}` ? null : `recent-${idx}`);
                          }}
                          className="mt-0.5 p-1 text-gray-400 dark:text-gray-500 hover:text-wsu-crimson rounded hover:bg-gray-100 dark:hover:bg-gray-600"
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
                              <div className="font-medium text-sm text-gray-900 dark:text-white">
                                {c.code || `${c.prefix} ${c.number}`}
                              </div>
                              <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{c.title}</div>
                              {c.description && expandedInfoIdx !== `recent-${idx}` && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                  {truncateDesc(c.description, 100)}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{c.credits || '—'} cr</span>
                              {c.ucore && (
                                <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                                  {c.ucore}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Expanded course details */}
                      {expandedInfoIdx === `recent-${idx}` && (
                        <div className="px-3 pb-3 pt-1 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-600">
                          <div className="text-xs space-y-2">
                            {/* Full description */}
                            {c.description && (
                              <div>
                                <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</div>
                                <div className="text-gray-600 dark:text-gray-400 leading-relaxed">{c.description}</div>
                              </div>
                            )}

                            {/* Prerequisites */}
                            {c.prerequisite_raw && (
                              <div>
                                <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Prerequisites</div>
                                <div className="text-gray-600 dark:text-gray-400">{c.prerequisite_raw}</div>
                              </div>
                            )}

                            {/* UCORE designation */}
                            {c.ucore && (
                              <div>
                                <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">UCORE</div>
                                <span className="inline-block px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs">
                                  {c.ucore}
                                </span>
                              </div>
                            )}

                            {/* Credits */}
                            <div>
                              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Credits</div>
                              <div className="text-gray-600 dark:text-gray-400">{c.credits || c.credits_phrase || 'Variable'}</div>
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

              {/* Search Results Section */}
              {courseSuggestions.length > 0 && (
                <>
                  {course.name.length < 2 && recentCourses.length > 0 && (
                    <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Search Results
                    </div>
                  )}
                  {courseSuggestions.map((c, idx) => (
                <div
                  key={c.code || `${c.prefix}-${c.number}-${idx}`}
                  className="border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <div className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                    {/* Info icon button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedInfoIdx(expandedInfoIdx === idx ? null : idx);
                      }}
                      className="mt-0.5 p-1 text-gray-400 dark:text-gray-500 hover:text-wsu-crimson rounded hover:bg-gray-100 dark:hover:bg-gray-600"
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
                          <div className="font-medium text-sm text-gray-900 dark:text-white">
                            {c.code || `${c.prefix} ${c.number}`}
                          </div>
                          <div className="text-xs text-gray-700 dark:text-gray-300 truncate">{c.title}</div>
                          {c.description && expandedInfoIdx !== idx && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                              {truncateDesc(c.description, 100)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{c.credits || '—'} cr</span>
                          {c.ucore && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                              {c.ucore}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Expanded course details */}
                  {expandedInfoIdx === idx && (
                    <div className="px-3 pb-3 pt-1 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-600">
                      <div className="text-xs space-y-2">
                        {/* Full description */}
                        {c.description && (
                          <div>
                            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</div>
                            <div className="text-gray-600 dark:text-gray-400 leading-relaxed">{c.description}</div>
                          </div>
                        )}

                        {/* Prerequisites */}
                        {c.prerequisite_raw && (
                          <div>
                            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Prerequisites</div>
                            <div className="text-gray-600 dark:text-gray-400">{c.prerequisite_raw}</div>
                          </div>
                        )}

                        {/* UCORE designation */}
                        {c.ucore && (
                          <div>
                            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">UCORE</div>
                            <span className="inline-block px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs">
                              {c.ucore}
                            </span>
                          </div>
                        )}

                        {/* Credits */}
                        <div>
                          <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Credits</div>
                          <div className="text-gray-600 dark:text-gray-400">{c.credits || c.credits_phrase || 'Variable'}</div>
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
                </>
              )}
            </div>
          )}

          {/* No results message */}
          {showSuggestions && !searchLoading && courseSuggestions.length === 0 && course.name.length >= 2 && recentCourses.length === 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg px-3 py-2">
              <div className="text-sm text-gray-500 dark:text-gray-400">No courses found matching "{course.name}"</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Show 'Select' button only for true placeholders (not rows already containing a code like 'ENGL 101 [WRTG]') */}
          {(!course.catalogCourseId && isPlaceholderRow()) && (
            <button
              onClick={() => openCatalog && openCatalog(course.id, yearId, term)}
              className="text-xs px-2 py-1 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600"
              title="Select course from catalog"
            >
              Select
            </button>
          )}

          <button
            onClick={() => onRemove(course.id)}
            aria-label="Remove course"
            title="Remove course"
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm px-2 focus:outline-none"
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

        <div className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 text-right">
          {course.grade && course.credits ? ((GRADE_POINTS[course.grade] || 0) * course.credits).toFixed(1) : '—'}
        </div>
      </div>

      {/* Action Buttons Row - Move and Grade Calculator */}
      <div className="flex gap-2 mt-2">
        {/* Move button - only show if course has content */}
        {course.name && onMoveClick && (
          <button
            type="button"
            onClick={() => onMoveClick(course)}
            aria-label="Move course to different term"
            title="Move this course to another year or term"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 shadow-sm hover:shadow transition-all"
          >
            <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="font-medium">Move</span>
          </button>
        )}

        {/* Grade calculator trigger */}
        <button
          type="button"
          onClick={(e) => { 
            e.preventDefault(); 
            if (openClassCalc) {
              openClassCalc(course.id, course.name);
            } else {
              console.warn('openClassCalc is not provided');
            }
          }}
          aria-label="Open grade calculator to track assignments and calculate your grade"
          title="Calculate your grade - track assignments, see what you need to get your target grade"
          className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 active:scale-95 shadow-sm hover:shadow transition-all"
        >
          <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="12" y2="10" />
            <line x1="8" y1="14" x2="12" y2="14" />
            <line x1="8" y1="18" x2="10" y2="18" />
            <circle cx="15" cy="15" r="2" />
          </svg>
          <span className="font-medium">Grade Calc</span>
        </button>
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
