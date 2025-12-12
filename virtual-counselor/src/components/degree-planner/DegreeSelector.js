import React from 'react';

function DegreeSelector({
  // Catalog state
  catalogYears,
  selectedYear,
  setSelectedYear,
  // Filter/sort state
  degreeFilterType,
  setDegreeFilterType,
  degreeSortBy,
  setDegreeSortBy,
  // Search state
  degreeSearch,
  setDegreeSearch,
  showDegreeSuggestions,
  setShowDegreeSuggestions,
  degreeInputRef,
  // Degrees data
  degrees,
  selectedPrograms,
  // Actions
  handleAddProgram,
  handleRemoveProgram
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Select Degree Program</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Catalog Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          >
            {catalogYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Type</label>
          <select
            value={degreeFilterType}
            onChange={(e) => setDegreeFilterType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          >
            <option value="all">All Programs</option>
            <option value="major">Majors Only</option>
            <option value="minor">Minors Only</option>
            <option value="certificate">Certificates Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sort by</label>
          <select
            value={degreeSortBy}
            onChange={(e) => setDegreeSortBy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="type">By Type</option>
          </select>
        </div>
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Programs</label>
          <input
            ref={degreeInputRef}
            type="text"
            value={degreeSearch}
            onChange={(e) => {
              setDegreeSearch(e.target.value);
              setShowDegreeSuggestions(true);
            }}
            onFocus={() => setShowDegreeSuggestions(true)}
            onBlur={() => setTimeout(() => setShowDegreeSuggestions(false), 200)}
            placeholder="Type to search..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          />

          {/* Suggestions Dropdown */}
          {showDegreeSuggestions && degreeSearch.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {degrees
                .filter(d => degreeFilterType === 'all' || d.degree_type === degreeFilterType)
                .filter(d => d.name.toLowerCase().includes(degreeSearch.toLowerCase()))
                .sort((a, b) => {
                  if (degreeSortBy === 'name-asc') return a.name.localeCompare(b.name);
                  if (degreeSortBy === 'name-desc') return b.name.localeCompare(a.name);
                  if (degreeSortBy === 'type') {
                    const typeOrder = { major: 1, minor: 2, certificate: 3 };
                    return (typeOrder[a.degree_type] || 4) - (typeOrder[b.degree_type] || 4);
                  }
                  return 0;
                })
                .slice(0, 20)
                .map(d => (
                  <button
                    key={d.id}
                    onClick={() => {
                      const typeMap = {
                        'major': 'majors',
                        'minor': 'minors',
                        'certificate': 'certificates'
                      };
                      const programType = typeMap[d.degree_type] || 'majors';
                      handleAddProgram(programType, d.name);
                      setDegreeSearch('');
                      setShowDegreeSuggestions(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-between"
                  >
                    <span className="text-sm">{d.name}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      d.degree_type === 'major' ? 'bg-blue-100 text-blue-800' :
                      d.degree_type === 'minor' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {d.degree_type === 'major' ? 'Major' :
                       d.degree_type === 'minor' ? 'Minor' : 'Certificate'}
                    </span>
                  </button>
                ))}
              {degrees
                .filter(d => degreeFilterType === 'all' || d.degree_type === degreeFilterType)
                .filter(d => d.name.toLowerCase().includes(degreeSearch.toLowerCase())).length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  No {degreeFilterType === 'all' ? 'programs' : degreeFilterType + 's'} found matching "{degreeSearch}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected Programs */}
      {[...selectedPrograms.majors, ...selectedPrograms.minors, ...selectedPrograms.certificates].length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Programs:</h4>
          <div className="space-y-2">
            {/* Majors */}
            {selectedPrograms.majors.map((prog, idx) => (
              <div key={`major-${idx}`} className="border border-gray-200 rounded-lg">
                <div className="px-3 py-2 bg-wsu-crimson text-white rounded-t-lg font-medium text-sm flex items-center justify-between">
                  <span>{prog.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Major</span>
                    <button
                      onClick={() => handleRemoveProgram('majors', prog.name)}
                      className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5"
                      title="Remove program"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {prog.data?.degree?.narrative && (
                  <details className="px-3 py-2 bg-gray-50">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-wsu-crimson">
                       Degree Information & Requirements
                    </summary>
                    <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                      {prog.data.degree.narrative}
                    </div>
                  </details>
                )}
              </div>
            ))}
            {/* Minors */}
            {selectedPrograms.minors.map((prog, idx) => (
              <div key={`minor-${idx}`} className="border border-gray-200 rounded-lg">
                <div className="px-3 py-2 bg-green-700 text-white rounded-t-lg font-medium text-sm flex items-center justify-between">
                  <span>{prog.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Minor</span>
                    <button
                      onClick={() => handleRemoveProgram('minors', prog.name)}
                      className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5"
                      title="Remove program"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {prog.data?.degree?.narrative && (
                  <details className="px-3 py-2 bg-gray-50">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-wsu-crimson">
                       Minor Information & Requirements
                    </summary>
                    <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                      {prog.data.degree.narrative}
                    </div>
                  </details>
                )}
              </div>
            ))}
            {/* Certificates */}
            {selectedPrograms.certificates.map((prog, idx) => (
              <div key={`cert-${idx}`} className="border border-gray-200 rounded-lg">
                <div className="px-3 py-2 bg-purple-700 text-white rounded-t-lg font-medium text-sm flex items-center justify-between">
                  <span>{prog.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded">Certificate</span>
                    <button
                      onClick={() => handleRemoveProgram('certificates', prog.name)}
                      className="text-white/80 hover:text-white hover:bg-white/20 rounded p-0.5"
                      title="Remove program"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {prog.data?.degree?.narrative && (
                  <details className="px-3 py-2 bg-gray-50">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-wsu-crimson">
                       Certificate Information & Requirements
                    </summary>
                    <div className="mt-2 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                      {prog.data.degree.narrative}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DegreeSelector;
