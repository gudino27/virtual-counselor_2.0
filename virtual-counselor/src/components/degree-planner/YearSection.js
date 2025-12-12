import React, { useState } from 'react';
import TermCard from './TermCard';

// Year Section Component
function YearSection({ year, degreePlan, setDegreePlan, onDeleteYear, canDelete, hideHeader, openCatalogForCourse, openClassCalc, activeTermTab, setActiveTermTab }) {
  const [expanded, setExpanded] = useState(true);

  const yearData = degreePlan[year.id] || { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };

  const termNames = [
    { key: 'fall', label: 'Fall' },
    { key: 'spring', label: 'Spring' },
    { key: 'summer', label: 'Summer' }
  ];

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
      <div className="md:hidden px-4 pt-3">
        <div className="flex bg-gray-50 rounded-lg overflow-hidden">
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
      </div>

      {(hideHeader || expanded) && (
        <>
          {/* Desktop: three columns */}
          <div className="hidden md:grid md:grid-cols-3 md:gap-4 p-4">
            <TermCard
              title="Fall"
              term="fall"
              yearId={year.id}
              courses={yearData.fall.courses}
              degreePlan={degreePlan}
              setDegreePlan={setDegreePlan}
              openCatalogForCourse={openCatalogForCourse}
              openClassCalc={openClassCalc}
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
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default YearSection;
