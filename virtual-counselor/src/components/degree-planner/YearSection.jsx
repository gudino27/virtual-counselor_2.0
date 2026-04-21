import React, { useState } from 'react';
import TermCard from './TermCard';

// Year Section Component
function YearSection({ year, degreePlan, setDegreePlan, onDeleteYear, canDelete, hideHeader, openCatalogForCourse, openClassCalc, onMoveClick, activeTermTab, setActiveTermTab, allCompletedCourses, duplicateCourses }) {
  const [expanded, setExpanded] = useState(true);

  const yearData = degreePlan[year.id] || { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };

  const termNames = [
    { key: 'fall', label: 'Fall' },
    { key: 'spring', label: 'Spring' },
    { key: 'summer', label: 'Summer' }
  ];

      {/* Bulk Status Menu Component */}
      const TermOptionsMenu = ({ termKey }) => (
        <div className="relative group inline-block ml-2">
            <button 
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Term Options"
                onClick={(e) => e.stopPropagation()} 
            >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
            </button>
            {/* Dropdown */}
            <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 hidden group-hover:block text-left">
                <div className="py-1">
                    <button 
                        onClick={() => {
                            setDegreePlan(prev => ({
                              ...prev,
                              [year.id]: {
                                ...prev[year.id],
                                [termKey]: {
                                  courses: (prev[year.id][termKey].courses || []).map(c => ({ ...c, status: 'taken', grade: c.grade || '' }))
                                }
                              }
                            }));
                        }}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Mark all Taken
                    </button>
                     <button 
                        onClick={() => {
                            setDegreePlan(prev => ({
                              ...prev,
                              [year.id]: {
                                ...prev[year.id],
                                [termKey]: {
                                  courses: (prev[year.id][termKey].courses || []).map(c => ({ ...c, status: 'in-progress' }))
                                }
                              }
                            }));
                        }}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Mark all In-Progress
                    </button>
                     <button 
                        onClick={() => {
                            setDegreePlan(prev => ({
                              ...prev,
                              [year.id]: {
                                ...prev[year.id],
                                [termKey]: {
                                  courses: (prev[year.id][termKey].courses || []).map(c => ({ ...c, status: 'planned', grade: '' }))
                                }
                              }
                            }));
                        }}
                        className="block w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Mark all Planned
                    </button>
                </div>
            </div>
        </div>
      );

      return (
        <div className={hideHeader ? '' : 'bg-white rounded-lg shadow'}>
          {!hideHeader && (
            <div className="flex items-center justify-between p-4 border-b">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center space-x-2 font-semibold text-lg"
              >
                <svg
                  className={`w-5 h-5 transition-transform ${expanded ? 'transform rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>{year.name}</span>
              </button>
              {canDelete && (
                <button
                  onClick={onDeleteYear}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition"
                >
                  Delete Year
                </button>
              )}
            </div>
          )}
    
          {/* Mobile Term Tabs (visible only on small screens) */}
      <div className="md:hidden px-4 pt-3 flex items-center justify-between gap-2">
        <div className="flex bg-gray-50 rounded-lg overflow-hidden flex-1">
          {termNames.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTermTab(t.key)}
              className={`mobile-tab ${activeTermTab === t.key ? 'mobile-tab-active' : 'mobile-tab-inactive'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Mobile Bulk Menu (for active term) */}
        <TermOptionsMenu termKey={activeTermTab} />
      </div>
    
          {(hideHeader || expanded) && (
            <>
              {/* Desktop Term Headers */}
              <div className="hidden md:grid md:grid-cols-3 md:gap-4 px-4 pt-4 pb-0 mb-1">
                 <div className="bg-gray-100 dark:bg-gray-700 rounded-md py-2 border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center relative">
                    <span className="font-bold text-gray-700 dark:text-gray-200 uppercase text-sm tracking-widest">Fall</span>
                    <div className="absolute right-2 top-1.5">
                        <TermOptionsMenu termKey="fall" />
                    </div>
                 </div>
                 <div className="bg-gray-100 dark:bg-gray-700 rounded-md py-2 border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center relative">
                    <span className="font-bold text-gray-700 dark:text-gray-200 uppercase text-sm tracking-widest">Spring</span>
                    <div className="absolute right-2 top-1.5">
                        <TermOptionsMenu termKey="spring" />
                    </div>
                 </div>
                 <div className="bg-gray-100 dark:bg-gray-700 rounded-md py-2 border border-gray-200 dark:border-gray-600 shadow-sm flex items-center justify-center relative">
                    <span className="font-bold text-gray-700 dark:text-gray-200 uppercase text-sm tracking-widest">Summer</span>
                    <div className="absolute right-2 top-1.5">
                        <TermOptionsMenu termKey="summer" />
                    </div>
                 </div>
              </div>

          {/* Desktop: three columns */}
          <div className="hidden md:grid md:grid-cols-3 md:gap-4 px-4 pb-4">
            <TermCard
              title="Fall"
              term="fall"
              yearId={year.id}
              courses={yearData.fall.courses}
              degreePlan={degreePlan}
              setDegreePlan={setDegreePlan}
              openCatalogForCourse={openCatalogForCourse}
              openClassCalc={openClassCalc}
              onMoveClick={onMoveClick}
              allCompletedCourses={allCompletedCourses}
              duplicateCourses={duplicateCourses}
            />
            <TermCard
              title="Spring"
              term="spring"
              yearId={year.id}
              courses={yearData.spring.courses}
              degreePlan={degreePlan}
              setDegreePlan={setDegreePlan}
              openCatalogForCourse={openCatalogForCourse}
              openClassCalc={openClassCalc}
              onMoveClick={onMoveClick}
              allCompletedCourses={allCompletedCourses}
              duplicateCourses={duplicateCourses}
            />
            <TermCard
              title="Summer"
              term="summer"
              yearId={year.id}
              courses={yearData.summer.courses}
              degreePlan={degreePlan}
              setDegreePlan={setDegreePlan}
              openCatalogForCourse={openCatalogForCourse}
              openClassCalc={openClassCalc}
              onMoveClick={onMoveClick}
              allCompletedCourses={allCompletedCourses}
              duplicateCourses={duplicateCourses}
            />
          </div>

          {/* Mobile: only show the active term */}
          <div className="md:hidden px-4">
            {activeTermTab === 'fall' && (
              <TermCard
                title="Fall"
                term="fall"
                yearId={year.id}
                courses={yearData.fall.courses}
                degreePlan={degreePlan}
                setDegreePlan={setDegreePlan}
                openCatalogForCourse={openCatalogForCourse}
                openClassCalc={openClassCalc}
                onMoveClick={onMoveClick}
                allCompletedCourses={allCompletedCourses}
                duplicateCourses={duplicateCourses}
              />
            )}
            {activeTermTab === 'spring' && (
              <TermCard
                title="Spring"
                term="spring"
                yearId={year.id}
                courses={yearData.spring.courses}
                degreePlan={degreePlan}
                setDegreePlan={setDegreePlan}
                openCatalogForCourse={openCatalogForCourse}
                openClassCalc={openClassCalc}
                onMoveClick={onMoveClick}
                allCompletedCourses={allCompletedCourses}
                duplicateCourses={duplicateCourses}
              />
            )}
            {activeTermTab === 'summer' && (
              <TermCard
                title="Summer"
                term="summer"
                yearId={year.id}
                courses={yearData.summer.courses}
                degreePlan={degreePlan}
                setDegreePlan={setDegreePlan}
                openCatalogForCourse={openCatalogForCourse}
                openClassCalc={openClassCalc}
                onMoveClick={onMoveClick}
                allCompletedCourses={allCompletedCourses}
                duplicateCourses={duplicateCourses}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default YearSection;
