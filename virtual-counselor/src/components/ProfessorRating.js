import React, { useRef, useState } from 'react';
export default function ProfessorRating({ name }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const controllerRef = useRef(null);
  async function fetchRatings() {
    setLoading(true);
    setError(null);
    setTeacher(null);
    controllerRef.current = { cancelled: false };
    let mod = null;
    try {
      const m = await import('@domattheshack/rate-my-professors');
      mod = m && m.default ? m.default : m;
    } catch (e) {
    }
    if (!mod) {
      try {
        const m = await import('@domattheshack/rate-my-professors/dist/src/index.js');
        mod = m && m.default ? m.default : m;
      } catch (e) {
     }
    }
    if (!mod) {
      if (controllerRef.current && controllerRef.current.cancelled) return;
      setError('ratings-module-missing');
      setLoading(false);
      return;
    }
    try {
      // Locate WSU
      let schoolId = null;
      const searchSchool = mod.searchSchool || mod.searchSchools || mod.search;
      if (typeof searchSchool === 'function') {
        try {
          const schools = await searchSchool('Washington State University');
          if (Array.isArray(schools) && schools.length) {
            const found = schools.find(s => (s.name && s.name.toLowerCase().includes('washington state')) || (s.state && String(s.state).toUpperCase() === 'WA')) || schools[0];
            schoolId = found && (found.id || found.schoolId || found.legacyId) ? (found.id || found.schoolId || found.legacyId) : null;
          }
        } catch (e) {
        }
      }
      const searchTeacher = mod.searchTeacher || mod.search || mod.searchForTeacher || mod.searchTeachers;
      let results = null;
      if (typeof searchTeacher === 'function') {
        try {
          if (schoolId) {
            try {
              results = await searchTeacher(name, schoolId);
            } catch (e) {
              results = await searchTeacher(name);
            }
          } else {
            results = await searchTeacher(name);
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'production') console.debug('[ProfessorRating] searchTeacher error', e);
          results = null;
        }
      }
      let matched = null;
      if (Array.isArray(results) && results.length) {
        if (schoolId) matched = results.find(t => t && t.school && (t.school.id === schoolId || (t.school.id || '').toString() === schoolId));
        if (!matched) matched = results.find(t => t && t.school && t.school.name && t.school.name.toLowerCase().includes('washington state'));
        if (!matched) matched = results.find(t => t && t.school && (t.school.state === 'WA' || t.school.state === 'Wa' || t.school.state === 'wa'));
      }
      // Fallback by last name
      const normalize = (s) => (s || '').toString().replace(/[^a-z0-9]/gi, '').toLowerCase();
      const parts = (name || '').split(/\s+/).filter(Boolean);
      const lastName = parts.length ? parts[parts.length - 1] : name;
      if (!matched && typeof searchTeacher === 'function' && lastName) {
        try {
          const lastResults = await searchTeacher(lastName);
          if (process.env.NODE_ENV !== 'production') console.debug('[ProfessorRating] lastName search results', lastResults);
          if (Array.isArray(lastResults) && lastResults.length) {
            const bySchool = lastResults.find(t => t && t.school && t.school.name && /washington state|wsu/i.test(t.school.name));
            if (bySchool) matched = bySchool;
            else {
              const targetLast = normalize(lastName);
              const targetFirstInitial = parts[0] ? parts[0][0].toLowerCase() : null;
              matched = lastResults.find(t => {
                const candidateLast = normalize(t.lastName || t.last || (t.lastNameRaw || ''));
                const candidateFirst = (t.firstName || t.first || '').toString().trim();
                const firstInitial = candidateFirst ? candidateFirst[0].toLowerCase() : null;
                if (!candidateLast) return false;
                if (candidateLast === targetLast) {
                  if (!targetFirstInitial || !firstInitial || targetFirstInitial === firstInitial) return true;
                }
                const candFull = normalize(((t.firstName || t.first || '') + (t.lastName || t.last || '')).trim());
                const targetFull = normalize((parts.join('') || ''));
                return candFull && targetFull && candFull === targetFull;
              }) || null;
            }
          }
        } catch (e) {
        }
      }
      let details = null;
      const getTeacher = mod.getTeacher || mod.getTeacherById || mod.get;
      if (matched && (matched.id || matched.legacyId)) {
        const id = matched.id || matched.legacyId;
        if (typeof getTeacher === 'function') {
          try {
            details = await getTeacher(id);
          } catch (e) {
            details = matched;
          }
        } else {
          details = matched;
        }
      }
      if (controllerRef.current && controllerRef.current.cancelled) return;
      if (details && (details.avgRating !== undefined || details.avgDifficulty !== undefined || details.wouldTakeAgainPercent !== undefined)) {
        setTeacher(details);
      } else {
        setTeacher(null);
      }
    } catch (e) {
      setError('fetch-failed');
    } finally {
      if (controllerRef.current && controllerRef.current.cancelled) return;
      setLoading(false);
      setFetched(true);
    }
  }
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);
  const handleOpen = () => {
    setOpen(true);
    if (!fetched) {
      fetchRatings();
    }
  };
  const handleClose = () => {
    if (controllerRef.current) controllerRef.current.cancelled = true;
    setOpen(false);
  };
  const avg = teacher ? (teacher.avgRating ?? teacher.average ?? teacher.avg ?? teacher.rating) : undefined;
  const diff = teacher ? (teacher.avgDifficulty ?? teacher.averageDifficulty ?? teacher.difficulty) : undefined;
  const wouldTake = teacher ? (teacher.wouldTakeAgainPercent ?? teacher.wouldTakeAgain ?? teacher.wouldTake ?? teacher.would_take_again) : undefined;
  const legacyId = teacher ? (teacher.legacyId || teacher.id || null) : null;
  return (
    <div className="mt-2 text-sm text-gray-700">
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center px-2 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
      >
        View rating
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black opacity-30" onClick={handleClose} />
          <div className="relative bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-4 overflow-hidden ring-1 ring-black/5">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold">{name} — Rating</h3>
              <button aria-label="Close" onClick={handleClose} className="ml-2 text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="mt-3 text-sm text-gray-800">
              {loading && <div className="text-gray-600">Loading…</div>}
              {!loading && error && <div className="text-gray-600">No WSU ratings found</div>}
              {!loading && !error && !teacher && fetched && <div className="text-gray-600">No WSU ratings found</div>}
              {!loading && teacher ? (
                <div className="space-y-2">
                  {avg !== undefined ? <div>Rating: <span className="font-medium">{avg}/5</span></div> : null}
                  {diff !== undefined ? <div>Difficulty: <span className="font-medium">{diff}</span></div> : null}
                  {wouldTake !== undefined ? <div>Would take again: <span className="font-medium">{wouldTake.toFixed(0)}%</span></div> : null}
                  {legacyId ? (
                    <div className="pt-2">
                      <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.ratemyprofessors.com/professor/${legacyId}`}>
                        View on RateMyProfessors
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
