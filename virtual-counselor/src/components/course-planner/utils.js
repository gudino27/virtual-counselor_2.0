// Helper utilities for course planner components

// Color helpers
export function hexToRgb(hex) {
  if (!hex) return null;
  const m = hex.match(/#([0-9a-fA-F]{6})/);
  const h = m ? `#${m[1]}` : hex;
  const cleaned = h.replace('#', '');
  if (cleaned.length !== 6) return null;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return { r, g, b };
}

export function getLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function getContrastingTextColor(cssColor) {
  if (!cssColor) return '#fff';
  const match = cssColor.match(/#([0-9a-fA-F]{6})/);
  const sample = match ? `#${match[1]}` : cssColor;
  const lum = getLuminance(sample);
  return lum > 0.5 ? '#000' : '#fff';
}

export function stripHtml(input) {
  if (!input || typeof input !== 'string') return input;
  return input.replace(/<[^>]+>/g, '').trim();
}

// Parse instructor data that may be a JSON array string, an array of objects,
// or a plain string. Returns a readable comma-separated name list or 'Staff'.
export function parseInstructors(rawSource) {
  if (!rawSource) return 'Staff';

  // Accept either the whole section/course object or the raw field
  let raw = rawSource;
  if (rawSource && typeof rawSource === 'object' && (rawSource.instructors || rawSource.instructor)) {
    raw = rawSource.instructors || rawSource.instructor;
  }

  if (!raw) return 'Staff';

  // If it's already an array of objects
  if (Array.isArray(raw)) {
    const names = raw.map(p => {
      if (!p) return '';
      if (typeof p === 'string') return stripHtml(p);
      const first = p.firstName || p.first || '';
      const last = p.lastName || p.last || p.lastInitial || '';
      return stripHtml(`${first} ${last}`.trim());
    }).filter(Boolean);
    return names.length ? names.join(', ') : 'Staff';
  }

  // If it's a string, attempt to parse JSON; else return cleaned string
  if (typeof raw === 'string') {
    const s = raw.trim();
    // Try JSON parse for strings that look like arrays/objects
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          const names = parsed.map(p => {
            if (!p) return '';
            if (typeof p === 'string') return stripHtml(p);
            const first = p.firstName || p.first || '';
            const last = p.lastName || p.last || p.lastInitial || '';
            return stripHtml(`${first} ${last}`.trim());
          }).filter(Boolean);
          return names.length ? names.join(', ') : 'Staff';
        }
        if (parsed && typeof parsed === 'object') {
          const first = parsed.firstName || parsed.first || '';
          const last = parsed.lastName || parsed.last || parsed.lastInitial || '';
          const n = stripHtml(`${first} ${last}`.trim());
          return n || 'Staff';
        }
      } catch (e) {
        // fall through to returning raw
      }
    }

    // Otherwise treat as plain name string (maybe comma-delimited list)
    return stripHtml(s) || 'Staff';
  }

  // Fallback
  return String(raw);
}

