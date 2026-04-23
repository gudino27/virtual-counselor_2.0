import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import WeeklyCalendar from './WeeklyCalendar';
import { fetchCourses, fetchTerms, fetchPrefixes } from '../utils/api';
import { extractUCORECategories, getUCOREBadgeColor } from '../utils/courseHelpers';
import { X, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

// ── Schedule storage (separate from degree planner) ──────────────────────────
const STORAGE_KEY = 'vcCourseSchedules';

function loadSchedules() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveSchedules(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function scheduleKey(year, term) {
  return `${year}_${term}`;
}

// ── Schedule Panel ────────────────────────────────────────────────────────────
function SchedulePanel({ year, term, onSwitchTo }) {
  const [schedules, setSchedules] = useState(loadSchedules);
  const [collapsed, setCollapsed] = useState(false);

  // Reload when year/term changes
  useEffect(() => {
    setSchedules(loadSchedules());
  }, [year, term]);

  const key = year && term ? scheduleKey(year, term) : null;
  const current = key ? (schedules[key] || { courses: [] }) : null;
  const totalCredits = current ? current.courses.reduce((s, c) => s + (c.credits || 0), 0) : 0;

  const allKeys = Object.keys(schedules).sort((a, b) => b.localeCompare(a));

  const removeCourse = (idx) => {
    if (!key) return;
    const updated = { ...schedules };
    updated[key] = { ...updated[key], courses: updated[key].courses.filter((_, i) => i !== idx) };
    if (updated[key].courses.length === 0) delete updated[key];
    saveSchedules(updated);
    setSchedules({ ...updated });
  };

  const clearSchedule = () => {
    if (!key) return;
    const updated = { ...schedules };
    delete updated[key];
    saveSchedules(updated);
    setSchedules({ ...updated });
  };

  const formatKey = (k) => {
    const [y, ...t] = k.split('_');
    return `${t.join(' ')} ${y}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            {key ? `${term} ${year} Schedule` : 'My Schedule'}
          </h3>
          {key && current && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {current.courses.length} course{current.courses.length !== 1 ? 's' : ''} · {totalCredits} credits
            </p>
          )}
        </div>
        <button onClick={() => setCollapsed(c => !c)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Saved schedules list */}
          {allKeys.length > 0 && (
            <div className="p-3 border-b dark:border-gray-700">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Saved schedules</p>
              <div className="flex flex-wrap gap-1.5">
                {allKeys.map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      const [y, ...t] = k.split('_');
                      onSwitchTo(y, t.join('_'));
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      k === key
                        ? 'bg-crimson text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {formatKey(k)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No year/term selected */}
          {!key && (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <BookOpen className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Select a year and term to start building a schedule</p>
              </div>
            </div>
          )}

          {/* Empty schedule */}
          {key && (!current || current.courses.length === 0) && (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div>
                <BookOpen className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No courses added yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click &ldquo;Add&rdquo; on any course in the results</p>
              </div>
            </div>
          )}

          {/* Course list */}
          {key && current && current.courses.length > 0 && (
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-y dark:divide-gray-700">
                {current.courses.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.code}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{c.credits} cr · {c.campus}</p>
                    </div>
                    <button
                      onClick={() => removeCourse(i)}
                      className="mt-0.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>

              {/* Footer */}
              <div className="p-3 border-t dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total: {totalCredits} credits</span>
                <button
                  onClick={clearSchedule}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function CourseSearch() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ term: '', year: '', campus: '', prefix: '', search: '', minSeats: '' });
  const [terms, setTerms] = useState([]);
  const [prefixes, setPrefixes] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCourses, setTotalCourses] = useState(0);
  const [viewMode, setViewMode] = useState('list');
  const [showSubject, setShowSubject] = useState(false);
  const [scheduleTick, setScheduleTick] = useState(0); // force panel re-render after add
  const coursesPerPage = 50;

  const displayCourseCode = (course) =>
    showSubject
      ? `${course.subject || course.prefix} ${course.courseNumber}`
      : `${course.prefix} ${course.courseNumber}`;

  useEffect(() => { loadTermsData(); loadPrefixes(); }, []);

  const loadTermsData = async () => {
    try {
      const data = await fetchTerms();
      const termList = data.terms || data || [];
      setTerms(termList);
      if (termList.length > 0) {
        const first = termList[0];
        setFilters(f => ({ ...f, term: first.term || '', year: String(first.year || '') }));
      }
    } catch (e) { console.error(e); }
  };

  const loadPrefixes = async () => {
    try { setPrefixes((await fetchPrefixes()) || []); }
    catch (e) { console.error(e); }
  };

  const search = async () => {
    setLoading(true);
    try {
      const data = await fetchCourses({ ...filters, page, limit: coursesPerPage });
      setCourses(data.courses || []);
      setTotalCourses(data.total || 0);
    } catch (e) {
      toast.error('Error searching courses: ' + e.message);
    } finally { setLoading(false); }
  };

  const handleAdd = (course) => {
    const { year, term } = filters;
    if (!year || !term) {
      toast.error('Select a year and term first');
      return;
    }
    const key = scheduleKey(year, term);
    const all = loadSchedules();
    if (!all[key]) all[key] = { courses: [] };

    // Prevent duplicates by course code
    const code = `${course.prefix} ${course.courseNumber}`;
    if (all[key].courses.some(c => c.code === code)) {
      toast(`${code} is already in your ${term} ${year} schedule`);
      return;
    }

    all[key].courses.push({
      code,
      title: course.title,
      credits: course.credits || 3,
      campus: course.campus || '',
      section: course.sectionNumber || '',
      ucore: course.ucore || '',
    });

    saveSchedules(all);
    setScheduleTick(t => t + 1); // trigger panel reload
    toast.success(`Added ${code} → ${term} ${year}`);
  };

  const updateFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const switchToSchedule = (year, term) => {
    setFilters(f => ({ ...f, year: String(year), term }));
  };

  const uniqueYears = [...new Set(terms.map(t => t.year))].sort((a, b) => b - a);
  const uniqueTermNames = [...new Set(terms.map(t => t.term))];

  return (
    <div className="max-w-screen-2xl mx-auto">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4">
        <h2 className="text-2xl font-bold text-crimson dark:text-red-400 mb-4">Course Search</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <select value={filters.year} onChange={e => updateFilter('year', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white text-sm">
            <option value="">All Years</option>
            {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select value={filters.term} onChange={e => updateFilter('term', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white text-sm">
            <option value="">All Terms</option>
            {uniqueTermNames.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select value={filters.campus} onChange={e => updateFilter('campus', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white text-sm">
            <option value="">Campus</option>
            <option value="Pullman">Pullman</option>
            <option value="Spokane">Spokane</option>
            <option value="TriCities">Tri-Cities</option>
            <option value="Vancouver">Vancouver</option>
            <option value="Everett">Everett</option>
            <option value="Online">Online</option>
          </select>

          <select value={filters.prefix} onChange={e => updateFilter('prefix', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white text-sm">
            <option value="">Prefix</option>
            {prefixes.slice(0, 50).map(p => <option key={p.prefix} value={p.prefix}>{p.prefix}</option>)}
          </select>

          <input type="number" placeholder="Min Seats" value={filters.minSeats}
            onChange={e => updateFilter('minSeats', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 text-sm" />

          <input type="text" placeholder="Search..." value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 text-sm" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button onClick={search} disabled={loading}
            className="px-6 py-2.5 bg-crimson text-white rounded-lg hover:bg-crimson/90 transition font-semibold disabled:opacity-50 text-sm">
            {loading ? 'Searching...' : 'Search Courses'}
          </button>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setShowSubject(s => !s)}
              className={`relative w-10 h-5 rounded-full transition-colors ${showSubject ? 'bg-crimson' : 'bg-gray-300 dark:bg-gray-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showSubject ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Show subject names <span className="text-gray-400 text-xs">({showSubject ? 'e.g. Spanish 101' : 'e.g. SPAN 101'})</span>
            </span>
          </label>
        </div>
      </div>

      {/* Split: Results + Schedule Panel */}
      <div className="flex gap-4 items-start">
        {/* Results */}
        <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="p-4 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-semibold dark:text-white text-sm">{totalCourses} courses found</h3>

            <div className="flex bg-gray-100 dark:bg-gray-600 rounded-lg p-1">
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-800 text-crimson dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}>
                List
              </button>
              <button onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-gray-800 text-crimson dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}>
                Calendar
              </button>
            </div>

            <div className="flex gap-2 items-center">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white disabled:opacity-50 text-sm">
                Previous
              </button>
              <span className="text-sm dark:text-gray-300 whitespace-nowrap">
                Page {page} of {Math.max(1, Math.ceil(totalCourses / coursesPerPage))}
              </span>
              <button onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(totalCourses / coursesPerPage)}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white disabled:opacity-50 text-sm">
                Next
              </button>
            </div>
          </div>

          {viewMode === 'calendar' ? (
            <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
              <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 overflow-auto max-h-[600px]">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Results</h3>
                <div className="space-y-2 divide-y divide-gray-100 dark:divide-gray-700">
                  {courses.map(c => (
                    <div key={c.id || c.uniqueId} className="pt-2 first:pt-0">
                      <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{displayCourseCode(c)}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{c.title}</div>
                      <div className="text-xs text-gray-500">{c.dayTime || 'TBA'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="h-full min-h-[400px]"><WeeklyCalendar courses={courses} /></div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Course</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Section</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">UCORE</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Cr</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Campus</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Term</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Seats</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {courses.map((course, index) => {
                    const ucoreCategories = extractUCORECategories({ ucore: course.ucore });
                    const courseKey = course.id || course.uniqueId || index;
                    return (
                      <tr key={courseKey} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 font-mono text-sm font-medium dark:text-gray-200">{displayCourseCode(course)}</td>
                        <td className="px-4 py-3 text-sm text-center dark:text-gray-300">{course.sectionNumber || '-'}</td>
                        <td className="px-4 py-3 text-sm dark:text-gray-300">{course.title}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {ucoreCategories.map(cat => (
                              <span key={cat} className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getUCOREBadgeColor(cat)}`}>{cat}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm dark:text-gray-300">{course.credits}</td>
                        <td className="px-4 py-3 text-sm dark:text-gray-300">{course.campus}</td>
                        <td className="px-4 py-3 text-sm dark:text-gray-300 whitespace-nowrap">{course.term} {course.year}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            course.seatsAvail > 10 ? 'bg-green-100 text-green-800' :
                            course.seatsAvail > 0 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {course.seatsAvail}/{course.max}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleAdd(course)}
                            className="px-3 py-1 bg-crimson text-white rounded text-xs hover:bg-crimson/90 transition whitespace-nowrap"
                          >
                            + Add
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Schedule Panel */}
        <div className="w-72 flex-shrink-0 sticky top-4">
          <SchedulePanel
            key={scheduleTick}
            year={filters.year}
            term={filters.term}
            onSwitchTo={switchToSchedule}
          />
        </div>
      </div>
    </div>
  );
}

export default CourseSearch;
