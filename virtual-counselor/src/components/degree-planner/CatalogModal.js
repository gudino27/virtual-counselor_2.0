import React from 'react';

function CatalogModal({
  show,
  onClose,
  catalogResults,
  filteredCatalogResults,
  isUcoreAggregated,
  // Search state
  catalogSearch,
  setCatalogSearch,
  catalogClientSearch,
  setCatalogClientSearch,
  // Year/Term state
  catalogYears,
  catalogModalYear,
  setCatalogModalYear,
  catalogModalTerm,
  setCatalogModalTerm,
  // UCORE state
  availableUcoreCats,
  catalogUcoreSelected,
  setCatalogUcoreSelected,
  ucoreRemainingCredits,
  // View state
  catalogViewMode,
  setCatalogViewMode,
  catalogIndex,
  setCatalogIndex,
  // Target state
  catalogTarget,
  // Actions
  fetchCatalogCandidates,
  addCatalogCourseToPlan,
  autoFillUcore,
  // Plan data
  years,
  activeYearTab
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-bold">Select Courses (Catalog)</h3>
          <button onClick={onClose} className="text-gray-600">Close</button>
        </div>

        {/* Show UCORE satisfaction summary when available from elective queries */}
        {catalogResults && catalogResults[0] && catalogResults[0]._ucoreSummary && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-100 rounded text-sm text-yellow-800">
            <strong>UCORE status:</strong>
            {(() => {
              const s = catalogResults[0]._ucoreSummary;
              if (!s) return null;
              if (s.remaining && s.remaining.length === 0) return <span> All required categories satisfied by your plan.</span>;
              return <span> Remaining: {s.remaining.join(', ')}</span>;
            })()}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          {/* Input area: three modes */}
          {isUcoreAggregated ? (
            <>
              <div className="col-span-2">
                <input
                  type="text"
                  placeholder="Filter results (client-side): code, title, description..."
                  value={catalogClientSearch}
                  onChange={(e) => setCatalogClientSearch(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
                {/* UCORE category buttons */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {availableUcoreCats.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCatalogUcoreSelected(prev => prev === cat ? null : cat)}
                      className={`px-2 py-1 text-sm rounded border ${catalogUcoreSelected === cat ? 'bg-wsu-crimson text-white' : 'bg-white'}`}
                      title={`Show courses that satisfy ${cat}`}
                    >
                      {cat}
                    </button>
                  ))}
                  {availableUcoreCats.length === 0 && (
                    <div className="text-sm text-gray-500">No UCORE categories detected.</div>
                  )}
                </div>
              </div>
              <div className="flex space-x-2">
                <select value={catalogModalYear} onChange={e => setCatalogModalYear(e.target.value)} className="px-3 py-2 border rounded">
                  {(catalogYears || []).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={catalogModalTerm} onChange={e => setCatalogModalTerm(e.target.value)} className="px-3 py-2 border rounded">
                  <option value="fall">Fall</option>
                  <option value="spring">Spring</option>
                  <option value="summer">Summer</option>
                </select>
                <button className="px-3 py-2 bg-gray-200 text-gray-700 rounded" title="Client-side filter only">Filter</button>
              </div>
            </>
          ) : (catalogTarget && catalogResults.length > 0 && catalogResults[0] && catalogResults[0]._disabledForFootnote !== undefined) ? (
            <div className="col-span-3">
              <div className="text-sm text-gray-700">Showing options from the selected course's footnotes. Use these choices to fill the placeholder. Changing year/term will refresh availability.</div>
            </div>
          ) : (
            <>
              <div className="col-span-2">
                <input
                  type="text"
                  placeholder="Search catalog (title, code, description...)"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="flex space-x-2">
                <select value={catalogModalYear} onChange={e => setCatalogModalYear(e.target.value)} className="px-3 py-2 border rounded">
                  {(catalogYears || []).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={catalogModalTerm} onChange={e => setCatalogModalTerm(e.target.value)} className="px-3 py-2 border rounded">
                  <option value="fall">Fall</option>
                  <option value="spring">Spring</option>
                  <option value="summer">Summer</option>
                </select>
                <button onClick={() => fetchCatalogCandidates(catalogSearch)} className="px-3 py-2 bg-wsu-crimson text-white rounded">Search</button>
              </div>
            </>
          )}
        </div>

        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">Select a course to add it to your plan. Check campus availability — offerings may vary by campus/term.</div>
          <div className="space-y-3">
            {catalogResults.length === 0 && (
              <div className="text-sm text-gray-500">No results. Try a broader search or change year.</div>
            )}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">View:</label>
                <button onClick={() => { setCatalogViewMode('list'); setCatalogIndex(0); }} className={`px-2 py-1 text-sm rounded ${catalogViewMode==='list' ? 'bg-gray-200' : 'bg-white'}`}>List</button>
                <button onClick={() => { setCatalogViewMode('carousel'); setCatalogIndex(0); }} className={`px-2 py-1 text-sm rounded ${catalogViewMode==='carousel' ? 'bg-gray-200' : 'bg-white'}`}>Carousel</button>
              </div>
              {catalogViewMode === 'carousel' && catalogResults.length > 0 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCatalogIndex(i => { const nxt = (i - 1 + filteredCatalogResults.length) % Math.max(1, filteredCatalogResults.length); return nxt; })} className="px-2 py-1 bg-white rounded border">Prev</button>
                  <div className="text-sm text-gray-600">{catalogIndex + 1} / {filteredCatalogResults.length}</div>
                  <button onClick={() => setCatalogIndex(i => { const nxt = (i + 1) % Math.max(1, filteredCatalogResults.length); return nxt; })} className="px-2 py-1 bg-white rounded border">Next</button>
                  {isUcoreAggregated && (
                    <div className="ml-4 flex items-center gap-2">
                      <div className="text-sm text-gray-700">Remaining: <strong>{ucoreRemainingCredits}</strong> cr</div>
                      <button onClick={autoFillUcore} className="px-2 py-1 bg-gray-100 rounded border text-sm">Auto-fill</button>
                      <button onClick={onClose} className="px-2 py-1 bg-white rounded border text-sm">Done</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {catalogViewMode === 'carousel' ? (
              filteredCatalogResults[catalogIndex] ? (
                (() => {
                  const c = filteredCatalogResults[catalogIndex];
                  return (
                    <div key={`${c.id || 'noid'}-${catalogIndex}`} className="border rounded p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm font-semibold">{c.code || (c.prefix + ' ' + c.number)} — {c.title}</div>
                          <div className="text-xs text-gray-600">Credits: {c.credits || c.credits_phrase || '—'}</div>
                          {c._satisfiesUcore && (
                            <div className="mt-1 text-xs text-green-700 font-medium">Satisfies required UCORE</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Availability:</div>
                          <div className="text-sm">{(c.availability && c.availability.length) ? c.availability.slice(0,3).map(a=>`${a.campus || ''} ${a.term || ''} ${a.year || ''}`).join(', ') : 'Not listed in live schedule'}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-700">{c.description ? (c.description.length > 400 ? c.description.slice(0,400)+'…' : c.description) : 'No description available'}</div>
                      <div className="mt-3 flex items-center justify-end space-x-2">
                        <button
                          onClick={() => addCatalogCourseToPlan(c, activeYearTab, catalogModalTerm)}
                          className={`px-3 py-1 rounded ${c._disabledForFootnote ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                          disabled={!!c._disabledForFootnote}
                          title={c._disabledForFootnote ? 'Already selected for this footnote group' : `Add to ${years.find(y=>y.id===activeYearTab)?.name} ${catalogModalTerm}`}
                        >
                          Add to {years.find(y=>y.id===activeYearTab)?.name} {catalogModalTerm}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : null
            ) : (
              filteredCatalogResults.map((c, idx) => (
                <div key={`${c.id || 'noid'}-${idx}`} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-semibold">{c.code || (c.prefix + ' ' + c.number)} — {c.title}</div>
                      <div className="text-xs text-gray-600">Credits: {c.credits || c.credits_phrase || '—'}</div>
                      {c._satisfiesUcore && (
                        <div className="mt-1 text-xs text-green-700 font-medium">Satisfies required UCORE</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Availability:</div>
                      <div className="text-sm">{(c.availability && c.availability.length) ? c.availability.slice(0,3).map(a=>`${a.campus || ''} ${a.term || ''} ${a.year || ''}`).join(', ') : 'Not listed in live schedule'}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">{c.description ? (c.description.length > 400 ? c.description.slice(0,400)+'…' : c.description) : 'No description available'}</div>
                  <div className="mt-3 flex items-center justify-end space-x-2">
                    <button
                      onClick={() => addCatalogCourseToPlan(c, activeYearTab, catalogModalTerm)}
                      className={`px-3 py-1 rounded ${c._disabledForFootnote ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      disabled={!!c._disabledForFootnote}
                      title={c._disabledForFootnote ? 'Already selected for this footnote group' : `Add to ${years.find(y=>y.id===activeYearTab)?.name} ${catalogModalTerm}`}
                    >
                      Add to {years.find(y=>y.id===activeYearTab)?.name} {catalogModalTerm}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CatalogModal;
