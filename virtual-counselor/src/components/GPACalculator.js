import React, { useState } from 'react';
import { X } from 'lucide-react';
import { calculateGPA, gradeToGPA, percentageToGrade, gradeToPercentage } from '../utils/gpaCalculator';

function GPACalculator() {
  const [courses, setCourses] = useState([
    { name: '', credits: 0, grade: '' }
  ]);

  const addCourse = () => {
    setCourses([...courses, { name: '', credits: 0, grade: '' }]);
  };

  const removeCourse = (index) => {
    setCourses(courses.filter((_, i) => i !== index));
  };

  const updateCourse = (index, field, value) => {
    const newCourses = [...courses];
    newCourses[index][field] = field === 'credits' ? parseInt(value) || 0 : value;
    setCourses(newCourses);
  };

  const gpa = calculateGPA(courses.map(c => ({ ...c, status: 'completed' })));
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);

  const gradeOptions = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-crimson mb-4">GPA Calculator</h2>
        <p className="text-gray-600 mb-6">
          Enter your courses and grades to calculate your GPA
        </p>

        {/* GPA Display */}
        <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm text-gray-600">Current GPA</p>
            <p className="text-3xl font-bold text-crimson">{gpa.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Credits</p>
            <p className="text-3xl font-bold text-gray-700">{totalCredits}</p>
          </div>
        </div>

        {/* Course List */}
        <div className="space-y-3">
          {courses.map((course, index) => (
            <div key={index} className="flex gap-3 items-start p-4 border rounded-lg">
              <input
                type="text"
                placeholder="Course Name"
                value={course.name}
                onChange={(e) => updateCourse(index, 'name', e.target.value)}
                className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
              />
              <input
                type="number"
                placeholder="Credits"
                value={course.credits || ''}
                onChange={(e) => updateCourse(index, 'credits', e.target.value)}
                min="0"
                max="6"
                className="w-24 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
              />
              <select
                value={course.grade}
                onChange={(e) => updateCourse(index, 'grade', e.target.value)}
                className="w-28 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-crimson"
              >
                <option value="">Grade</option>
                {gradeOptions.map(g => (
                  <option key={g} value={g}>{g} ({gradeToGPA(g).toFixed(1)})</option>
                ))}
              </select>
              <button
                onClick={() => removeCourse(index)}
                className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
                aria-label="Remove course"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Course Button */}
        <button
          onClick={addCourse}
          className="mt-4 w-full py-3 bg-crimson text-white rounded-lg hover:bg-crimson/90 transition font-semibold"
        >
          + Add Course
        </button>

        {/* Grade Scale Reference */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-3">WSU Grade Scale</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {gradeOptions.map(grade => (
              <div key={grade} className="flex justify-between">
                <span>{grade}:</span>
                <span className="font-mono">{gradeToGPA(grade).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GPACalculator;
