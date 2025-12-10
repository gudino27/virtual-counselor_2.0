import React, { useState, useEffect } from 'react';
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
  const coursesPerPage = 50;

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
      alert('Error searching courses: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPlanner = (course) => {
    // Load the saved degree plan using the storage helper. Support legacy structures.
    const saved = loadDegreePlan();
    if (!saved || (!saved.plan && !saved.degreePlan && !saved.years)) {
      alert('Please select a degree in the Degree Planner first');
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
        alert('Unable to read degree plan structure. Please open Degree Planner and select a degree.');
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
        alert(`Added ${course.prefix} ${course.courseNumber} to your degree plan!`);
      } else {
        alert('No empty slots available. Add more courses or years in the Degree Planner.');
      }
    } catch (error) {
      console.error('Error adding to planner:', error);
      alert('Error adding course to planner');
    }
  };

  const updateFilter = (key, value) => {
    setFilters({ ...filters, [key]: value });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold text-crimson mb-4">Course Search</h2>
        
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <select
            value={filters.year}
            onChange={(e) => updateFilter('year', e.target.value)}
            className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
          >
            <option value="">Year</option>
            {[2025, 2024, 2023].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filters.term}
            onChange={(e) => updateFilter('term', e.target.value)}
            className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
          >
            <option value="">Term</option>
            <option value="Spring">Spring</option>
            <option value="Summer">Summer</option>
            <option value="Fall">Fall</option>
          </select>

          <select
            value={filters.campus}
            onChange={(e) => updateFilter('campus', e.target.value)}
            className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
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
            className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
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
            className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
          />

          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
          />
        </div>

        <button
          onClick={search}
          disabled={loading}
          className="w-full md:w-auto px-6 py-3 bg-crimson text-white rounded-lg hover:bg-crimson/90 transition font-semibold disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search Courses'}
        </button>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
          <h3 className="font-semibold">{totalCourses} courses found</h3>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-wsu-crimson shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'calendar' ? 'bg-white text-wsu-crimson shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Calendar
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-sm">
              Page {page} of {Math.ceil(totalCourses / coursesPerPage)}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(totalCourses / coursesPerPage)}
              className="px-3 py-1 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Next
            </button>
          </div>
        </div>
        
        {viewMode === 'calendar' ? (
          <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-100 p-4 overflow-auto max-h-[600px]">
              <h3 className="font-semibold text-gray-900 mb-3">Filters & Results</h3>
              <div className="text-sm text-gray-600 mb-4">{courses.length} of results</div>
              <div className="space-y-2 divide-y divide-gray-100">
                {courses.map(c => (
                  <div key={c.id || c.uniqueId} className="pt-2 first:pt-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{c.prefix} {c.courseNumber}</div>
                    <div className="text-xs text-gray-600 truncate">{c.title}</div>
                    <div className="text-xs text-gray-500">{c.dayTime || 'TBA'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-full min-h-[400px]"><WeeklyCalendar courses={courses} /></div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">UCORE</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Credits</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Campus</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Term</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Seats</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {courses.map((course, index) => {
                  const ucoreCategories = extractUCORECategories({ ucore: course.ucore });
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-sm font-medium">{course.prefix} {course.courseNumber}</td>
                      <td className="px-4 py-3 text-sm">{course.title}</td>
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
                      <td className="px-4 py-3 text-center text-sm">{course.credits}</td>
                      <td className="px-4 py-3 text-sm">{course.campus}</td>
                      <td className="px-4 py-3 text-sm">{course.term} {course.year}</td>
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
