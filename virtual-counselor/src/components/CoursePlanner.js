import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { fetchCourses, fetchTerms, fetchPrefixes } from '../utils/api';
import { saveUserCourses, loadUserCourses } from '../utils/storage';
import WeeklyCalendar from './course-planner/WeeklyCalendar';
import CourseDetailsModal from './course-planner/CourseDetailsModal';
import { stripHtml, parseInstructors, formatDayTime, parseTimeRange, getContrastingTextColor } from './course-planner/utils';

// Course color presets (hex) for visual differentiation. Values are CSS color strings or gradients.
const COURSE_COLOR_PRESETS = [
  { value: '#8b0000', name: 'Crimson' },
  { value: '#1e40af', name: 'Blue' },
  { value: '#15803d', name: 'Green' },
  { value: '#6b21a8', name: 'Purple' },
  { value: '#d97706', name: 'Orange' },
  { value: '#0f766e', name: 'Teal' },
  { value: '#be185d', name: 'Pink' },
  { value: '#3730a3', name: 'Indigo' },
];

// Backwards compatibility map for previously stored Tailwind bg classes -> hex
const TAILWIND_TO_HEX = {
  'bg-red-600': '#dc2626',
  'bg-blue-600': '#2563eb',
  'bg-green-600': '#16a34a',
  'bg-purple-600': '#7c3aed',
  'bg-orange-500': '#f97316',
  'bg-teal-600': '#0ea5a4',
  'bg-pink-600': '#db2777',
  'bg-indigo-600': '#4f46e5',
  'bg-wsu-crimson': '#8b0000'
};

const TERM_DISPLAY = {
  'Spring': 'Spring',
  'Summer': 'Summer',
  'Fall': 'Fall',
  'DDP': 'Global'
};