// Parse time range from dayTime string like "MWF 10:10-11:00" or "TR 9:00-10:15"
export function parseTimeRange(dayTime) {
  if (!dayTime || dayTime === 'AARGT' || dayTime.includes('ARR')) return null;

  // Match a days portion (letters, commas, spaces) followed by a time range like 9:10-10 or 12.05-14.45
  const m = dayTime.match(/^\s*([A-Za-z,\s]+?)\s*(\d{1,2}(?:[:\.]\d{1,2})?)-(\d{1,2}(?:[:\.]\d{1,2})?)\s*$/);
  if (!m) return null;

  const daysPart = m[1];
  const startPart = m[2];
  const endPart = m[3];

  const parsePart = (s) => {
    if (!s) return { h: 0, m: 0 };
    const sepMatch = s.match(/^(\d{1,2})[:\.](\d{1,2})$/);
    if (sepMatch) return { h: parseInt(sepMatch[1], 10), m: parseInt(sepMatch[2], 10) };
    // just hours
    const hh = parseInt(s, 10);
    return { h: hh, m: 0 };
  };

  const start = parsePart(startPart);
  const end = parsePart(endPart);
  const startMin = start.h * 60 + (start.m || 0);
  const endMin = end.h * 60 + (end.m || 0);

  // Normalize days: support comma-separated tokens like "TU,TH" or compact "MWF"
  let tokens = [];
  if (/[,\s]/.test(daysPart)) {
    tokens = daysPart.split(/[^A-Za-z]+/).filter(Boolean);
  } else if (daysPart.length <= 5) {
    // letters like MWF or TR
    tokens = daysPart.split('');
  } else {
    tokens = [daysPart];
  }

  const normalized = tokens.map(t => {
    const u = t.toUpperCase();
    if (u === 'M' || u.startsWith('MO')) return 'M';
    if (u === 'TU' || u === 'T' || u.startsWith('TU')) return 'T';
    if (u === 'W' || u.startsWith('W')) return 'W';
    if (u === 'TH' || u === 'R' || u.startsWith('TH')) return 'R';
    if (u === 'F' || u.startsWith('F')) return 'F';
    // Fallback: take first char
    return u.charAt(0);
  }).filter(Boolean);

  // Deduplicate while preserving order
  const seen = new Set();
  const days = [];
  for (const d of normalized) {
    if (!seen.has(d)) { seen.add(d); days.push(d); }
  }

  return { days, startMin, endMin };
}

// Format day time for display
export function formatDayTime(dayTime) {
  if (!dayTime) return 'TBD';
  if (dayTime === 'AARGT' || dayTime.includes('ARR')) return 'Async / Arranged';

  // Reuse parseTimeRange to extract parts where possible
  const parsed = parseTimeRange(dayTime);
  if (!parsed) return dayTime;

  const { days, startMin, endMin } = parsed;

  const formatMin = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const dayMap = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
  const dayNames = days.map(d => dayMap[d] || d).join('/');

  return `${dayNames} ${formatMin(startMin)} - ${formatMin(endMin)}`;
}

// Extract and format start/end dates for a course object.
export function getCourseDateRange(course) {
  if (!course) return { start: null, end: null };

  const tryFormat = (s) => {
    if (!s) return null;
    const cleaned = stripHtml(String(s)).trim();
    // If it looks like an ISO or contains a 4-digit year, try Date
    const parseable = (/\d{4}/.test(cleaned) || cleaned.includes('-') || /[A-Za-z]+\s+\d{1,2}/.test(cleaned));
    if (parseable) {
      const d = new Date(cleaned);
      if (!isNaN(d)) {
        try {
          return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
        } catch (e) {
          return d.toLocaleDateString();
        }
      }
    }

    // Try Date fallback
    const d2 = new Date(cleaned);
    if (!isNaN(d2)) {
      try {
        return d2.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
      } catch (e) {
        return d2.toLocaleDateString();
      }
    }

    // Otherwise return cleaned raw string
    return cleaned;
  };

  // Meetings array often contains start/end
  if (Array.isArray(course.meetings) && course.meetings.length > 0) {
    const m = course.meetings[0];
    const s = m.start || m.startDate || m.start_date || m.from || m.begin;
    const e = m.end || m.endDate || m.end_date || m.to || m.finish;
    const start = tryFormat(s);
    const end = tryFormat(e);
    if (start || end) return { start, end };
  }

  // Some feeds include top-level start/end fields
  const start = tryFormat(course.start || course.startDate || course.start_date || course.termStart || course.term_start);
  const end = tryFormat(course.end || course.endDate || course.end_date || course.termEnd || course.term_end);
  return { start, end };
}

// Format time range in minutes to display string
export function formatTimeRange(startMin, endMin) {
  const formatTime = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return `${formatTime(startMin)} - ${formatTime(endMin)}`;
}
