import React from 'react';
import ProfessorRating from '../ProfessorRating';
import { stripHtml, parseInstructors, formatDayTime, getCourseDateRange } from './utils';

// Helper component for info rows
function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex">
      <span className="w-24 text-sm font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}

// Course Details Modal
function CourseDetailsModal({ course, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-wsu-crimson">
                {course.prefix || course.coursePrefix} {course.courseNumber}
              </h2>
              <p className="text-gray-600">{stripHtml(course.title)}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <InfoRow label="Credits" value={course.credits} />
              <InfoRow label="Section" value={course.sectionNumber} />
              <InfoRow label="SLN" value={course.sln || course.slnNumber || course.slnId || course.sectionSln} />
              <InfoRow label="Type" value={(course.isLab || stripHtml(course.sectionTitle || '').toLowerCase().includes('lab')) ? 'Lab' : 'Lecture'} />
              <InfoRow label="Instructor" value={parseInstructors(course)} />
              {(() => {
                const inst = parseInstructors(course);
                if (inst && inst !== 'Staff') {
                  // Use first listed instructor for rating lookup
                  const first = inst.split(',')[0].trim();
                  return (
                    <div className="col-span-2">
                      <div className="mt-2">
                        <ProfessorRating name={first} />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <InfoRow label="Time" value={formatDayTime(course.dayTime)} />
              {(() => {
                const dr = getCourseDateRange(course);
                return (
                  <>
                    <InfoRow label="Start" value={dr.start} />
                    <InfoRow label="End" value={dr.end} />
                  </>
                );
              })()}
              <InfoRow label="Location" value={course.location || 'TBD'} />
              <InfoRow label="Seats" value={`${course.seatsAvailable || 0} available / ${course.maxEnrollment || course.capacity || '?' } total`} />
            </div>

            {course.courseDescription && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
                <p className="text-sm text-gray-600">{stripHtml(course.courseDescription)}</p>
              </div>
            )}

            {course.coursePrerequisite && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">Prerequisites</h4>
                <p className="text-sm text-gray-600">{stripHtml(course.coursePrerequisite)}</p>
              </div>
            )}

            {course.ucore && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">UCORE</h4>
                <p className="text-sm text-gray-600">{course.ucore}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CourseDetailsModal;