function CoursePlanner() {
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [courseColors, setCourseColors] = useState({});
  const [filters, setFilters] = useState({
    term: 'Spring',
    year: '2026',
    campus: 'Pullman',
    prefix: '',
    search: ''
  });
  const [terms, setTerms] = useState([]);
  const [prefixes, setPrefixes] = useState([]);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [selectedCourseDetails, setSelectedCourseDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [colorPickerCourse, setColorPickerCourse] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalResults, setTotalResults] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Load saved schedule from localStorage
  useEffect(() => {
    try {
      const parsed = loadUserCourses();
      console.debug('[CoursePlanner] loaded saved courses', parsed && parsed.courses ? parsed.courses.length : (Array.isArray(parsed) ? parsed.length : 0));
      if (parsed && parsed.length !== undefined) {
        // older storage returned array directly
        setSelectedCourses(parsed || []);
      } else if (parsed && parsed.courses) {
        setSelectedCourses(parsed.courses || []);
        setCourseColors(parsed.colors || {});
        setFilters(prev => ({ ...prev, ...parsed.filters }));
      }
      // mark hydration complete so we don't immediately overwrite saved data
      setHydrated(true);
    } catch (e) {
      console.error('Error loading saved schedule:', e);
      setHydrated(true);
    }
  }, []);

  // Save schedule to localStorage
  useEffect(() => {
    try {
      if (!hydrated) {
        console.debug('[CoursePlanner] skipping save until hydrated');
        return;
      }

      console.debug('[CoursePlanner] saving selectedCourses', selectedCourses.length);
      saveUserCourses({ courses: selectedCourses, colors: courseColors, filters: { term: filters.term, year: filters.year, campus: filters.campus } });
    } catch (e) {
      console.error('Error saving schedule:', e);
    }
  }, [selectedCourses, courseColors, filters.term, filters.year, filters.campus]);

  useEffect(() => {
    loadTerms();
    loadPrefixes();
  }, []);

  useEffect(() => {
    if (filters.term && filters.year) {
      // reset to first page when filters change and fetch fresh results
      setPage(1);
      searchCourses();
    }
  }, [filters]);

  const loadTerms = async () => {
    try {
      const data = await fetchTerms();
      // API returns array directly, not wrapped in {terms: []}
      setTerms(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading terms:', error);
    }
  };

  const loadPrefixes = async () => {
    try {
      const data = await fetchPrefixes({ year: filters.year, term: filters.term });
      setPrefixes(data || []);
    } catch (error) {
      console.error('Error loading prefixes:', error);
    }
  };

  const searchCourses = async () => {
    setLoading(true);
    try {
      // Fetch a larger set so we can group client-side by course header
      const data = await fetchCourses({ ...filters, limit: 1000 });
      setCourses(data.courses || []);
      // totalResults will be computed from grouped courses after setCourses causes recompute
    } catch (error) {
      console.error('Error searching courses:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group courses by prefix + number
  const groupedCourses = useMemo(() => {
    return courses.reduce((acc, course) => {
      const key = `${course.prefix || course.coursePrefix} ${course.courseNumber}`;
      if (!acc[key]) {
        acc[key] = {
          course: course,
          sections: []
        };
      }
      acc[key].sections.push(course);
      return acc;
    }, {});
  }, [courses]);

  // Paginated grouped entries (array of [key, {course, sections}])
  const groupedEntries = useMemo(() => Object.entries(groupedCourses), [groupedCourses]);
  const groupedTotal = groupedEntries.length;

  useEffect(() => {
    // keep totalResults synchronized with grouped course count
    setTotalResults(groupedTotal);
    // if current page is beyond end (after filters change), clamp it
    const maxPage = Math.max(1, Math.ceil(groupedTotal / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [groupedTotal, pageSize]);

  const addCourseToSchedule = useCallback((course) => {
    // Check for time conflicts
    const newCourseTime = parseTimeRange(course.dayTime);

    if (newCourseTime) {
      // Identify any conflicting existing sections
      const conflicts = selectedCourses.filter(existing => {
        const existingTime = parseTimeRange(existing.dayTime);
        if (!existingTime) return false;

        // Check if days overlap
        const daysOverlap = newCourseTime.days.some(d => existingTime.days.includes(d));
        if (!daysOverlap) return false;

        // Check if times overlap
        return (newCourseTime.startMin < existingTime.endMin && newCourseTime.endMin > existingTime.startMin);
      });

      if (conflicts.length > 0) {
        // Block adding conflicting courses
        const names = conflicts.map(c => `${c.prefix || c.coursePrefix} ${c.courseNumber} (Section ${c.sectionNumber})`).join(', ');
        toast.error(`Cannot add course — it conflicts with your schedule: ${names}`);
        return;
      }
    }

    // Assign a color (hex or gradient) if not already assigned
    const courseKey = course.uniqueId;
    if (!courseColors[courseKey]) {
      const used = new Set(Object.values(courseColors || []).map(v => String(v)));
      const available = COURSE_COLOR_PRESETS.find(p => !used.has(p.value)) || COURSE_COLOR_PRESETS[0];
      setCourseColors(prev => ({ ...prev, [courseKey]: available.value }));
    }

    setSelectedCourses(prev => [...prev, course]);
    try {
      toast.success(`${course.prefix || course.coursePrefix || ''} ${course.courseNumber || ''} added to schedule`);
    } catch (e) {
      console.debug('[CoursePlanner] toast.success failed', e);
    }
  }, [selectedCourses, courseColors]);

  const removeCourseFromSchedule = useCallback((courseId) => {
    setSelectedCourses(prev => prev.filter(c => c.uniqueId !== courseId));
  }, []);

  const changeCourseColor = useCallback((courseId, colorValue) => {
    setCourseColors(prev => ({ ...prev, [courseId]: colorValue }));
    setColorPickerCourse(null);
  }, []);

  const totalCredits = useMemo(() => {
    return selectedCourses.reduce((sum, c) => sum + (parseInt(c.credits, 10) || 0), 0);
  }, [selectedCourses]);

  // Filter out async courses for calendar (ARR times)
  const calendarCourses = useMemo(() => {
    return selectedCourses.filter(c => c.dayTime && !c.dayTime.includes('ARR') && c.dayTime !== 'AARGT');
  }, [selectedCourses]);

  const asyncCourses = useMemo(() => {
    return selectedCourses.filter(c => !c.dayTime || c.dayTime.includes('ARR') || c.dayTime === 'AARGT');
  }, [selectedCourses]);

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Panel - Course Search */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-bold text-wsu-crimson text-lg mb-4">Course Search</h3>

            {/* Filters */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Term</label>
                  <select
                    value={filters.term}
                    onChange={(e) => setFilters({ ...filters, term: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                  >
                    <option value="Fall">Fall</option>
                    <option value="Spring">Spring</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                  <select
                    value={filters.year}
                    onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Campus</label>
                  <select
                    value={filters.campus}
                    onChange={(e) => setFilters({ ...filters, campus: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                  >
                    <option value="">All Campuses</option>
                    <option value="Pullman">Pullman</option>
                    <option value="Spokane">Spokane</option>
                    <option value="Tri-Cities">Tri-Cities</option>
                    <option value="Vancouver">Vancouver</option>
                    <option value="DDP">Global</option>
                    <option value="Everett">Everett</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                <select
                  value={filters.prefix}
                  onChange={(e) => setFilters({ ...filters, prefix: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                >
                  <option value="">All Subjects</option>
                  {prefixes.map(p => {
                    // Prefer the returned subject/title (populated by n8n) and avoid showing redundant labels like "Acctg - Acctg"
                    const subj = (p.subject || p.fullName || '').toString().trim();
                    // Show the friendly subject when it's present and not exactly the same string as the prefix.
                    // Previously we compared case-insensitively which hid labels like "ART - Art". Use
                    // a case-sensitive comparison so short title-casing differences still display.
                    const showSubject = subj && subj !== (p.prefix || '').toString().trim();
                    const label = showSubject ? `${p.prefix} - ${subj}` : p.prefix;
                    return (
                      <option key={p.prefix} value={p.prefix}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  placeholder="Course name, number, or instructor..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Search Results */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <h4 className="font-semibold text-gray-700">
                  {loading ? 'Searching...' : `${totalResults} Courses`}
                </h4>
                {!loading && totalResults > 0 && (
                  <div className="text-sm text-gray-500">Showing {(page - 1) * pageSize + 1}-{Math.min((page) * pageSize, totalResults)} of {totalResults}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`px-3 py-1 rounded border text-sm ${page <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}`}
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => (p * pageSize < totalResults ? p + 1 : p))}
                  disabled={page * pageSize >= totalResults}
                  className={`px-3 py-1 rounded border text-sm ${page * pageSize >= totalResults ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}`}
                >
                  Next
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {Object.keys(groupedCourses).length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-wsu-crimson border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading courses...</span>
                    </div>
                  ) : (
                    'Select a department or search to find courses'
                  )}
                </div>
              ) : (
                (() => {
                  const start = (page - 1) * pageSize;
                  const end = page * pageSize;
                  const pageSlice = groupedEntries.slice(start, end);
                  return pageSlice.map(([courseKey, { course, sections }]) => (
                    <CourseCard
                      key={courseKey}
                      courseKey={courseKey}
                      course={course}
                      sections={sections}
                      isExpanded={expandedCourse === courseKey}
                      onToggle={() => setExpandedCourse(expandedCourse === courseKey ? null : courseKey)}
                      onAdd={addCourseToSchedule}
                      onShowDetails={setSelectedCourseDetails}
                      selectedCourses={selectedCourses}
                    />
                  ));
                })()
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Schedule & Calendar */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 overflow-hidden">
          {/* My Schedule List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-wsu-crimson text-lg">My Schedule</h3>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  <span className="font-bold text-wsu-crimson text-lg">{totalCredits}</span> credits
                </span>
                {selectedCourses.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all courses from schedule?')) {
                        setSelectedCourses([]);
                      }
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {selectedCourses.length === 0 ? (
              <div className="text-center text-gray-400 py-4">
                Add courses from the search to build your schedule
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedCourses.map(course => {
                  const stored = courseColors[course.uniqueId] || 'bg-wsu-crimson';
                  const colorValue = TAILWIND_TO_HEX[stored] || stored;
                  const textColor = getContrastingTextColor(colorValue);
                  return (
                    <div
                      key={course.uniqueId}
                      style={{ background: colorValue, color: textColor }}
                      className={`px-3 py-2 rounded-lg flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity`}
                      onClick={() => setColorPickerCourse(course.uniqueId)}
                    >
                      <span className="font-medium">
                        {course.prefix || course.coursePrefix} {course.courseNumber}
                      </span>
                      <span className="text-xs opacity-80" style={{ color: textColor }}>
                        {course.credits}cr
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCourseFromSchedule(course.uniqueId);
                        }}
                        className="ml-1 hover:bg-white/20 rounded p-0.5"
                        title="Remove course"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Async courses note */}
            {asyncCourses.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  {asyncCourses.length} course{asyncCourses.length > 1 ? 's' : ''} with flexible/online scheduling (not shown on calendar)
                </p>
              </div>
            )}
          </div>

          {/* Weekly Calendar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="font-bold text-wsu-crimson text-lg mb-3">Weekly Schedule</h3>
            <div className="flex-1 overflow-auto">
              <WeeklyCalendar
                courses={calendarCourses}
                courseColors={courseColors}
                onCourseClick={setSelectedCourseDetails}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Course Details Modal */}
      {selectedCourseDetails && (
        <CourseDetailsModal
          course={selectedCourseDetails}
          onClose={() => setSelectedCourseDetails(null)}
        />
      )}

      {/* Color Picker Modal */}
      {colorPickerCourse && (
        <ColorPickerModal
          courseId={colorPickerCourse}
          currentColor={TAILWIND_TO_HEX[courseColors[colorPickerCourse]] || courseColors[colorPickerCourse]}
          onSelect={changeCourseColor}
          onClose={() => setColorPickerCourse(null)}
        />
      )}
    </div>
  );
}

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

// WeeklyCalendar moved to ./course-planner/WeeklyCalendar.js
// CourseDetailsModal moved to ./course-planner/CourseDetailsModal.js

// Color Picker Modal
function ColorPickerModal({ courseId, currentColor, onSelect, onClose }) {
  const [startColor, setStartColor] = useState(currentColor && currentColor.startsWith('linear-gradient') ? '#ffffff' : (currentColor || COURSE_COLOR_PRESETS[0].value));
  const [endColor, setEndColor] = useState('#ffffff');
  const [useGradient, setUseGradient] = useState(currentColor && currentColor.startsWith('linear-gradient'));

  useEffect(() => {
    if (!currentColor) return;
    if (currentColor.startsWith('linear-gradient')) {
      const m = currentColor.match(/linear-gradient\([^,]+,\s*([^,]+),\s*([^\)]+)\)/);
      if (m) {
        setStartColor(m[1].trim());
        setEndColor(m[2].trim());
        setUseGradient(true);
      }
    } else {
      setStartColor(currentColor);
      setUseGradient(false);
    }
  }, [currentColor]);

  const onSave = () => {
    const value = useGradient ? `linear-gradient(90deg, ${startColor}, ${endColor})` : startColor;
    onSelect(courseId, value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl p-4 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-700 mb-3">Choose Color</h3>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Mode</label>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={!useGradient} onChange={() => setUseGradient(false)} />
                Solid
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={useGradient} onChange={() => setUseGradient(true)} />
                Gradient
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 ">
            <div className="flex flex-col items-center">
              <label className="font-medium text-center">Start Color</label>
              <input type="color" value={startColor} onChange={(e) => setStartColor(e.target.value)} className="w-full h-12 rounded flex items-center justify-center" />
            </div>

          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1 flex flex-col items-center font-medium">Preview</label>
            <div className="w-full h-12 rounded flex items-center justify-center" style={{ background: useGradient ? `linear-gradient(90deg, ${startColor}, ${endColor})` : startColor, color: getContrastingTextColor(useGradient ? startColor : startColor) }}>
              <span className="font-medium">Preview</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button onClick={onClose} className="px-3 py-2 rounded border">Cancel</button>
            <button onClick={onSave} className="px-3 py-2 rounded bg-wsu-crimson text-white">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions moved to ./course-planner/utils.js

export default CoursePlanner;
