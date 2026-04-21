import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
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
    try {
      // call server-side proxy
      const resp = await fetch('/api/rmp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'searchTeacher', name })
      });
      if (controllerRef.current && controllerRef.current.cancelled) return;
      if (!resp.ok) {
        // if proxy disabled, map to production-disabled error used by UI
        try {
          const errJson = await resp.json();
          if (errJson && errJson.error === 'rmp-proxy-disabled') {
            setError('ratings-disabled-in-production');
            return;
          }
        } catch (e) {}
        setError('rmp-proxy-failed');
        return;
      }

      const json = await resp.json();
      if (!json.success || !json.data || json.data.length === 0) {
        setError('no-rmp');
        return;
      }

      // pick best match
      const candidates = json.data;
      const parts = (name || '').split(/\s+/).filter(Boolean);
      const lastName = parts.length ? parts[parts.length - 1].toLowerCase() : null;
      let match = null;
      if (lastName) {
        match = candidates.find(c => c.lastName && c.lastName.toLowerCase() === lastName) || null;
      }
      if (!match) match = candidates[0];

      // If we have an id, fetch details
      if (match && match.legacyId) {
        const resp2 = await fetch('/api/rmp-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getTeacherById', id: match.legacyId })
        });
        if (resp2.ok) {
          const j2 = await resp2.json();
          if (j2 && j2.success && j2.data) {
            if (controllerRef.current && controllerRef.current.cancelled) return;
            setTeacher(j2.data);
            return;
          }
        }
        // fallback to match summary
        if (controllerRef.current && controllerRef.current.cancelled) return;
        setTeacher(match);
        return;
      }

      if (match) {
        if (controllerRef.current && controllerRef.current.cancelled) return;
        setTeacher(match);
        return;
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
  const profileLink = teacher ? (teacher.profileUrl || (legacyId ? `https://www.ratemyprofessors.com/professor/${legacyId}` : null)) : null;
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
              <button aria-label="Close" onClick={handleClose} className="ml-2 text-gray-500 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="mt-3 text-sm text-gray-800">
              {loading && <div className="text-gray-600">Loading…</div>}
              {!loading && error && (
                <div className="text-gray-600">
                  {error === 'ratings-disabled-in-production' ? (
                    <div>
                      Ratings are unavailable in production due to third-party policy restrictions.
                      {' '}
                      <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.ratemyprofessors.com/search/teachers?query=${encodeURIComponent(name)}`}>
                        View on RateMyProfessors
                      </a>
                    </div>
                  ) : (
                    <div>
                      No WSU ratings found.
                      {' '}
                      <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.ratemyprofessors.com/search/teachers?query=${encodeURIComponent(name)}`}>
                        Search on RateMyProfessors
                      </a>
                    </div>
                  )}
                </div>
              )}
              {!loading && !error && !teacher && fetched && (
                <div className="text-gray-600">
                  No WSU ratings found. <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.ratemyprofessors.com/search/teachers?query=${encodeURIComponent(name)}`}>Search on RateMyProfessors</a>
                </div>
              )}
              {!loading && teacher ? (
                <div className="space-y-2">
                  {avg !== undefined ? <div>Rating: <span className="font-medium">{avg}/5</span></div> : null}
                  {diff !== undefined ? <div>Difficulty: <span className="font-medium">{diff}</span></div> : null}
                  {wouldTake !== undefined ? <div>Would take again: <span className="font-medium">{wouldTake.toFixed(0)}%</span></div> : null}
                  {profileLink ? (
                    <div className="pt-2">
                      <a className="text-blue-600 hover:underline" target="_blank" rel="noreferrer" href={profileLink}>
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
