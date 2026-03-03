import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import WeeklyCalendar from './WeeklyCalendar';
import { fetchCourses, fetchTerms, fetchPrefixes } from '../utils/api';
import { extractUCORECategories, getUCOREBadgeColor } from '../utils/courseHelpers';
import { loadDegreePlan, saveDegreePlan } from '../utils/storage';

function CourseSearch() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    term: '',
    year: new Date().getFullYear(),
    campus: '',
    prefix: '',
    search: '',
    minSeats: '',
  });
  const [terms, setTerms] = useState([]);
  const [prefixes, setPrefixes] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCourses, setTotalCourses] = useState(0);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [showSubject, setShowSubject] = useState(false);
  const coursesPerPage = 50;

  const displayCourseCode = (course) =>
    showSubject
      ? `${course.subject || course.prefix} ${course.courseNumber}`
      : `${course.prefix} ${course.courseNumber}`;

  useEffect(() => {
    loadTerms();
    loadPrefixes();
  }, []);

  const loadTerms = async () => {
    try {
      const data = await fetchTerms();
      setTerms(data.terms || []);
    } catch (error) {
      console.error('Error loading terms:', error);
    }
  };

  const loadPrefixes = async () => {
    try {
      const data = await fetchPrefixes();
      setPrefixes(data || []);
    } catch (error) {
      console.error('Error loading prefixes:', error);
    }
  };

  const search = async () => {
    setLoading(true);
    try {
      const data = await fetchCourses({ ...filters, page, limit: coursesPerPage });
      setCourses(data.courses || []);
      setTotalCourses(data.total || 0);
    } catch (error) {
      console.error('Error searching courses:', error);
      toast.error('Error searching courses: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPlanner = (course) => {
    // Load the saved degree plan using the storage helper. Support legacy structures.
    const saved = loadDegreePlan();
    if (!saved || (!saved.plan && !saved.degreePlan && !saved.years)) {
      toast.error('Please select a degree in the Degree Planner first');
      return;
    }

    try {
      // Two possible shapes:
      // 1) { plan: { '1': { fall: { courses: [...] }, ... }, ... }, years: [...] }
      // 2) legacy { degreePlan: { years: [ { terms: { fall: { courses: [...] } } } ] } }
      let planObj = null;
      let yearsArr = null;

      if (saved.plan) {
        planObj = JSON.parse(JSON.stringify(saved.plan));
        yearsArr = Object.keys(planObj).map(k => ({ id: k }));
      } else if (saved.degreePlan) {
        planObj = {};
        yearsArr = saved.degreePlan.years || [];
        yearsArr.forEach((y, idx) => {
          planObj[idx + 1] = { fall: { courses: y.terms.fall.courses || [] }, spring: { courses: y.terms.spring.courses || [] }, summer: { courses: y.terms.summer.courses || [] } };
        });
      } else if (Array.isArray(saved.years) && Object.keys(saved).length > 0) {
        // saved could be { years: [...], plan: undefined }
        planObj = saved.plan || {};
        yearsArr = saved.years;
      }

      if (!planObj) {
        toast.error('Unable to read degree plan structure. Please open Degree Planner and select a degree.');
        return;
      }

      // Find first empty slot
      let added = false;
      const yearKeys = Object.keys(planObj).sort((a, b) => Number(a) - Number(b));
      for (const yk of yearKeys) {
        const ydata = planObj[yk];
        for (const term of ['fall', 'spring', 'summer']) {
          const termCourses = (ydata[term] && ydata[term].courses) || [];
          const emptySlot = termCourses.find(c => !c.name);
          if (emptySlot) {
            emptySlot.name = `${course.prefix} ${course.courseNumber}`;
            emptySlot.credits = course.credits || 3;
            emptySlot.attributes = course.ucore ? course.ucore.split(',') : [];
            added = true;
            break;
          }
        }
        if (added) break;
      }

      if (added) {
        // Save back using saveDegreePlan
        const saveObj = { plan: planObj, years: saved.years || yearsArr, programs: saved.programs || {} };
        saveDegreePlan(saveObj);
        toast.success(`Added ${course.prefix} ${course.courseNumber} to your degree plan!`);
      } else {
        toast.error('No empty slots available. Add more courses or years in the Degree Planner.');
      }
    } catch (error) {
      console.error('Error adding to planner:', error);
      toast.error('Error adding course to planner');
    }
  };

  const updateFilter = (key, value) => {
    setFilters({ ...filters, [key]: value });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold text-crimson dark:text-red-400 mb-4">Course Search</h2>
        
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <select
            value={filters.year}
            onChange={(e) => updateFilter('year', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white"
          >
            <option value="">Year</option>
            {[2025, 2024, 2023].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filters.term}
            onChange={(e) => updateFilter('term', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white"
          >
            <option value="">Term</option>
            <option value="Spring">Spring</option>
            <option value="Summer">Summer</option>
            <option value="Fall">Fall</option>
          </select>

          <select
            value={filters.campus}
            onChange={(e) => updateFilter('campus', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white"
          >
            <option value="">Campus</option>
            <option value="Pullman">Pullman</option>
            <option value="Spokane">Spokane</option>
            <option value="TriCities">Tri-Cities</option>
            <option value="Vancouver">Vancouver</option>
            <option value="Everett">Everett</option>
            <option value="Online">Online</option>
          </select>

          <select
            value={filters.prefix}
            onChange={(e) => updateFilter('prefix', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white"
          >
            <option value="">Prefix</option>
            {prefixes.slice(0, 50).map(p => (
              <option key={p.prefix} value={p.prefix}>{p.prefix}</option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Min Seats"
            value={filters.minSeats}
            onChange={(e) => updateFilter('minSeats', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />

          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-crimson dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={search}
            disabled={loading}
            className="w-full md:w-auto px-6 py-3 bg-crimson text-white rounded-lg hover:bg-crimson/90 transition font-semibold disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search Courses'}
          </button>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setShowSubject(s => !s)}
              className={`relative w-10 h-5 rounded-full transition-colors ${showSubject ? 'bg-crimson' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showSubject ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Show subject names <span className="text-gray-400 dark:text-gray-500 text-xs">({showSubject ? 'e.g. Spanish 101' : 'e.g. SPAN 101'})</span>
            </span>
          </label>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <div className="p-4 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 flex justify-between items-center">
          <h3 className="font-semibold dark:text-white">{totalCourses} courses found</h3>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-600 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-800 text-wsu-crimson dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-gray-800 text-wsu-crimson dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
              >
                Calendar
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm dark:text-gray-300">
              Page {page} of {Math.ceil(totalCourses / coursesPerPage)}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(totalCourses / coursesPerPage)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Next
            </button>
          </div>
        </div>
        
        {viewMode === 'calendar' ? (
          <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
            <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 overflow-auto max-h-[600px]">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Filters & Results</h3>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">{courses.length} of results</div>
              <div className="space-y-2 divide-y divide-gray-100 dark:divide-gray-700">
                {courses.map(c => (
                  <div key={c.id || c.uniqueId} className="pt-2 first:pt-0">
                    <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{displayCourseCode(c)}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{c.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-500">{c.dayTime || 'TBA'}</div>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Credits</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Campus</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Term</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Seats</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {courses.map((course, index) => {
                  const ucoreCategories = extractUCORECategories({ ucore: course.ucore });

                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 font-mono text-sm font-medium dark:text-gray-200">{displayCourseCode(course)}</td>
                      <td className="px-4 py-3 text-sm text-center dark:text-gray-300">{course.sectionNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm dark:text-gray-300">{course.title}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ucoreCategories.map(cat => (
                            <span
                              key={cat}
                              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getUCOREBadgeColor(cat)}`}
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm dark:text-gray-300">{course.credits}</td>
                      <td className="px-4 py-3 text-sm dark:text-gray-300">{course.campus}</td>
                      <td className="px-4 py-3 text-sm dark:text-gray-300">{course.term} {course.year}</td>
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
                          onClick={() => handleAddToPlanner(course)}
                          className="px-3 py-1 bg-crimson text-white rounded text-xs hover:bg-crimson/90 transition"
                        >
                          Add to Plan
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
    </div>
  );
}

export default CourseSearch;
