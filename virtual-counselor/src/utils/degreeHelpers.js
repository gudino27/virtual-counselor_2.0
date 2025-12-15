import { fetchDegrees } from "./api"; // If needed, or just remove if unused in helpers

// Regex helpers
export const isUcoreInquiry = (text) => {
  if (!text) return false;
  return /\[(BSCI|PSCI|SCI|CAPS|EQJS|DIVR)\]/i.test(text);
};

export const extractAllowedUcoreCategories = (note) => {
  if (!note) return [];
  const ucoreRegex = /\[(BSCI|PSCI|SCI|CAPS|EQJS|DIVR)\]/gi;
  const matches = note.match(ucoreRegex);
  if (matches) {
    return matches.map((m) => m.replace(/[\[\]]/g, "").toUpperCase());
  }
  return [];
};

// Prefetch UCORE courses cache
export const prefetchUcoreCourses = async (year, ucoreCourseCache) => {
  // Return if already cached
  if (Object.keys(ucoreCourseCache).length > 3) return ucoreCourseCache;
  
  // Implementation depends on API availability. 
  // Ideally this logic should be in a hook or component, but if it's pure logic:
  // It calls `fetchDegrees`.
  // Since it relies on `fetchDegrees` from `api.js`, we can import it.
  // But wait, `fetchDegrees` fetches degrees? 
  // Provide specific implementation logic if moving.
  // Original code:
  /*
  const prefetchUcoreCourses = async (year) => {
    if (Object.keys(ucoreCourseCache.current).length > 0) return;
    try {
      // We can't easily fetch "all ucore". 
      // We often just fetch by category when needed. 
      // So maybe this was a placeholder?
      // In the file it seems specific.
    } ...
  */
  // Let's postpone moving `prefetchUcoreCourses` until we see its complexity. 
  return ucoreCourseCache;
};

// Helper to parse prerequisites
export const parsePrereqs = (prereqStr) => {
  if (!prereqStr) return [];
  // Basic parser: looks for "Cpt S 121" or "MATH 171" patterns
  // Regex: ([A-Z][A-Za-z&\s]*)\s+(\d+)([A-Z]?)
  // This is a simplified regex.
  const regex = /([A-Z][A-Za-z&\s]{1,5})\s*(\d{3,4})([A-Z]?)/g;
  const matches = [];
  let match;
  while ((match = regex.exec(prereqStr)) !== null) {
      matches.push({
          prefix: match[1].trim().toUpperCase(),
          number: parseInt(match[2]),
          suffix: match[3] || ""
      });
  }
  return matches;
};
