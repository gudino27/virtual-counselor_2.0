import React from 'react';
import CourseRow, { GRADE_POINTS } from './CourseRow';

// Term Card Component
function TermCard({ title, term, yearId, courses, degreePlan, setDegreePlan, openCatalogForCourse, openClassCalc }) {
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  const calculateTermGPA = () => {
    let points = 0;
    let credits = 0;
    courses.forEach(c => {
      if (c.status === 'taken' && c.grade) {
        points += (GRADE_POINTS[c.grade] || 0) * c.credits;
        credits += c.credits;
      }
    });
    return credits > 0 ? (points / credits).toFixed(2) : '—';
  };

  const addCourse = () => {
    const newCourse = {
      id: Date.now(),
      name: '',
      credits: 0,
      grade: '',
      status: 'not-taken'
    };

    setDegreePlan(prev => ({
      ...prev,
      [yearId]: {
        ...prev[yearId],
        [term]: {
          courses: [...prev[yearId][term].courses, newCourse]
        }
      }
    }));
  };

  const updateCourse = (courseId, field, value) => {
    setDegreePlan(prev => ({
      ...prev,
      [yearId]: {
        ...prev[yearId],
        [term]: {
          courses: prev[yearId][term].courses.map(c =>
            c.id === courseId ? { ...c, [field]: value } : c
          )
        }
      }
    }));
  };

  const removeCourse = (courseId) => {
    setDegreePlan(prev => ({
      ...prev,
      [yearId]: {
        ...prev[yearId],
        [term]: {
          courses: prev[yearId][term].courses.filter(c => c.id !== courseId)
        }
      }
    }));
  };

  const enrollmentStatus = totalCredits >= 12 ? 'Full-Time' : 'Part-Time';
  const statusColor = totalCredits >= 12 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold">{title}</h4>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
          {enrollmentStatus}
        </span>
      </div>

      <div className="text-sm text-gray-600 mb-3">
        {totalCredits} credits
        {totalCredits > 23 && (
          <div className="text-xs text-orange-600 mt-1">⚠️ Advisor approval required</div>
        )}
      </div>

      <div className="space-y-2">
        {courses.map((course, idx) => (
          <CourseRow
            key={`${course.id || 'noid'}-${idx}`}
            course={course}
            onUpdate={updateCourse}
            onRemove={removeCourse}
            yearId={yearId}
            term={term}
            openCatalog={openCatalogForCourse}
            openClassCalc={openClassCalc}
          />
        ))}
      </div>

      <button
        onClick={addCourse}
        className="w-full mt-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-wsu-crimson hover:text-wsu-crimson transition"
      >
        + Add Course
      </button>

      <div className="mt-3 pt-3 border-t text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Term GPA:</span>
          <span className="font-semibold">{calculateTermGPA()}</span>
        </div>
      </div>
    </div>
  );
}

export default TermCard;
