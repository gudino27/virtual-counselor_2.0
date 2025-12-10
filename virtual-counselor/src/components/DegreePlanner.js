import React, { useState, useEffect, useRef } from 'react';
import ClassGradeCalculator from './ClassGradeCalculator';
import ExcelJS from 'exceljs';
import { fetchDegrees, fetchDegreeRequirements, searchCourses } from '../utils/api';
import { detectElectiveKinds, buildElectiveFilter, computeUcoreSatisfaction } from '../utils/courseHelpers';
import { saveUcoreCache, loadUcoreCache, saveDegreePlan, loadDegreePlan, clearAllData } from '../utils/storage';

const GRADE_POINTS = {
  'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0, 'P': 0.0
};

function DegreePlanner() {
  // State management
  const [catalogYears, setCatalogYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [degrees, setDegrees] = useState([]);
  const [degreeSearch, setDegreeSearch] = useState('');
  const [showDegreeSuggestions, setShowDegreeSuggestions] = useState(false);
  const [selectedPrograms, setSelectedPrograms] = useState({ majors: [], minors: [], certificates: [] });
  const [years, setYears] = useState([
    { id: 1, name: 'Year 1' },
    { id: 2, name: 'Year 2' },
    { id: 3, name: 'Year 3' },
    { id: 4, name: 'Year 4' }
  ]);
  const [activeYearTab, setActiveYearTab] = useState(1);
  const [activeTermTab, setActiveTermTab] = useState('fall'); // 'fall', 'spring', 'summer'
  
  const [degreePlan, setDegreePlan] = useState({});
  const [showGradeScale, setShowGradeScale] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizeSpeed, setOptimizeSpeed] = useState('normal');
  const degreeInputRef = useRef(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showClassCalc, setShowClassCalc] = useState(false);
  const [classCalcCourseName, setClassCalcCourseName] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogModalYear, setCatalogModalYear] = useState('');
  const [catalogModalTerm, setCatalogModalTerm] = useState('fall');
  const [catalogTarget, setCatalogTarget] = useState(null); // { courseId, yearId, term }
  const [catalogIndex, setCatalogIndex] = useState(0);
  const [catalogViewMode, setCatalogViewMode] = useState('list'); // 'list' or 'carousel'
  const [catalogClientSearch, setCatalogClientSearch] = useState('');
  const [catalogUcoreSelected, setCatalogUcoreSelected] = useState(null);
  const [catalogTargetCourse, setCatalogTargetCourse] = useState(null);
  const [ucoreRemainingCredits, setUcoreRemainingCredits] = useState(0);
  const [catalogSelectedCodes, setCatalogSelectedCodes] = useState(new Set());

  // UCORE course cache for instant modal loading
  const [ucoreCourseCache, setUcoreCourseCache] = useState(null); // { [category]: Course[] }
  const [ucoreCacheLoaded, setUcoreCacheLoaded] = useState(false);
  const [allowedUcoreCategories, setAllowedUcoreCategories] = useState([]); // Categories from footnotes
  const [hydrated, setHydrated] = useState(false);

  // Initialize degree plan structure
  useEffect(() => {
    const data = loadDegreePlan();
    if (data) {
      setDegreePlan(data.plan || {});
      setYears(data.years || years);
      const programs = data.programs || {};
      setSelectedPrograms({
        majors: programs.majors || [],
        minors: programs.minors || [],
        certificates: programs.certificates || []
      });
      setHydrated(true);
    } else {
      initializeEmptyPlan();
      setHydrated(true);
    }
  }, []);

  const initializeEmptyPlan = () => {
    const plan = {};
    years.forEach(year => {
      plan[year.id] = {
        fall: { courses: [] },
        spring: { courses: [] },
        summer: { courses: [] }
      };
    });
    setDegreePlan(plan);
  };

  // Helper: Detect if course is UCORE Inquiry type
  const isUcoreInquiry = (course) => {
    const name = (course.name || course.note || '').toLowerCase();
    return name.includes('ucore') || name.includes('u-core') || name.includes('ucore inquiry');
  };

  // Helper: Extract allowed UCORE categories from course footnotes
  const extractAllowedUcoreCategories = (course) => {
    const footnotes = Array.isArray(course.footnotes)
      ? course.footnotes.join(' ')
      : (course.footnotes || '');
    // All UCORE categories except CAPS
    const allCategories = ['WRTG', 'QUAN', 'BSCI', 'PSCI', 'HUM', 'ARTS', 'DIVR', 'ROOT', 'COMM', 'EQJS', 'SSCI'];
    return allCategories.filter(cat => footnotes.toUpperCase().includes(cat));
  };

  // Pre-fetch all UCORE courses (except CAPS) for instant modal loading
  const prefetchUcoreCourses = async (year) => {
    if (ucoreCacheLoaded || !year) return;

    // Try to load from localStorage first
    const cachedData = loadUcoreCache(year);
    if (cachedData) {
      setUcoreCourseCache(cachedData);
      setUcoreCacheLoaded(true);
      return;
    }

    // All UCORE categories except CAPS (which is fixed/predetermined)
    const categories = ['WRTG', 'QUAN', 'BSCI', 'PSCI', 'HUM', 'ARTS', 'DIVR', 'ROOT', 'COMM', 'EQJS', 'SSCI'];
    const cache = {};

    try {
      // Fetch all categories in parallel
      const results = await Promise.all(
        categories.map(cat =>
          fetch(`/api/catalog/courses?year=${year}&ucore=${cat}&limit=200`)
            .then(r => r.ok ? r.json() : { courses: [] })
            .catch(() => ({ courses: [] }))
        )
      );

      categories.forEach((cat, i) => {
        cache[cat] = (results[i].courses || []).map(c => ({
          ...c,
          _ucoreMatches: [cat]
        }));
      });

      setUcoreCourseCache(cache);
      setUcoreCacheLoaded(true);

      // Save to localStorage for future sessions
      saveUcoreCache(cache, year);
    } catch (e) {
      // Silently fail - cache remains empty, will fallback to API calls
    }
  };

  // Auto-fill UCORE requirement by selecting top-credit courses from filtered results
  const autoFillUcore = () => {
    if (!catalogTarget || !catalogTargetCourse) return;
    let remaining = ucoreRemainingCredits || 0;
    if (remaining <= 0) return;

    const candidates = (filteredCatalogResults || []).filter(r => !r._disabledForFootnote).slice();
    // sort by credits desc
    candidates.sort((a, b) => (Number(b.credits) || 3) - (Number(a.credits) || 3));

    const picks = [];
    for (const c of candidates) {
      const cr = Number(c.credits) || 3;
      picks.push(c);
      remaining -= cr;
      if (remaining <= 0) break;
    }

    if (picks.length === 0) return;

    // Append picks to plan in a single update
    setDegreePlan(prev => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      const destYear = (catalogTarget && catalogTarget.yearId) || (catalogTargetCourse && catalogTargetCourse.yearId) || activeYearTab;
      const destTerm = (catalogTarget && catalogTarget.term) || 'fall';
      if (!next[destYear]) next[destYear] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
      for (const pc of picks) {
        next[destYear][destTerm].courses.push({
          id: Date.now() + Math.random(),
          name: `${pc.code || (pc.prefix + ' ' + pc.number)} - ${pc.title}`,
          credits: pc.credits || 3,
          grade: '',
          status: 'planned',
          prefix: pc.prefix || (pc.code ? pc.code.split(' ')[0] : ''),
          number: pc.number || (pc.code ? pc.code.split(' ')[1] : ''),
          footnotes: pc.footnotes || [],
          attributes: pc.attributes || [],
          description: pc.description || '',
          catalogCourseId: pc.id
        });
      }
      return next;
    });

    // mark selected in UI and clear modal
    setCatalogResults(prev => (prev || []).map(r => {
      const rc = String(r.code || `${r.prefix || ''} ${r.number || ''}`).toUpperCase().trim();
      if (picks.find(p => String(p.code || `${p.prefix || ''} ${p.number || ''}`).toUpperCase().trim() === rc)) {
        return { ...r, _disabledForFootnote: true, _selectedForUcore: true };
      }
      return r;
    }));

    setCatalogTarget(null);
    setCatalogTargetCourse(null);
    setShowCatalogModal(false);
    setCatalogSelectedCodes(new Set());
    setUcoreRemainingCredits(0);
    setAllowedUcoreCategories([]);
    setCatalogUcoreSelected(null);
  };

  // Save to persistent storage using storage helpers
  useEffect(() => {
    try {
      if (!hydrated) {
        console.debug('[DegreePlanner] skipping save until hydrated');
        return;
      }

      saveDegreePlan({ plan: degreePlan, years, programs: selectedPrograms });
      console.debug('[DegreePlanner] saved degree plan', Object.keys(degreePlan).length || 0, (selectedPrograms && ((selectedPrograms.majors||[]).length + (selectedPrograms.minors||[]).length + (selectedPrograms.certificates||[]).length)));
    } catch (e) {
      console.error('Failed saving degree plan:', e);
    }
  }, [degreePlan, years, selectedPrograms]);

  // Load degrees on mount and when year changes
  useEffect(() => {
    loadDegrees();
  }, []);
  
  useEffect(() => {
    if (selectedYear) {
      loadDegrees();
    }
  }, [selectedYear]);

  const loadDegrees = async () => {
    try {
      const data = await fetchDegrees(selectedYear);
      setDegrees(data.degrees || []);
      
      // Set catalog years and default year if not set
      if (data.years && data.years.length > 0) {
        setCatalogYears(data.years);
        if (!selectedYear) {
          setSelectedYear(data.years[0]);
        }
      }
    } catch (error) {
      console.error('Error loading degrees:', error);
    }
  };

  // Pre-fetch UCORE courses when year is available (silent background load)
  useEffect(() => {
    if (selectedYear && !ucoreCacheLoaded) {
      prefetchUcoreCourses(selectedYear);
    }
  }, [selectedYear, ucoreCacheLoaded]);

  // Calculate statistics
  const calculateGPA = () => {
    let totalPoints = 0;
    let totalCredits = 0;
    
    Object.values(degreePlan).forEach(year => {
      ['fall', 'spring', 'summer'].forEach(term => {
        year[term]?.courses.forEach(course => {
          if (course.status === 'taken' && course.grade && course.credits > 0) {
            const points = (GRADE_POINTS[course.grade] || 0) * course.credits;
            totalPoints += points;
            totalCredits += course.credits;
          }
        });
      });
    });
    
    return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';
  };

  const calculateCreditsAchieved = () => {
    let credits = 0;
    Object.values(degreePlan).forEach(year => {
      ['fall', 'spring', 'summer'].forEach(term => {
        year[term]?.courses.forEach(course => {
          if (course.status === 'taken' && course.grade && ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'P'].includes(course.grade)) {
            credits += course.credits || 0;
          }
        });
      });
    });
    return credits;
  };

  const calculateCreditsPlanned = () => {
    let credits = 0;
    Object.values(degreePlan).forEach(year => {
      ['fall', 'spring', 'summer'].forEach(term => {
        year[term]?.courses.forEach(course => {
          if (course.name && course.credits > 0) {
            credits += course.credits;
          }
        });
      });
    });
    return credits;
  };

  const calculateCreditsRequired = () => {
    // Compute required credits from selected program metadata when available.
    // Each selected program entry may be { name, data } where data may include credits/totalHours.
    let total = 0;
    const majors = selectedPrograms.majors || [];
    const minors = selectedPrograms.minors || [];
    const certs = selectedPrograms.certificates || [];

    const creditsFromProgram = (p) => {
      if (!p) return 0;
      if (typeof p === 'number') return p;
      if (p.data) {
        return p.data.totalHours || p.data.credits || p.data.creditsRequired || 0;
      }
      return 0;
    };

    majors.forEach(m => { total += creditsFromProgram(m) || 120; });
    minors.forEach(m => { total += creditsFromProgram(m) || 18; });
    certs.forEach(c => { total += creditsFromProgram(c) || 15; });

    // If nothing selected, don't default to 120 — return 0 so UI shows 'Not Started'
    if (majors.length + minors.length + certs.length === 0) return 0;

    // Adjust for simple overlap estimate when multiple majors
    if (majors.length > 1) total -= 40 * (majors.length - 1);

    return total;
  };

  const gpa = calculateGPA();
  const creditsAchieved = calculateCreditsAchieved();
  const creditsPlanned = calculateCreditsPlanned();
  const creditsRequired = calculateCreditsRequired();

  // Progress state: when no programs selected or creditsRequired === 0, show Not Started.
  let progress = 'Not Started';
  const programCount = (selectedPrograms.majors?.length || 0) + (selectedPrograms.minors?.length || 0) + (selectedPrograms.certificates?.length || 0);
  if (programCount === 0 || creditsRequired === 0) {
    progress = 'Not Started';
  } else if (creditsAchieved >= creditsRequired) {
    progress = 'Completed';
  } else {
    progress = 'In Progress';
  }

  // Year management
  const handleAddYear = () => {
    const newId = years.length + 1;
    const newYears = [...years, { id: newId, name: `Year ${newId}` }];
    setYears(newYears);
    
    setDegreePlan(prev => ({
      ...prev,
      [newId]: {
        fall: { courses: [] },
        spring: { courses: [] },
        summer: { courses: [] }
      }
    }));
  };

  const handleDeleteYear = (yearId) => {
    if (years.length <= 1) return;
    
    const newYears = years
      .filter(y => y.id !== yearId)
      .map((y, idx) => ({ id: idx + 1, name: `Year ${idx + 1}` }));
    
    setYears(newYears);
    
    const newPlan = {};
    newYears.forEach((year, idx) => {
      const oldYearData = Object.values(degreePlan)[idx];
      if (oldYearData) {
        newPlan[year.id] = oldYearData;
      }
    });
    setDegreePlan(newPlan);
    
    // Update active tab if needed
    if (activeYearTab === yearId) {
      setActiveYearTab(1);
    } else if (activeYearTab > yearId) {
      setActiveYearTab(activeYearTab - 1);
    }
  };

  // Add program
  const handleAddProgram = async (type, name) => {
    try {
      const data = await fetchDegreeRequirements(name);
      console.log('fetchDegreeRequirements result for', name, data);
      
      setSelectedPrograms(prev => ({
        ...prev,
        [type]: [...(prev[type] || []), { name, data }]
      }));

      // Auto-populate courses
      if (data.schedule && Array.isArray(data.schedule)) {
        const termMap = { 1: 'fall', 2: 'spring', 3: 'summer' };

        setDegreePlan(prev => {
          // start from latest state; if empty, initialize a blank plan from `years`
          const base = (prev && Object.keys(prev).length)
            ? JSON.parse(JSON.stringify(prev))
            : (() => {
                const p = {};
                years.forEach(y => {
                  p[y.id] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
                });
                return p;
              })();

          // Clear existing empty slots in the target year before populating
          const newPlan = JSON.parse(JSON.stringify(prev));
          data.schedule.forEach(semester => {
             const yearId = parseInt(semester.year, 10);
             const term = termMap[parseInt(semester.term, 10)];
             
             if (newPlan[yearId] && newPlan[yearId][term]) {
                // remove any course with empty name (placeholder)
                newPlan[yearId][term].courses = newPlan[yearId][term].courses.filter(c => c.name && c.name.trim() !== '');
                // Also update the base reference so subsequent additions use the clean list
                if (base[yearId] && base[yearId][term]) {
                   base[yearId][term].courses = newPlan[yearId][term].courses;
                }
             }
          });

          // Now populate
          data.schedule.forEach(semester => {
            const yearId = parseInt(semester.year, 10);
            const term = termMap[parseInt(semester.term, 10)];            
            if (!base[yearId]) {
              base[yearId] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
            }

            if (base[yearId] && base[yearId][term]) {
              semester.courses.forEach(course => {
                if (course.isNonCredit) return;
                base[yearId][term].courses.push({
                  id: Date.now() + Math.random(),
                  name: course.raw || course.label || '',
                  credits: course.credits || 0,
                  grade: '',
                  status: 'planned',
                  footnotes: course.footnotes || [],
                  prefix: course.prefix,
                  number: course.number,
                  attributes: course.attributes || []
                });
              });
            }
          });

          // Log counts per year/term before returning state
          try {
            const counts = Object.keys(base).map(y => ({
              year: y,
              fall: (base[y].fall?.courses || []).length,
              spring: (base[y].spring?.courses || []).length,
              summer: (base[y].summer?.courses || []).length
            }));
            console.log('newPlan populated counts', counts);
          } catch (e) {
            console.log('Error computing newPlan counts', e);
          }

          return base;
        });
      }
    } catch (error) {
      console.error('Error adding program:', error);
      alert('Error loading program requirements');
    }
  };

  // Optimize schedule
  const handleOptimize = async () => {
    // Build list of unscheduled courses
    const unscheduled = [];
    const taken = new Set();
    Object.entries(degreePlan).forEach(([yearId, year]) => {
      ['fall', 'spring', 'summer'].forEach(term => {
        year[term].courses.forEach(course => {
          if (course.name) {
            // normalize key to 'PREFIX ###' when possible
            const normPrefix = course.prefix ? String(course.prefix).toUpperCase().replace(/\s+/g, '') : '';
            const normNumber = course.number ? String(course.number) : '';
            const key = (normPrefix && normNumber) ? `${normPrefix} ${normNumber}` : String(course.name || '').toUpperCase();
            if (course.status === 'taken') taken.add(key);
            else unscheduled.push({ ...course, key, originalYear: parseInt(yearId, 10), originalTerm: term });
          }
        });
      });
    });

    // Load catalog prereqs for selected catalog year (if available)
    const catalogMap = {};
    try {
      if (selectedYear) {
        const resp = await fetch(`/api/catalog/courses?year=${encodeURIComponent(selectedYear)}`);
        if (resp.ok) {
          const j = await resp.json();
          (j.courses || []).forEach(r => {
            if (r.code) catalogMap[String(r.code).toUpperCase()] = r;
          });
        }
      }
    } catch (e) {
      console.warn('Could not load catalog courses for optimizer', e);
    }

    // Helper: parse prerequisite course codes from strings (footnotes, attributes, raw)
    // Returns array of groups; each group is an array of alternative codes (OR semantics).
    const parsePrereqs = (course) => {
      const sources = [];
      if (course.footnotes) sources.push(Array.isArray(course.footnotes) ? course.footnotes.join(' ') : String(course.footnotes));
      if (course.attributes) sources.push(Array.isArray(course.attributes) ? course.attributes.join(' ') : String(course.attributes));
      if (course.raw) sources.push(String(course.raw));
      if (course.name) sources.push(String(course.name));

      const text = sources.join(' ');
      if (!text) return [];

      // Match either PREFIX NUMBER or standalone NUMBER; capture positions for grouping
      const tokenRe = /([A-Za-z]{2,6})\s*\.?\s*(\d{3})|\b(\d{3})\b/g;
      const matches = [];
      let mm;
      while ((mm = tokenRe.exec(text)) !== null) {
        if (mm[1] && mm[2]) {
          const pref = mm[1].toUpperCase().replace(/\s+/g, '');
          const num = mm[2];
          matches.push({ code: `${pref} ${num}`, start: mm.index, end: tokenRe.lastIndex, pref, num });
        } else if (mm[3]) {
          const num = mm[3];
          matches.push({ code: `${num}`, start: mm.index, end: tokenRe.lastIndex, pref: null, num });
        }
      }

      if (matches.length === 0) return [];

      // Inherit prefix for standalone numbers from nearest previous match when appropriate
      for (let i = 0; i < matches.length; i++) {
        if (!matches[i].pref) {
          for (let j = i - 1; j >= 0; j--) {
            const between = text.substring(matches[j].end, matches[i].start).toLowerCase();
            if (between.length > 80) break;
            if (/\bor\b|[,;/]|\band\b/.test(between)) {
              matches[i].pref = matches[j].pref;
              matches[i].code = `${matches[i].pref} ${matches[i].num}`;
              break;
            }
          }
        }
      }

      // Group adjacent matches into OR-groups when the connector contains 'or' or '/'
      const groups = [];
      let current = [matches[0].code.replace(/\s+/g, ' ').toUpperCase()];
      for (let i = 1; i < matches.length; i++) {
        const between = text.substring(matches[i - 1].end, matches[i].start).toLowerCase();
        const hasOr = /\bor\b|\//.test(between);
        if (hasOr) {
          current.push(matches[i].code.replace(/\s+/g, ' ').toUpperCase());
        } else {
          groups.push(Array.from(new Set(current)));
          current = [matches[i].code.replace(/\s+/g, ' ').toUpperCase()];
        }
      }
      if (current.length) groups.push(Array.from(new Set(current)));
      return groups;
    };

    // Helper: detect offered terms (if provided) or heuristic (prefer fall/spring)
    const allowedInTerm = (course, termName) => {
      // If explicit offeredTerms provided (['fall','spring','summer']), respect it
      if (course.offeredTerms && Array.isArray(course.offeredTerms)) {
        return course.offeredTerms.includes(termName);
      }
      // If course has an attribute/footnote indicating Summer only or not offered in summer
      const attrs = (course.attributes || []).join(' ').toLowerCase();
      const foot = (Array.isArray(course.footnotes) ? course.footnotes.join(' ') : (course.footnotes || '')).toLowerCase();
      if (attrs.includes('not summer') || foot.includes('not offered summer') || attrs.includes('fall/spring')) return termName !== 'summer';
      if (attrs.includes('summer only') || foot.includes('summer only')) return termName === 'summer';
      // Default: allow term but prefer non-summer. We'll deprioritize summer by scheduling others first.
      return true;
    };

    // Build lookup map for quick access
    const courseMap = {};
    unscheduled.forEach(c => {
      courseMap[c.key] = c;
    });

    // Build prereq graph and prerequisites list for each course
    // Each entry is an array of groups; each group is an array of alternative codes (OR semantics)
    const prereqs = {};
    unscheduled.forEach(c => {
      let groups = parsePrereqs(c) || [];
      const normKey = String(c.key || '').toUpperCase();
      // If catalog has metadata for this course, apply offered terms and use its prereqs as fallback
      if (catalogMap[normKey]) {
        const meta = catalogMap[normKey];
        // apply offered terms if missing on the course object
        if ((!c.offeredTerms || !c.offeredTerms.length) && meta.offered_terms && meta.offered_terms.length) {
          c.offeredTerms = meta.offered_terms;
        }
        // if parser didn't find anything, use catalog prereqs
        if ((groups.length === 0 || groups.every(g => g.length === 0)) && meta.prerequisite_codes && meta.prerequisite_codes.length) {
          groups = meta.prerequisite_codes.map(pc => [String(pc).toUpperCase()]);
        }
      }

      // Canonicalize groups: uppercase, single-spaced, remove empties
      const cleanedGroups = groups.map(g => (Array.isArray(g) ? g : [g]).map(code => String(code || '').replace(/\s+/g, ' ').toUpperCase()).filter(Boolean)).filter(g => g.length > 0);
      prereqs[c.key] = cleanedGroups;
    });

    // Helper: compute credits scheduled before a given slot (yearId, term)
    const creditsBeforeSlot = (slot) => {
      // start with already achieved credits
      let credits = creditsAchieved || 0;
      for (const s of termSequence) {
        if (s.yearId === slot.yearId && s.term === slot.term) break;
        const termCourses = newPlan[s.yearId][s.term].courses || [];
        credits += termCourses.reduce((sum, cc) => sum + (cc.credits || 0), 0);
      }
      return credits;
    };

    // Helper: derive student level from credits
    const studentLevelFromCredits = (credits) => {
      if (credits >= 90) return 'senior';
      if (credits >= 60) return 'junior';
      if (credits >= 30) return 'sophomore';
      return 'freshman';
    };

    // Scheduling parameters
    const creditLimits = { accelerated: 23, normal: 18, relaxed: 12 };
    const maxCredits = creditLimits[optimizeSpeed] || 18;

    // Prepare empty newPlan
    const newPlan = {};
    years.forEach(y => {
      newPlan[y.id] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
    });

    // Maintain set of scheduled courses
    const scheduled = new Set([...taken]);

    // Function to check if prereqs satisfied (all prereq groups are satisfied) for a given slot
    const prereqsSatisfied = (course, slot) => {
      const groups = prereqs[course.key] || [];
      // Special handling for alternative course groups: if the course has `alternatives` defined,
      // be conservative: only allow moving earlier if NONE of the alternatives have explicit prereqs.
      if (course.alternatives && Array.isArray(course.alternatives) && course.alternatives.length > 0) {
        for (const alt of course.alternatives) {
          const altKey = String(alt).trim();
          const altPrereqs = prereqs[altKey] || [];
          if (altPrereqs.length > 0) return false;
        }
        return true;
      }

      // If no prereqs groups, allow
      if (groups.length === 0) return true;

      // Detect level requirement (junior/senior) from course meta/text
      const detectLevelRequirement = (courseObj) => {
        try {
          const meta = catalogMap[String(courseObj.key || '').toUpperCase()] || {};
          const combined = [];
          if (courseObj.footnotes) combined.push(Array.isArray(courseObj.footnotes) ? courseObj.footnotes.join(' ') : String(courseObj.footnotes));
          if (courseObj.attributes) combined.push(Array.isArray(courseObj.attributes) ? courseObj.attributes.join(' ') : String(courseObj.attributes));
          if (courseObj.raw) combined.push(String(courseObj.raw));
          if (meta && meta.notes) combined.push(String(meta.notes));
          const txt = combined.join(' ').toLowerCase();
          if (/\bjunior\b/.test(txt)) return 'junior';
          if (/\bsenior\b/.test(txt)) return 'senior';
          return null;
        } catch (e) {
          return null;
        }
      };

      // credits the student would have before this slot
      const creditsBefore = slot ? creditsBeforeSlot(slot) : (creditsAchieved || 0);
      const levelBefore = studentLevelFromCredits(creditsBefore);

      const allowsConcurrent = (courseObj) => {
        try {
          if (courseObj.concurrent === true || courseObj.allowConcurrent === true) return true;
          const meta = catalogMap[String(courseObj.key || '').toUpperCase()];
          if (meta && (meta.concurrent === true || meta.allow_concurrent === true)) return true;
          const combined = [];
          if (courseObj.footnotes) combined.push(Array.isArray(courseObj.footnotes) ? courseObj.footnotes.join(' ') : String(courseObj.footnotes));
          if (courseObj.attributes) combined.push(Array.isArray(courseObj.attributes) ? courseObj.attributes.join(' ') : String(courseObj.attributes));
          if (courseObj.raw) combined.push(String(courseObj.raw));
          const txt = combined.join(' ').toLowerCase();
          if (/concurrent|may be taken concurrently|concurrent enrollment/.test(txt)) return true;
        } catch (e) {}
        return false;
      };

      // Check level requirement
      const levelReq = detectLevelRequirement(course);
      if (levelReq) {
        const order = { freshman: 0, sophomore: 1, junior: 2, senior: 3 };
        if (order[levelBefore] < order[levelReq]) return false;
      }

      // For every prereq group, at least one member must be scheduled/taken or allowed concurrent
      for (const group of groups) {
        let satisfied = false;
        for (const code of group) {
          if (scheduled.has(code)) { satisfied = true; break; }
        }
        if (satisfied) continue;
        // not scheduled — allow only if concurrent allowed for this course
        if (allowsConcurrent(course)) {
          // If concurrent allowed, mark this group satisfied
          continue;
        }
        return false;
      }

      return true;
    };

    // Flatten terms in chronological order
    const termSequence = [];
    years.forEach(y => {
      termSequence.push({ yearId: y.id, term: 'fall' });
      termSequence.push({ yearId: y.id, term: 'spring' });
      termSequence.push({ yearId: y.id, term: 'summer' });
    });

    // Greedy placement: iterate through terms and try to place courses whose prereqs are satisfied and allowed in that term.
    // We will prefer non-summer terms first by ordering candidates.
    const remaining = new Set(unscheduled.map(c => c.key));

    termSequence.forEach(slot => {
      if (remaining.size === 0) return;
      const termCourses = newPlan[slot.yearId][slot.term].courses;
      let currentCredits = termCourses.reduce((s, c) => s + (c.credits || 0), 0);

      // Build candidate list: unscheduled courses allowed in this term and prereqs satisfied
      const candidates = Array.from(remaining).map(k => courseMap[k]).filter(c => {
        if (!c) return false;
        if (!allowedInTerm(c, slot.term)) return false;
        if (!prereqsSatisfied(c, slot)) return false;
        return true;
      });

      // Sort candidates: prefer lower originalYear/originalTerm first, and prefer non-summer offerings
      candidates.sort((a, b) => {
        if (a.originalYear !== b.originalYear) return a.originalYear - b.originalYear;
        const order = { fall: 1, spring: 2, summer: 3 };
        if (order[a.originalTerm] !== order[b.originalTerm]) return order[a.originalTerm] - order[b.originalTerm];
        // deprioritize courses that appear to be summer-only when we're not in summer
        const aSummerOnly = (a.offeredTerms && a.offeredTerms.length === 1 && a.offeredTerms[0] === 'summer') ? 1 : 0;
        const bSummerOnly = (b.offeredTerms && b.offeredTerms.length === 1 && b.offeredTerms[0] === 'summer') ? 1 : 0;
        return aSummerOnly - bSummerOnly;
      });

      for (const c of candidates) {
        if (currentCredits + (c.credits || 0) <= maxCredits) {
          termCourses.push(c);
          scheduled.add(c.key);
          remaining.delete(c.key);
          currentCredits += (c.credits || 0);
        }
      }
    });

    // If anything remains (due to prereqs cycles or term restrictions), append them as fallback preserving original ordering
    if (remaining.size > 0) {
      const fallback = unscheduled.filter(c => remaining.has(c.key));
      fallback.sort((a, b) => (a.originalYear - b.originalYear) || (a.originalTerm.localeCompare(b.originalTerm)));
      let idx = 0;
      const slots = termSequence;
      for (const c of fallback) {
        // Find next slot with capacity
        while (idx < slots.length) {
          const slot = slots[idx];
          const termCourses = newPlan[slot.yearId][slot.term].courses;
          const currentCredits = termCourses.reduce((s, cc) => s + (cc.credits || 0), 0);
          if (allowedInTerm(c, slot.term) && currentCredits + (c.credits || 0) <= maxCredits) {
            termCourses.push(c);
            remaining.delete(c.key);
            break;
          }
          idx++;
        }
        if (idx >= slots.length) {
          // no slot left; push into last term
          const last = slots[slots.length - 1];
          newPlan[last.yearId][last.term].courses.push(c);
        }
      }
    }

    setDegreePlan(newPlan);
    setShowOptimizeModal(false);
  };

  // --- Catalog course picker (modal) ---
  const openCatalogModal = (initialYear) => {
    setCatalogModalYear(initialYear || selectedYear || (catalogYears[0] || ''));
    setCatalogModalTerm('fall');
    setCatalogSearch('');
    setCatalogResults([]);
    setCatalogTarget(null);
    setShowCatalogModal(true);
  };

  const openCatalogForCourse = (courseId, yearId, termName) => {
    const target = { courseId, yearId, term: termName };
    setCatalogTarget(target);
    setCatalogModalYear(selectedYear || (catalogYears[0] || ''));
    setCatalogModalTerm(termName || 'fall');
    setCatalogSearch('');
    setCatalogResults([]);
    setShowCatalogModal(true);

    // Immediately load candidates from the target course's footnotes (if available)
    // Find the course in the current degreePlan
    try {
      const findCourseById = (id) => {
        for (const y of Object.keys(degreePlan || {})) {
          for (const t of ['fall', 'spring', 'summer']) {
            const list = degreePlan[y]?.[t]?.courses || [];
            for (const c of list) if (c.id === id) return c;
          }
        }
        return null;
      };
      const courseObj = findCourseById(courseId);
      if (courseObj) {
        // persist the target course object for modal logic and multi-add flows
        setCatalogTargetCourse(courseObj);
        setCatalogSelectedCodes(new Set());
        // derive required credits: prefer explicit credits on the placeholder; otherwise
        // parse footnotes like "Must complete 4 of these 5 UCORE designations" and assume 3 credits each
        const deriveRequiredCredits = (co) => {
          if (!co) return 0;
          if (co.credits && Number(co.credits) > 0) return Number(co.credits);
          const text = (Array.isArray(co.footnotes) ? co.footnotes.join(' ') : (co.footnotes || '')) || (co.name || '');
          const m = String(text).match(/must complete\s*(\d+)\s*of/i);
          if (m && m[1]) return Number(m[1]) * 3;
          return 0;
        };
        const reqCredits = deriveRequiredCredits(courseObj);
        setUcoreRemainingCredits(reqCredits);

        // Check if this is a UCORE Inquiry course and use cached data if available
        if (isUcoreInquiry(courseObj) && ucoreCacheLoaded && ucoreCourseCache) {
          // Get allowed categories from this course's footnotes
          const allowedCats = extractAllowedUcoreCategories(courseObj);
          setAllowedUcoreCategories(allowedCats);

          // Filter cached courses to only include allowed categories
          const relevantCourses = allowedCats.flatMap(cat =>
            (ucoreCourseCache[cat] || []).map(c => ({ ...c, _ucoreMatches: [cat] }))
          );

          // Deduplicate by course code, merge _ucoreMatches
          const courseMap = new Map();
          for (const c of relevantCourses) {
            const key = c.code || `${c.prefix} ${c.number}`;
            if (courseMap.has(key)) {
              const existing = courseMap.get(key);
              existing._ucoreMatches = [...new Set([...existing._ucoreMatches, ...c._ucoreMatches])];
            } else {
              courseMap.set(key, { ...c });
            }
          }

          setCatalogResults(Array.from(courseMap.values()));
          return; // Skip API fetch - use cached data
        }

        // Clear allowed categories for non-UCORE courses
        setAllowedUcoreCategories([]);

        // If the course looks like an elective placeholder, try to detect elective kinds
        const electiveKinds = detectElectiveKinds(courseObj.name || courseObj.note || courseObj.footnotes || '');
        if (electiveKinds && electiveKinds.length > 0) {
          // Build a simple filter from the first detected elective kind
          const ef = buildElectiveFilter(electiveKinds[0], Object.values(degreePlan || {}).flatMap(y => ['fall','spring','summer'].flatMap(t => (y[t]?.courses || []).map(c => c))));
          fetchCatalogCandidates('', { fromElective: true, electiveFilter: ef, targetCourse: courseObj });
        } else if (Array.isArray(courseObj.footnotes) ? courseObj.footnotes.length > 0 : !!courseObj.footnotes) {
          // fetch candidates derived from footnotes
          fetchCatalogCandidates('', { fromFootnotes: true, targetCourse: courseObj });
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchCatalogCandidates = async (q, opts = {}) => {
    try {
      // Helper: extract prefix+number codes from text
      // Parse a footnote string containing mixed entries like:
      // "CHEM 105 [PSCI], 106, PHYSICS 201 [PSCI] and 211, BIOLOGY 106 [BSCI], 107 [BSCI]"
      // This function returns an ordered array of token objects: { prefix, number, code, attrs }
      // where attrs is an array of bracketed attributes (e.g., ['PSCI']). It inherits prefixes
      // for bare numbers and handles 'and' lists and slashes.
      const extractCodesFromText = (text) => {
        if (!text) return [];

        // Only consider the first sentence (up to the first period) — many footnotes list the
        // allowed courses in the first sentence. Then split that sentence on commas to get items.
        const firstSentence = String(text).split('.')[0] || String(text);
        const parts = String(firstSentence).split(',').map(p => p.trim()).filter(Boolean);
        const tokens = [];
        let lastPrefix = null;

        for (const part of parts) {
          // capture bracketed attributes in this part (e.g., [PSCI], [BSCI])
          const attrs = [];
          let partNoBrackets = part.replace(/\[([^\]]+)\]/g, (m, g1) => {
            if (g1) attrs.push(String(g1).trim());
            return ' ';
          }).trim();

          // split sub-items by 'and' or '/'
          const subparts = partNoBrackets.split(/\band\b|\//i).map(s => s.trim()).filter(Boolean);
          for (const sp of subparts) {
            // match prefix+number
            const prefNum = sp.match(/([A-Za-z]{2,12})\s*(\d{3}\w?)/i);
            if (prefNum) {
              const pref = prefNum[1].toUpperCase().replace(/\s+/g, '');
              const num = prefNum[2].toUpperCase();
              lastPrefix = pref;
              tokens.push({ prefix: pref, number: num, code: `${pref} ${num}`, attrs: Array.from(attrs) });
              continue;
            }

            // match bare number and inherit lastPrefix
            const numOnly = sp.match(/^(\d{3}\w?)$/i);
            if (numOnly && lastPrefix) {
              const num = numOnly[1].toUpperCase();
              tokens.push({ prefix: lastPrefix, number: num, code: `${lastPrefix} ${num}`, attrs: Array.from(attrs) });
              continue;
            }

            // fallback: try find any prefix+number inside
            const any = sp.match(/([A-Za-z]{2,12})\s*(\d{3}\w?)/i);
            if (any) {
              const pref = any[1].toUpperCase().replace(/\s+/g, '');
              const num = any[2].toUpperCase();
              lastPrefix = pref;
              tokens.push({ prefix: pref, number: num, code: `${pref} ${num}`, attrs: Array.from(attrs) });
              continue;
            }
            // otherwise ignore
          }
        }

        // dedupe while preserving order by code
        const seen = new Set();
        const out = [];
        for (const t of tokens) {
          const key = String(t.code || '').toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(t);
          }
        }
        return out;
      };

      // If requested to load from an elective filter, build params accordingly
      if (opts.fromElective && opts.electiveFilter) {
        const ef = opts.electiveFilter;

        // Handle COURSELIST kind - fetch specific allowed courses
        if (ef.kind === 'COURSELIST' && ef.allowedCourses && ef.allowedCourses.length > 0) {
          const alreadySelected = new Set();
          for (const y of Object.keys(degreePlan || {})) {
            for (const t of ['fall', 'spring', 'summer']) {
              const list = degreePlan[y]?.[t]?.courses || [];
              for (const c of list) {
                if (!c) continue;
                if (c.prefix && c.number) {
                  alreadySelected.add(`${String(c.prefix).toUpperCase()} ${String(c.number)}`);
                }
              }
            }
          }

          // Fetch each allowed course from catalog
          const results = [];
          const seenCodes = new Set();
          for (const allowed of ef.allowedCourses) {
            // Handle level range (e.g., "300-400-level CPT S courses")
            if (allowed.levelRange) {
              try {
                const params = new URLSearchParams();
                if (catalogModalYear) params.append('year', catalogModalYear);
                params.append('prefix', allowed.prefix.replace(/\s+/g, ' '));
                params.append('limit', 100);
                const resp = await fetch(`/api/catalog/courses?${params.toString()}`);
                if (resp.ok) {
                  const data = await resp.json();
                  for (const course of (data.courses || [])) {
                    const num = parseInt(course.number, 10);
                    if (num >= allowed.levelRange.min && num < allowed.levelRange.max + 100) {
                      const code = `${course.prefix} ${course.number}`.toUpperCase();
                      if (!seenCodes.has(code)) {
                        seenCodes.add(code);
                        results.push({ ...course, _disabledForFootnote: alreadySelected.has(code) });
                      }
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            } else {
              // Specific course code
              try {
                const params = new URLSearchParams();
                if (catalogModalYear) params.append('year', catalogModalYear);
                params.append('prefix', allowed.prefix.replace(/\s+/g, ' '));
                params.append('search', allowed.number);
                params.append('limit', 10);
                const resp = await fetch(`/api/catalog/courses?${params.toString()}`);
                if (resp.ok) {
                  const data = await resp.json();
                  for (const course of (data.courses || [])) {
                    const courseNum = String(course.number).toUpperCase();
                    if (courseNum === allowed.number || courseNum.startsWith(allowed.number)) {
                      const code = `${course.prefix} ${course.number}`.toUpperCase();
                      if (!seenCodes.has(code)) {
                        seenCodes.add(code);
                        results.push({ ...course, _disabledForFootnote: alreadySelected.has(code) });
                      }
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            }
          }

          setCatalogResults(results);
          return;
        }

        const paramsE = new URLSearchParams();
        if (catalogModalYear) paramsE.append('year', catalogModalYear);
        // build query by kind
        if (ef.kind === 'UCORE' && ef.ucoreCategory) {
          paramsE.append('ucore', ef.ucoreCategory);
        } else if (ef.kind === 'PREFIX' && ef.prefixes && ef.prefixes.length > 0) {
          // request by prefix; backend will return courses for that prefix
          paramsE.append('prefix', ef.prefixes[0]);
        } else {
          // general: no extra params; leave search blank to return many
        }
        paramsE.append('limit', opts.limit || 200);
        try {
          const respE = await fetch(`/api/catalog/courses?${paramsE.toString()}`);
            if (respE.ok) {
            const je = await respE.json();

            // Compute already selected codes to disable them
            const targetCourse = opts.targetCourse;
            const targetFootnotes = targetCourse ? new Set(Array.isArray(targetCourse.footnotes) ? targetCourse.footnotes.map(String) : [String(targetCourse.footnotes || '')]) : new Set();
            const alreadySelected = new Set();
            for (const y of Object.keys(degreePlan || {})) {
              for (const t of ['fall', 'spring', 'summer']) {
                const list = degreePlan[y]?.[t]?.courses || [];
                for (const c of list) {
                  if (!c) continue;
                  const fns = Array.isArray(c.footnotes) ? c.footnotes : (c.footnotes ? [c.footnotes] : []);
                  for (const fn of fns) {
                    if (fn && targetFootnotes.has(fn)) {
                      if (c.prefix && c.number) alreadySelected.add(`${String(c.prefix).toUpperCase()} ${String(c.number)}`);
                    }
                  }
                  // Also check if the course itself matches
                  if (c.prefix && c.number) {
                    const cCode = `${String(c.prefix).toUpperCase()} ${String(c.number)}`;
                    if (c.catalogCourseId) alreadySelected.add(cCode);
                  }
                }
              }
            }

            let resultsE = (je.courses || []).filter(c => {
              const code = String(c.code || `${c.prefix || ''} ${c.number || ''}`).toUpperCase();
              return !(ef.excludeCodes || []).includes(code);
            }).map(c => {
              const code = String(c.code || `${c.prefix || ''} ${c.number || ''}`).toUpperCase().trim();
              // mark whether this course satisfies the requested UCORE category (if applicable)
              let satisfies = false;
              try {
                if (ef.kind === 'UCORE' && ef.ucoreCategory) {
                  const need = String(ef.ucoreCategory || '').toUpperCase();
                  const cU = String(c.ucore || '').toUpperCase();
                  const cAttrs = (Array.isArray(c.attributes) ? c.attributes : []).map(a => String(a).toUpperCase());
                  const cFoot = String(c.footnotes || '').toUpperCase();
                  if ((cU && cU.includes(need)) || cAttrs.includes(need) || (cFoot && cFoot.includes(need))) satisfies = true;
                }
              } catch (e) {}
              // Only disable if already selected, not by default
              return { ...c, _disabledForFootnote: alreadySelected.has(code), _satisfiesUcore: satisfies };
            });

            // If UCORE kind, compute satisfaction for UI (store to state for later UI use)
            if (ef.kind === 'UCORE') {
              try {
                const required = [ef.ucoreCategory].filter(Boolean);
                const planCourses = Object.values(degreePlan || {}).flatMap(y => ['fall','spring','summer'].flatMap(t => (y[t]?.courses || []).map(c => c)));
                const sat = computeUcoreSatisfaction(required, planCourses);
                // attach summary to first result for simple access in modal rendering
                if (resultsE.length > 0) resultsE[0]._ucoreSummary = sat;
              } catch (e) {}
            }

            setCatalogResults(resultsE);
            return;
          }
        } catch (e) {
          // continue to fallbacks
        }
      }

      // If requested to load from footnotes, use provided targetCourse or catalogTarget to collect footnote codes
      if (opts.fromFootnotes && opts.targetCourse) {
        const targetCourse = opts.targetCourse;
        const footnotesText = Array.isArray(targetCourse.footnotes) ? targetCourse.footnotes.join(' ') : (targetCourse.footnotes || '');
        const codes = extractCodesFromText(footnotesText);
        // Debug log: show what was extracted from footnotes
        try {
          console.debug('[CatalogPicker] footnotesText:', footnotesText);
          console.debug('[CatalogPicker] extracted tokens:', codes);
        } catch (e) {}
        if (codes.length === 0) {
          // Try to detect UCORE category lists in the footnote text (e.g., "Must complete 4 of these 5 UCORE designations: ARTS, DIVR, EQJS, HUM, SSCI.")
          const firstSentence = String(footnotesText || '').split('.')[0] || String(footnotesText || '');
          const ucoreListMatch = (firstSentence || footnotesText || '').match(/(?:U-?CORE|UCORE|U Core|designations)[:\s-]*([^\.]+)/i);
          if (ucoreListMatch && ucoreListMatch[1]) {
            const raw = ucoreListMatch[1];
            const cats = Array.from(new Set(raw.split(/[,;\/]| and |\band\b/gi).map(s => String(s || '').trim().toUpperCase()).filter(Boolean)));
            if (cats.length > 0) {
              // Aggregate results for each UCORE category
              const agg = [];
              const seenCodes = new Set();
              for (const catRaw of cats) {
                const cat = String(catRaw || '').toUpperCase().trim();
                try {
                  const p = new URLSearchParams();
                  if (catalogModalYear) p.append('year', catalogModalYear);
                  p.append('ucore', cat);
                  p.append('limit', 200);
                  const r = await fetch(`/api/catalog/courses?${p.toString()}`);
                  if (!r.ok) continue;
                  const jj = await r.json();
                  for (const rc of (jj.courses || [])) {
                    const rcCode = String(rc.code || `${rc.prefix || ''} ${rc.number || ''}`).toUpperCase().trim();
                    if (!seenCodes.has(rcCode)) {
                      seenCodes.add(rcCode);
                      agg.push({ ...rc, _ucoreMatches: [cat] });
                    } else {
                      // attach additional match info to existing agg entry
                      const existing = agg.find(a => (String(a.code || `${a.prefix || ''} ${a.number || ''}`).toUpperCase().trim() === rcCode));
                      if (existing) {
                        existing._ucoreMatches = Array.from(new Set([...(existing._ucoreMatches || []).map(x=>String(x).toUpperCase().trim()), cat]));
                      }
                    }
                  }
                } catch (e) {
                  // ignore per-category fetch errors
                }
              }

              // Compute alreadySelected codes for targetCourse's footnote group (reuse earlier logic)
              const targetFootnotes = new Set(Array.isArray(targetCourse.footnotes) ? targetCourse.footnotes.map(String) : [String(targetCourse.footnotes || '')]);
              const alreadySelected = new Set();
              for (const y of Object.keys(degreePlan || {})) {
                for (const t of ['fall', 'spring', 'summer']) {
                  const list = degreePlan[y]?.[t]?.courses || [];
                  for (const c of list) {
                    if (!c) continue;
                    const fns = Array.isArray(c.footnotes) ? c.footnotes : (c.footnotes ? [c.footnotes] : []);
                    for (const fn of fns) {
                      if (fn && targetFootnotes.has(fn)) {
                        if (c.prefix && c.number) alreadySelected.add(`${String(c.prefix).toUpperCase()} ${String(c.number)}`);
                        if (c.catalogCourseId && c.name) {
                          const mc = extractCodesFromText(c.name || '');
                          mc.forEach(m => { if (m && m.code) alreadySelected.add(String(m.code).toUpperCase()); });
                        }
                      }
                    }
                  }
                }
              }

              // Annotate agg results with disabled flag and UCORE satisfaction
              const planCourses = Object.values(degreePlan || {}).flatMap(y => ['fall','spring','summer'].flatMap(t => (y[t]?.courses || []).map(c => c)));
              const sat = computeUcoreSatisfaction(cats, planCourses);
              const final = agg.map(r => {
                const code = String(r.code || `${r.prefix || ''} ${r.number || ''}`).toUpperCase().trim();
                const matches = Array.isArray(r._ucoreMatches) ? r._ucoreMatches.map(m => String(m).toUpperCase().trim()) : [];
                return { ...r, _disabledForFootnote: alreadySelected.has(code), _ucoreMatches: matches, _satisfiesUcore: matches.some(m => cats.map(x=>String(x).toUpperCase().trim()).includes(m)) };
              });
              if (final.length > 0) final[0]._ucoreSummary = sat;
              setCatalogResults(final);
              return;
            }
          }

          setCatalogResults([]);
          return;
        }

        // Query the catalog for each extracted token and perform stricter filtering
        const resultsArr = [];
        for (const token of codes) {
          const tokenPref = (token && token.prefix) ? token.prefix.toUpperCase() : null;
          const tokenNum = (token && token.number) ? token.number.toUpperCase() : null;
          const tokenCode = (token && token.code) ? token.code.toUpperCase() : null;
          const tokenAttrs = (token && token.attrs) ? token.attrs.map(a => String(a).toUpperCase()) : [];

          // Prefix alias map (local) — used for matching when footnote uses long names (PHYSICS)
          const PREFIX_ALIASES_LOCAL = {
            'PHYSICS': ['PHYS','PHYSICS'],
            'PHYS': ['PHYS','PHYSICS'],
            'BIOLOGY': ['BIOL','BIOLOGY','BIO'],
            'BIOL': ['BIOL','BIOLOGY','BIO'],
            'CHEMISTRY': ['CHEM','CHEMISTRY'],
            'CHEM': ['CHEM','CHEMISTRY']
          };
          const aliases = tokenPref ? (PREFIX_ALIASES_LOCAL[tokenPref] || [tokenPref]) : [];
          const canonicalPref = aliases.length > 0 ? aliases[0] : tokenPref;

          const params = new URLSearchParams();
          if (catalogModalYear) params.append('year', catalogModalYear);
          // Prefer exact prefix + number lookup (avoid relying on ucore).
          // Map long-form prefixes to canonical catalog prefixes when possible
          // (e.g., PHYSICS -> PHYS) so the server `prefix` param matches stored rows.
          const PREFIX_ALIASES = {
            'PHYSICS': ['PHYS','PHYSICS'],
            'PHYS': ['PHYS','PHYSICS'],
            'BIOLOGY': ['BIOL','BIOLOGY','BIO'],
            'BIOL': ['BIOL','BIOLOGY','BIO'],
            'CHEMISTRY': ['CHEM','CHEMISTRY'],
            'CHEM': ['CHEM','CHEMISTRY']
          };
          if (tokenPref && tokenNum) {
            const canonical = (PREFIX_ALIASES[tokenPref] && PREFIX_ALIASES[tokenPref][0]) ? PREFIX_ALIASES[tokenPref][0] : tokenPref;
            params.append('prefix', canonical);
            params.append('search', tokenNum);
          } else if (tokenNum) {
            params.append('search', tokenNum);
          } else if (tokenCode) {
            params.append('search', tokenCode);
          }
          // Note: do NOT include tokenAttrs/ucore by default here — we want prefix+number
          // to succeed even when ucore is missing. The existing fallback will try
          // number+ucore later if attributes are present.
          params.append('limit', opts.limit || 25);

          try {
            const resp = await fetch(`/api/catalog/courses?${params.toString()}`);
            if (resp.ok) {
              const j = await resp.json();
              // Debug: show server response size for this token
              try { console.debug('[CatalogPicker] token query', { tokenCode, tokenPref, tokenNum, tokenAttrs, params: params.toString(), serverCount: (j.courses||[]).length }); } catch(e){}
              let matched = [];
              if (j.courses && j.courses.length > 0) {
                // Strict filtering: require matching course number and either a fuzzy prefix match
                // or an attribute match (e.g., PSCI/BSCI) when available.
                for (const rc of j.courses) {
                  const rcNum = String(rc.number || '').toUpperCase();
                  const rcPref = String(rc.prefix || '').toUpperCase();
                  const rcCode = String(rc.code || `${rcPref} ${rcNum}`).toUpperCase();
                  const rcUcore = String(rc.ucore || '').toUpperCase();
                  const rcAttrs = Array.isArray(rc.attributes) ? rc.attributes.map(a => String(a).toUpperCase()).join(' ') : String(rc.attributes || '').toUpperCase();
                  const rcFoot = String(rc.footnotes || '').toUpperCase();

                  const numberMatches = tokenNum ? (rcNum === tokenNum || (rcNum && rcNum.startsWith(tokenNum))) : true;

                  // fuzzy prefix: compare first 4 letters when exact doesn't match
                  const fuzzy = (a, b) => {
                    if (!a || !b) return false;
                    const la = a.substring(0, 4);
                    const lb = b.substring(0, 4);
                    return la === lb;
                  };

                  const prefixMatches = tokenPref ? (aliases.includes(rcPref)) : true;

                  // attribute match: if token includes an attr like PSCI, accept if rc.ucore/attributes/footnotes include it
                  let attrMatches = false;
                  if (tokenAttrs && tokenAttrs.length > 0) {
                    for (const ta of tokenAttrs) {
                      if ((rcUcore && rcUcore.includes(ta)) || (rcAttrs && rcAttrs.includes(ta)) || (rcFoot && rcFoot.includes(ta))) {
                        attrMatches = true; break;
                      }
                    }
                  }

                  // Accept when number matches and (prefix matches OR attrMatches)
                  if (numberMatches && (prefixMatches || attrMatches)) {
                    matched.push(rc);
                  }
                }
              }

              // If no matched results, try fallback queries: number + ucore, then number-only
              if (matched.length === 0 && tokenNum) {
                // try number + ucore (if attribute present)
                if (tokenAttrs && tokenAttrs.length > 0) {
                  const fb = new URLSearchParams();
                  if (catalogModalYear) fb.append('year', catalogModalYear);
                  fb.append('search', tokenNum);
                  fb.append('ucore', tokenAttrs[0]);
                  fb.append('limit', opts.limit || 10);
                  try {
                    const r2 = await fetch(`/api/catalog/courses?${fb.toString()}`);
                    if (r2.ok) {
                      const j2 = await r2.json();
                      try { console.debug('[CatalogPicker] fallback number+ucore serverCount', tokenNum, tokenAttrs, (j2.courses||[]).length); } catch(e){}
                      if (j2.courses && j2.courses.length > 0) {
                        for (const rc of j2.courses) {
                          const rcNum = String(rc.number || '').toUpperCase();
                          if (rcNum === tokenNum || rcNum.startsWith(tokenNum)) matched.push(rc);
                        }
                      }
                    }
                  } catch (e) {}
                }

               
              }

              // If still no matches, try exact code match using prefix+number (avoid relying on ucore)
                  if (matched.length === 0 && tokenPref && tokenNum) {
                try {
                  const codeParams = new URLSearchParams();
                  if (catalogModalYear) codeParams.append('year', catalogModalYear);
                  // server supports exact `code` lookup (e.g., "PHYS 202")
                      // use canonical prefix (e.g., PHYS) for exact code lookup
                      codeParams.append('code', `${canonicalPref} ${tokenNum}`);
                  codeParams.append('limit', opts.limit || 25);
                  const r3 = await fetch(`/api/catalog/courses?${codeParams.toString()}`);
                  if (r3.ok) {
                    const j3 = await r3.json();
                    try { console.debug('[CatalogPicker] exact code fallback', { code: `${tokenPref} ${tokenNum}`, serverCount: (j3.courses||[]).length }); } catch(e){}
                    if (j3.courses && j3.courses.length > 0) {
                      // push exact matches
                      for (const rc of j3.courses) matched.push(rc);
                    }
                  }
                } catch (e) {}
              }

              // Deduplicate matched by code
              let uniq = [];
              const seenCodes = new Set();
              for (const rc of matched) {
                const rcCode = String(rc.code || `${rc.prefix || ''} ${rc.number || ''}`).toUpperCase();
                if (!seenCodes.has(rcCode)) {
                  seenCodes.add(rcCode);
                  uniq.push(rc);
                }
              }

              // If this was a fallback (we searched number-only) and tokenPref exists, narrow by stricter rules
              if (uniq.length > 0 && tokenNum && tokenPref && (!tokenPref || tokenPref.length > 0)) {
                // Prefix alias whitelist to map long names to catalog abbreviations
                const PREFIX_ALIASES = {
                  'PHYSICS': ['PHYS', 'PHYSICS'],
                  'PHYS': ['PHYS', 'PHYSICS'],
                  'BIOLOGY': ['BIOL', 'BIOLOGY', 'BIO'],
                  'BIOL': ['BIOL', 'BIOLOGY', 'BIO'],
                  'CHEMISTRY': ['CHEM', 'CHEMISTRY'],
                  'CHEM': ['CHEM', 'CHEMISTRY']
                };

                const aliases = PREFIX_ALIASES[tokenPref] || [tokenPref];

                // When the number-only fallback returns many hits, apply a strict filter that
                // prefers exact alias/prefix matches or attribute (ucore) matches. If strict
                // filtering yields nothing, fall back to the earlier looser rules.
                const STRICT_THRESHOLD = 1;
                if (uniq.length > STRICT_THRESHOLD) {
                  const strictFiltered = uniq.filter(rc => {
                    const rcPref = String(rc.prefix || '').toUpperCase();
                    const rcCode = String(rc.code || '').toUpperCase();
                    const rcUcore = String(rc.ucore || '').toUpperCase();
                    const rcFoot = String(rc.footnotes || '').toUpperCase();

                    // Exact alias/prefix match
                    for (const a of aliases) {
                      if (rcPref === a) return true;
                      if (rcCode.startsWith(a + ' ')) return true;
                    }

                    // Attribute/ucore match when token provided attributes
                    if (tokenAttrs && tokenAttrs.length > 0) {
                      for (const ta of tokenAttrs) {
                        if ((rcUcore && rcUcore.includes(ta)) || (rcFoot && rcFoot.includes(ta)) || (String(rc.attributes || '').toUpperCase().includes(ta))) return true;
                      }
                    }

                    return false;
                  });

                  if (strictFiltered.length > 0) {
                    uniq = strictFiltered;
                  } 
                  // else {
                  //   // Looser fallback: keep the previous fuzzy/alias approach (first-3 letters or attr match)
                  //   const looseFiltered = uniq.filter(rc => {
                  //     const rcPref = String(rc.prefix || '').toUpperCase();
                  //     const rcCode = String(rc.code || '').toUpperCase();
                  //     // exact prefix or code contains alias
                  //     for (const a of aliases) {
                  //       if (rcPref === a) return true;
                  //       if (rcCode.includes(a)) return true;
                  //     }
                  //     // fuzzy: first 3 letters
                  //     for (const a of aliases) {
                  //       if (rcPref.substring(0,3) === a.substring(0,3)) return true;
                  //     }
                  //     const rcUcore = String(rc.ucore || '').toUpperCase();
                  //     if (tokenAttrs && tokenAttrs.length > 0) {
                  //       for (const ta of tokenAttrs) {
                  //         if ((rcUcore && rcUcore.includes(ta)) || (String(rc.footnotes || '').toUpperCase().includes(ta)) || (String(rc.attributes || '').toUpperCase().includes(ta))) return true;
                  //       }
                  //     }
                  //     return false;
                  //   });
                  //   if (looseFiltered.length > 0) uniq = looseFiltered;
                  // }
                }
              }

              // Append per-token uniq results to resultsArr (preserves token grouping/order)
              for (const r of uniq) resultsArr.push(r);
            }
          } catch (e) {
            // ignore per-token fetch errors
          }
        }

        // Prevent selecting the same course twice for the same footnote group: collect selected catalog codes for other slots that share any footnote with targetCourse
        const targetFootnotes = new Set(Array.isArray(targetCourse.footnotes) ? targetCourse.footnotes.map(String) : [String(targetCourse.footnotes || '')]);
        const alreadySelected = new Set();
        for (const y of Object.keys(degreePlan || {})) {
          for (const t of ['fall', 'spring', 'summer']) {
            const list = degreePlan[y]?.[t]?.courses || [];
            for (const c of list) {
              if (!c) continue;
              const fns = Array.isArray(c.footnotes) ? c.footnotes : (c.footnotes ? [c.footnotes] : []);
              for (const fn of fns) {
                if (fn && targetFootnotes.has(fn)) {
                  if (c.prefix && c.number) alreadySelected.add(`${String(c.prefix).toUpperCase()} ${String(c.number)}`);
                  if (c.catalogCourseId && c.name) {
                    const mc = extractCodesFromText(c.name || '');
                    // mc is array of token objects; add their canonical code strings
                    mc.forEach(m => {
                      if (m && m.code) alreadySelected.add(String(m.code).toUpperCase());
                    });
                  }
                }
              }
            }
          }
        }

        // Debug log: show raw candidate codes found for tokens
        try {
          const candidateCodes = resultsArr.map(r => String(r.code || ((r.prefix && r.number) ? `${r.prefix} ${r.number}` : '')).toUpperCase());
          console.debug('[CatalogPicker] candidateCodes (pre-unique/filtered):', candidateCodes);
          console.debug('[CatalogPicker] alreadySelected codes:', Array.from(alreadySelected));
        } catch (e) {}

        // Annotate results with disabled flag when code already selected
        const results = resultsArr.map(c => {
          const code = String(c.code || ((c.prefix && c.number) ? `${c.prefix} ${c.number}` : '')).toUpperCase();
          return { ...c, _disabledForFootnote: alreadySelected.has(code) };
        });
        // Debug log: final results being shown in modal
        try {
          console.debug('[CatalogPicker] final results count:', results.length);
          console.debug('[CatalogPicker] final results codes:', results.map(r => String(r.code || ((r.prefix && r.number) ? `${r.prefix} ${r.number}` : '')).toUpperCase()));
        } catch (e) {}
        setCatalogResults(results);
        return;
      }

      // Fallback: normal search behavior
      const params = new URLSearchParams();
      if (catalogModalYear) params.append('year', catalogModalYear);
      if (q) params.append('search', q);
      if (opts.prefix) params.append('prefix', opts.prefix);
      if (opts.ucore) params.append('ucore', opts.ucore);
      params.append('limit', opts.limit || 100);

      const resp = await fetch(`/api/catalog/courses?${params.toString()}`);
      if (!resp.ok) throw new Error('Catalog request failed');
      const j = await resp.json();
      setCatalogResults(j.courses || []);
    } catch (e) {
      console.error('Catalog search error', e);
      setCatalogResults([]);
    }
  };

  const addCatalogCourseToPlan = (course, targetYearId, targetTerm) => {
    // If catalogTarget is set, replace that specific course slot; otherwise append new course.
    setDegreePlan(prev => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      const destYear = (catalogTarget && catalogTarget.yearId) || targetYearId;
      const destTerm = (catalogTarget && catalogTarget.term) || targetTerm;
      if (!next[destYear]) next[destYear] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };

      if (catalogTarget && catalogTarget.courseId) {
        // Replace matching courseId in the target slot
        next[destYear][destTerm].courses = next[destYear][destTerm].courses.map(c => {
          if (c.id === catalogTarget.courseId) {
            return {
              ...c,
              name: `${course.code || (course.prefix + ' ' + course.number)} - ${course.title}`,
              credits: course.credits || 0,
              grade: '',
              status: 'planned',
              prefix: course.prefix || (course.code ? course.code.split(' ')[0] : ''),
              number: course.number || (course.code ? course.code.split(' ')[1] : ''),
              footnotes: course.footnotes || [],
              attributes: course.attributes || [],
              description: course.description || '',
              catalogCourseId: course.id
            };
          }
          return c;
        });
      } else {
        next[destYear][destTerm].courses.push({
          id: Date.now() + Math.random(),
          name: `${course.code || (course.prefix + ' ' + course.number)} - ${course.title}`,
          credits: course.credits || 0,
          grade: '',
          status: 'planned',
          prefix: course.prefix || (course.code ? course.code.split(' ')[0] : ''),
          number: course.number || (course.code ? course.code.split(' ')[1] : ''),
          footnotes: course.footnotes || [],
          attributes: course.attributes || [],
          description: course.description || '',
          catalogCourseId: course.id
        });
      }

      return next;
    });
    // If we're filling a UCORE aggregated placeholder, allow multi-add until required credits are satisfied
    const code = String(course.code || `${course.prefix || ''} ${course.number || ''}`).toUpperCase().trim();
    const creditsAdded = Number(course.credits) || 3;
    if (catalogTargetCourse && ucoreRemainingCredits > 0) {
      // mark this code as selected
      setCatalogSelectedCodes(prev => {
        const next = new Set(prev || []);
        next.add(code);
        return next;
      });

      // decrement remaining credits and decide whether to close modal
      let shouldClose = false;
      setUcoreRemainingCredits(prev => {
        const next = Math.max(0, (prev || 0) - creditsAdded);
        if (next === 0) shouldClose = true;
        return next;
      });

      // disable this course in the results UI so user can't add again
      setCatalogResults(prev => (prev || []).map(r => {
        const rCode = String(r.code || `${r.prefix || ''} ${r.number || ''}`).toUpperCase().trim();
        if (rCode === code) return { ...r, _disabledForFootnote: true, _selectedForUcore: true };
        return r;
      }));

      // If requirement satisfied, clear target and close modal
      if (shouldClose) {
        setCatalogTarget(null);
        setCatalogTargetCourse(null);
        setShowCatalogModal(false);
        setCatalogSelectedCodes(new Set());
        setUcoreRemainingCredits(0);
        setAllowedUcoreCategories([]);
        setCatalogUcoreSelected(null);
      }

      return;
    }

    // Otherwise, clear target and close modal
    setCatalogTarget(null);
    setShowCatalogModal(false);
    setAllowedUcoreCategories([]);
    setCatalogUcoreSelected(null);
  };

  // Keep carousel index in range when results change
  useEffect(() => {
    if (!catalogResults || catalogResults.length === 0) {
      setCatalogIndex(0);
    } else if (catalogIndex >= catalogResults.length) {
      setCatalogIndex(0);
    }
  }, [catalogResults]);

  // Export to Excel (Matches user provided WSU Degree Plan image)
  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetName = 'WSU Degree Plan';
    const worksheet = workbook.addWorksheet(sheetName);
    workbook.calcProperties.fullCalcOnLoad = true;
    const terms = ['Fall', 'Spring', 'Summer'];

    // Define columns relative widths manually to avoid Row 1 conflicts
    // Columns A-D (Fall), E-H (Spring), I-L (Summer)
    // Indexes: 1,2,3,4 | 5,6,7,8 | 9,10,11,12
    const setColWidths = (startCol) => {
        worksheet.getColumn(startCol).width = 45;   // Course
        worksheet.getColumn(startCol+1).width = 14; // Credits
        worksheet.getColumn(startCol+2).width = 15; // Grade
        worksheet.getColumn(startCol+3).width = 10; // Points
    };
    setColWidths(1); // Fall
    setColWidths(5); // Spring
    setColWidths(9); // Summer

    // Metadata columns (M=13, N=14, O=15)
    worksheet.getColumn(13).width = 25;
    worksheet.getColumn(14).width = 25;
    worksheet.getColumn(15).width = 15;

    const getHeaderFill = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF981E32' } }); // WSU Crimson
    const getHeaderFont = () => ({ bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 12 });
    const getTermHeaderFill = () => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }); // Light Grey matches image
    const getTermHeaderFont = () => ({ bold: true, name: 'Calibri', size: 11 });
    const getBorderStyle = () => ({ style: 'thin', color: { argb: 'FF000000' } }); // Standard black thin border
    
    // Helper: convert column number to Excel letter
    const colToLetter = (col) => {
      let temp = '';
      let letter = '';
      while (col > 0) {
        temp = (col - 1) % 26;
        letter = String.fromCharCode(65 + temp) + letter;
        col = Math.floor((col - 1) / 26);
      }
      return letter;
    };

    // --- METADATA SIDEBAR SETUP ---
    const metaColStart = 13;
    const setMeta = (row, label, val = '', isTotal = false) => {
      const cellLabel = worksheet.getCell(row, metaColStart);
      cellLabel.value = label;
      cellLabel.font = { bold: true, name: 'Calibri' };
      if (isTotal) {
           cellLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      }

      if (val !== undefined && val !== null) {
        const cellVal = worksheet.getCell(row, metaColStart + 1);
        cellVal.value = val;
        cellVal.font = { name: 'Calibri' };
        if (isTotal) {
             cellVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        }
      }
    };
    
    // Sidebar: "WSU DEGREE PLAN" Header
    const sidebarTitle = worksheet.getCell(1, metaColStart);
    sidebarTitle.value = 'WSU DEGREE PLAN';
    sidebarTitle.font = { bold: true, color: { argb: 'FF981E32' }, size: 14, name: 'Calibri' };
    
    // Sidebar: Student Info
    setMeta(3, 'STUDENT INFORMATION');
    worksheet.getCell(3, metaColStart).font = { bold: true, underline: true };
    
    setMeta(4, 'Degree:', selectedPrograms?.majors?.[0]?.name || selectedPrograms?.minors?.[0]?.name || 'Custom');
    setMeta(5, 'Catalog Year:', selectedYear || '');
    setMeta(6, 'Required Credits:', calculateCreditsRequired() || 120);
    
    setMeta(8, 'Minors:');
    const minorNames = (selectedPrograms?.minors || []).map(m => m.name).join(', ') || 'None selected';
    setMeta(9, minorNames);
    
    setMeta(11, 'Exported:', new Date().toLocaleString());

    setMeta(13, 'DEGREE PLAN SUMMARY');
    worksheet.getCell(13, metaColStart).font = { bold: true, color: { argb: 'FF981E32' } };

    // Credit Summary Table
    // Credit Summary Table
    setMeta(15, 'Credit Summary', 'Credits', true); // Header row styled grey

    // FORMULAS:
    // Completed: Sum of credits where grade is NOT empty
    const formulaCompleted = 'SUMIFS(B:B,C:C,"<>")+SUMIFS(F:F,G:G,"<>")+SUMIFS(J:J,K:K,"<>")';
    // Planned: Sum of credits where grade IS empty but Course Name is NOT empty
    const formulaPlanned = 'SUMIFS(B:B,C:C,"",A:A,"<>")+SUMIFS(F:F,G:G,"",E:E,"<>")+SUMIFS(J:J,K:K,"",I:I,"<>")';
    
    // N16 = Completed, N17 = Planned
    const cellCompleted = worksheet.getCell(16, metaColStart + 1);
    cellCompleted.value = { formula: formulaCompleted };
    cellCompleted.font = { name: 'Calibri' };

    const cellPlanned = worksheet.getCell(17, metaColStart + 1);
    cellPlanned.value = { formula: formulaPlanned };
    cellPlanned.font = { name: 'Calibri' };

    const cellTotal = worksheet.getCell(18, metaColStart + 1);
    cellTotal.value = { formula: 'SUM(N16:N17)' }; // Total
    cellTotal.font = { name: 'Calibri' };

    const cellReq = worksheet.getCell(19, metaColStart + 1);
    cellReq.value = 120; // Fixed req
    cellReq.font = { name: 'Calibri' };

    setMeta(16, 'Completed Credits');
    setMeta(17, 'Planned Credits');
    setMeta(18, 'Total Credits'); 
    setMeta(19, 'Credits to Graduate');

    // GPA: Total Points / Completed Credits (Avoid DIV/0)
    const formulaGPA = 'IF(N16=0,0,(SUM(D:D)+SUM(H:H)+SUM(L:L))/N16)';
    setMeta(21, 'Cumulative GPA');
    const cellGPA = worksheet.getCell(21, metaColStart + 1);
    cellGPA.value = { formula: formulaGPA };
    cellGPA.numFmt = '0.00';
    cellGPA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; // Light yellow
    
    // --- MAIN EXPORT LOOP ---

    let currentRow = 1;

    years.forEach(year => {
      // 1. Year Header
      const yearCell = worksheet.getCell(currentRow, 1);
      yearCell.value = year.name.toUpperCase();
      yearCell.fill = getHeaderFill();
      yearCell.font = getHeaderFont();
      yearCell.alignment = { horizontal: 'center', vertical: 'middle' };
      const border = getBorderStyle();
      yearCell.border = { top: border, bottom: border, left: border, right: border };
      worksheet.mergeCells(currentRow, 1, currentRow, 12);
      currentRow++;

      // 2. Term Headers
      let colIdx = 1;
      terms.forEach(t => {
        const c1 = worksheet.getCell(currentRow, colIdx); c1.value = t.toUpperCase(); 
        const c2 = worksheet.getCell(currentRow, colIdx + 1); c2.value = 'CREDITS';
        const c3 = worksheet.getCell(currentRow, colIdx + 2); c3.value = 'GRADE';
        const c4 = worksheet.getCell(currentRow, colIdx + 3); c4.value = 'POINTS';

        [c1, c2, c3, c4].forEach(cell => {
           cell.fill = getTermHeaderFill();
           cell.font = getTermHeaderFont();
           cell.alignment = { horizontal: 'center', vertical: 'middle' };
           const border = getBorderStyle();
           cell.border = { top: border, bottom: border, left: border, right: border };
        });
        colIdx += 4;
      });
      currentRow++;

      // 3. Data Rows
      // Filter out null/undefined entries to prevent ghost rows
      const getCourses = (term) => {
          const list = (degreePlan[year.id] && degreePlan[year.id][term] && degreePlan[year.id][term].courses) || [];
          return list.filter(c => c && c.name); // only count real courses
      };
      const fall = getCourses('fall');
      const spring = getCourses('spring');
      const summer = getCourses('summer');
      
      const rowsNeeded = Math.max(fall.length, spring.length, summer.length, 1);

      for (let i = 0; i < rowsNeeded; i++) {
         const row = worksheet.getRow(currentRow);
         row.height = 18;
         
         const writeTerm = (courseList, startCol) => {
             const c = courseList[i];
             if (c) {
                 row.getCell(startCol).value = c.name || '';
                 row.getCell(startCol+1).value = Number(c.credits) || 0;
                 row.getCell(startCol+2).value = c.grade ? c.grade : null;
             }
         };
         
         writeTerm(fall, 1);
         writeTerm(spring, 5);
         writeTerm(summer, 9);

         let cBase = 1;
         for (let t = 0; t < 3; t++) {
             // Borders
             for(let k=0; k<4; k++) {
                 const border = getBorderStyle();
                 row.getCell(cBase+k).border = { top: border, bottom: border, left: border, right: border };
             }

             const credAddr = `${colToLetter(cBase + 1)}${currentRow}`;
             const gradeAddr = `${colToLetter(cBase + 2)}${currentRow}`;
             
             const ptsCell = row.getCell(cBase + 3);
             // Use nested IFs instead of SWITCH for maximum compatibility (prevents 'Repaired Records' on older Excel)
             // Grades: A=4, A-=3.7, B+=3.3, B=3, B-=2.7, C+=2.3, C=2, C-=1.7, D+=1.3, D=1, F=0
             const gVal = `MID(${gradeAddr},1,2)`;
             const formulaStr = `IF(${gVal}="A",4,IF(${gVal}="A-",3.7,IF(${gVal}="B+",3.3,IF(${gVal}="B",3,IF(${gVal}="B-",2.7,IF(${gVal}="C+",2.3,IF(${gVal}="C",2,IF(${gVal}="C-",1.7,IF(${gVal}="D+",1.3,IF(${gVal}="D",1,IF(${gVal}="F",0,0)))))))))))`;
             
             ptsCell.value = {
                 formula: `IF(${gradeAddr}="","",IFERROR(${formulaStr}*${credAddr},0))`
             };
             cBase += 4;
         }
         currentRow++;
      }

      // 4. TOTAL CREDITS Row
      const totalRow = worksheet.getRow(currentRow);

      // Removed row-level font/height to prevent XML corruption on merged cells

      const termsLists = [fall, spring, summer];
      let baseCol = 1;
      
      termsLists.forEach(list => {
          const future = list.reduce((acc, c) => (c.status === 'planned' || !c.grade || c.grade==='') ? acc + (Number(c.credits)||0) : acc, 0);
          const achieved = list.reduce((acc, c) => (c.grade && c.grade !== '' && c.grade !== 'F' && c.status === 'taken') ? acc + (Number(c.credits)||0) : acc, 0);

          // "TOTAL CREDITS"
          const labelCell = totalRow.getCell(baseCol);
          labelCell.value = 'TOTAL CREDITS';
          // Explicitly set font since we removed row-level font
          labelCell.font = { bold: true, name: 'Calibri' };
          const totalBorder = getBorderStyle();
          labelCell.border = { top: {style:'double'}, bottom: {style:'double'}, left: totalBorder, right: totalBorder };
          labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };

          // Future/Achieved
          // Convert static values to dynamic formulas relative to the current block
          // Range for this term's credits: colToLetter(baseCol+1) from (currentRow - rowsNeeded) to (currentRow - 1)
          // Range for this term's grades: colToLetter(baseCol+2) ...
          
          const startRow = currentRow - rowsNeeded;
          const endRow = currentRow - 1;
          const credCol = colToLetter(baseCol + 1);
          const gradeCol = colToLetter(baseCol + 2);
          const rangeCreds = `${credCol}${startRow}:${credCol}${endRow}`;
          const rangeGrades = `${gradeCol}${startRow}:${gradeCol}${endRow}`;

          // Formula: ="future: " & SUMIFS(Creds, Grades, "")
          const fFuture = `SUMIFS(${rangeCreds},${rangeGrades},"")`;
          // Formula: ="credits achieved: " & SUMIFS(Creds, Grades, "<>")
          const fAchieved = `SUMIFS(${rangeCreds},${rangeGrades},"<>")`;
          
          // Col 2: Future
          const futureCell = totalRow.getCell(baseCol + 1);
          futureCell.value = { formula: `"future: " & ${fFuture}` };
          futureCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; 
          futureCell.font = { size: 9, bold: true, name: 'Calibri' };
          futureCell.border = { top: {style:'double'}, bottom: {style:'double'}, left: totalBorder, right: totalBorder };

          // Col 3: Achieved
          const achievedCell = totalRow.getCell(baseCol + 2);
          achievedCell.value = { formula: `"credits achieved: " & ${fAchieved}` };
          achievedCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; 
          achievedCell.font = { size: 9, bold: true, name: 'Calibri' };
          achievedCell.border = { top: {style:'double'}, bottom: {style:'double'}, left: totalBorder, right: totalBorder };
          
          // No Merge

          // Points Sum -> Term GPA
          // Formula: IF(Achieved=0, 0, SUM(Points)/Achieved)
          // Points range: colToLetter(baseCol+3) startRow:endRow
          // Achieved credits is fAchieved
          const pointsCol = colToLetter(baseCol+3);
          const rangePoints = `${pointsCol}${startRow}:${pointsCol}${endRow}`;
          
          const sumCell = totalRow.getCell(baseCol + 3);
          // Terms GPA: IF(Achieved=0, 0, SumPoints/Achieved)
          // AchievedCredits (fAchieved) automatically excludes future courses.
          sumCell.value = { formula: `IF(${fAchieved}=0,0,SUM(${rangePoints})/${fAchieved})` };
          sumCell.numFmt = '0.00'; // Format as decimal
          sumCell.font = { bold: true, name: 'Calibri' };
          sumCell.border = { top: {style:'double'}, bottom: {style:'double'}, left: totalBorder, right: totalBorder };
          sumCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
          sumCell.alignment = { horizontal: 'center', vertical: 'middle' };

          baseCol += 4;
      });
      currentRow++;

      // 5. Spacer
      // 5. Spacer (Skip row)
      currentRow++;
    });

    // Hidden JSON backup sheet
    const backup = workbook.addWorksheet('__json_backup');
    backup.state = 'veryHidden';
    const backupJson = JSON.stringify({ plan: degreePlan, years, programs: selectedPrograms });
    const maxChunk = 32000;
    for (let i = 0; i < backupJson.length; i += maxChunk) {
      backup.addRow([backupJson.slice(i, i + maxChunk)]);
    }

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `wsu-degree-plan-${dateStr}.xlsx`;
    a.click();
  };

  // Import from Excel (prefer hidden JSON backup for perfect round-trip)
  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);

      // Prefer the hidden JSON backup for an exact round-trip restore
      const backupSheet = workbook.getWorksheet('__json_backup');
      if (backupSheet) {
        // reassemble JSON from rows
        let jsonStr = '';
        backupSheet.eachRow((row) => {
          const v = row.getCell(1).value;
          if (v) jsonStr += String(v);
        });
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed && parsed.plan) {
            // if years array present, prefer it
            if (parsed.years) setYears(parsed.years);
            setDegreePlan(parsed.plan || {});
            setSelectedPrograms(parsed.programs || { majors: [], minors: [], certificates: [] });
            alert('Import successful (restored from hidden backup).');
            return;
          }
        } catch (e) {
          // fall through to legacy parsing if JSON malformed
          console.warn('Failed to parse __json_backup:', e);
        }
      }

      // Fallback: try legacy sheet names (either 'WSU Degree Plan' or 'Degree Plan')
      const worksheet = workbook.getWorksheet('WSU Degree Plan') || workbook.getWorksheet('Degree Plan');
      if (!worksheet) throw new Error('Degree Plan sheet not found');

      // Legacy parsing assumes the stacked per-year layout where each year has a title row,
      // two header rows, then N rows of term-aligned courses. We'll extract by scanning rows.
      const newPlan = {};
      years.forEach(year => {
        newPlan[year.id] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
      });

      // We'll iterate rows and detect title rows by checking if the first cell contains a Year name.
      const yearNameToId = Object.fromEntries(years.map(y => [String(y.name), y.id]));

      let currentYearId = null;
      let inDataSection = false;
      let headerRowsSeen = 0;

      worksheet.eachRow((row, rowNumber) => {
        const first = row.getCell(1).value;
        if (first && typeof first === 'string' && yearNameToId[first.trim()]) {
          // Title row
          currentYearId = yearNameToId[first.trim()];
          inDataSection = false;
          headerRowsSeen = 0;
          return;
        }

        // Detect sub-header rows (Course/Credits/Grade/Points)
        const maybeCourse = row.getCell(2).value;
        if (maybeCourse && String(maybeCourse).toLowerCase().includes('course')) {
          headerRowsSeen += 1;
          // after two header rows, next rows are data
          if (headerRowsSeen >= 1) inDataSection = true;
          return;
        }

        if (!currentYearId || !inDataSection) return;

        // Data row: columns are spacer | FallCourse | FallCredits | FallGrade | FallPoints | SpringCourse | ...
        // We'll extract each term's Course, Credits, Grade
        try {
          const getVal = (colIdx) => {
            const v = row.getCell(colIdx).value;
            if (v && v.result !== undefined && v.formula) return ''; // formula cell
            return v;
          };

          // fall columns start at 2
          const base = 2;
          const fallCourse = getVal(base);
          const fallCredits = parseFloat(getVal(base + 1)) || 0;
          const fallGrade = getVal(base + 2) || '';
          if (fallCourse) newPlan[currentYearId].fall.courses.push({ id: Date.now() + Math.random(), name: String(fallCourse), credits: fallCredits, grade: String(fallGrade || ''), status: 'not-taken' });

          const springCourse = getVal(base + 4);
          const springCredits = parseFloat(getVal(base + 5)) || 0;
          const springGrade = getVal(base + 6) || '';
          if (springCourse) newPlan[currentYearId].spring.courses.push({ id: Date.now() + Math.random(), name: String(springCourse), credits: springCredits, grade: String(springGrade || ''), status: 'not-taken' });

          const summerCourse = getVal(base + 8);
          const summerCredits = parseFloat(getVal(base + 9)) || 0;
          const summerGrade = getVal(base + 10) || '';
          if (summerCourse) newPlan[currentYearId].summer.courses.push({ id: Date.now() + Math.random(), name: String(summerCourse), credits: summerCredits, grade: String(summerGrade || ''), status: 'not-taken' });
        } catch (err) {
          // ignore row parse errors
        }
      });

      setDegreePlan(newPlan);
      alert('Import successful (legacy parsing).');
    } catch (error) {
      console.error('Import error:', error);
      alert('Error importing file. Please check format.');
    }
  };

  // Reset / delete entire degree plan and selected programs
  const handleResetPlan = () => {
    const ok = window.confirm('Reset degree plan and selected programs? This cannot be undone.');
    if (!ok) return;

    const defaultYears = [
      { id: 1, name: 'Year 1' },
      { id: 2, name: 'Year 2' },
      { id: 3, name: 'Year 3' },
      { id: 4, name: 'Year 4' }
    ];

    const emptyPlan = {};
    defaultYears.forEach((y, idx) => {
      emptyPlan[y.id] = {
        fall: { courses: [{ id: Date.now() + idx * 10 + 1, name: '', credits: 0, grade: '', status: 'not-taken' }] },
        spring: { courses: [{ id: Date.now() + idx * 10 + 2, name: '', credits: 0, grade: '', status: 'not-taken' }] },
        summer: { courses: [{ id: Date.now() + idx * 10 + 3, name: '', credits: 0, grade: '', status: 'not-taken' }] }
      };
    });

    setYears(defaultYears);
    setDegreePlan(emptyPlan);
    setSelectedPrograms({ majors: [], minors: [], certificates: [] });
    // Persist cleared plan
    try {
      saveDegreePlan({ plan: emptyPlan, years: defaultYears, programs: { majors: [], minors: [], certificates: [] } });
      console.debug('[DegreePlanner] reset saved to storage');
    } catch (e) {
      console.error('Failed to save reset plan:', e);
    }
  };

  // Derived catalog display state for UCORE-aggregated results and client-side filtering
  // Use allowedUcoreCategories from cache when available, otherwise derive from results
  const isUcoreAggregated = Boolean(
    (allowedUcoreCategories && allowedUcoreCategories.length > 0) ||
    (catalogResults && catalogResults.length > 0 && catalogResults.some(r => Array.isArray(r._ucoreMatches) && r._ucoreMatches.length > 0))
  );
  // Prefer allowedUcoreCategories (from cache) over derived categories
  const availableUcoreCats = (allowedUcoreCategories && allowedUcoreCategories.length > 0)
    ? allowedUcoreCategories
    : (isUcoreAggregated ? Array.from(new Set(catalogResults.flatMap(r => r._ucoreMatches || []))) : []);
  const filteredCatalogResults = (catalogResults || []).filter(r => {
    if (isUcoreAggregated && catalogUcoreSelected) {
      return Array.isArray(r._ucoreMatches) ? r._ucoreMatches.includes(catalogUcoreSelected) : false;
    }
    return true;
  }).filter(r => {
    if (!catalogClientSearch) return true;
    const q = catalogClientSearch.toLowerCase();
    const code = String(r.code || `${r.prefix || ''} ${r.number || ''}`).toLowerCase();
    const title = String(r.title || '').toLowerCase();
    const desc = String(r.description || '').toLowerCase();
    return code.includes(q) || title.includes(q) || desc.includes(q);
  });

  // Reset carousel index when client filters change
  useEffect(() => {
    setCatalogIndex(0);
  }, [catalogUcoreSelected, catalogClientSearch]);

  // Close grade scale modal on Escape key
  useEffect(() => {
    if (!showGradeScale) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowGradeScale(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showGradeScale]);

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={() => setShowOptimizeModal(true)}
          className="w-full sm:w-auto px-3 py-2 sm:px-4 sm:py-2 bg-wsu-crimson text-white rounded-md hover:bg-red-800 transition touch-manipulation text-sm"
          aria-label="Optimize schedule"
        >
          Optimize
        </button>
        <button
          onClick={handleExport}
          className="w-full sm:w-auto px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition touch-manipulation text-sm"
          aria-label="Export plan"
        >
          Export
        </button>
        <label className="w-full sm:w-auto flex items-center justify-center px-3 py-2 sm:px-4 sm:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition cursor-pointer touch-manipulation text-sm">
          <span>Import</span>
          <input type="file" accept=".xlsx" onChange={handleImport} className="hidden" />
        </label>
        <button
          onClick={handleResetPlan}
          className="w-full sm:w-auto px-3 py-2 sm:px-3 sm:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition touch-manipulation text-sm"
          title="Reset Plan"
          aria-label="Reset plan"
        >
          Reset
        </button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <button
          type="button"
          onClick={() => setShowGradeScale(!showGradeScale)}
          aria-pressed={showGradeScale}
          aria-label="Cumulative GPA - tap to view grade scale"
          className="bg-white px-3 py-2 rounded-md shadow hover:shadow-md transition touch-manipulation w-full text-sm cursor-pointer text-center"
        >
          <div className="text-xl font-bold text-wsu-crimson">{gpa}</div>
          <div className="text-xs text-gray-600">Cumulative GPA</div>
          <div className="text-[11px] text-gray-400 mt-1">Tap for scale</div>
        </button>

        <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
          <div className="text-xl font-bold text-green-600">{creditsAchieved}</div>
          <div className="text-xs text-gray-600">Credits Achieved</div>
        </div>

        <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
          <div className="text-xl font-bold text-blue-600">{creditsPlanned}</div>
          <div className="text-xs text-gray-600">Credits Planned</div>
        </div>

        <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
          <div className="text-xl font-bold text-purple-600">{creditsRequired}</div>
          <div className="text-xs text-gray-600">Credits Required</div>
        </div>

        <div className="bg-white px-3 py-2 rounded-md shadow touch-manipulation text-sm text-center">
            <div className="min-h-[2.25rem] flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-gray-900 break-words">{progress || 'Not Started'}</div>
              <div className="text-xs text-gray-600 mt-1">Ready to Graduate</div>
            </div>
        </div>
      </div>

      {/* Grade Scale Modal (overlay) */}
      {showGradeScale && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="WSU Grade Scale"
          onClick={() => setShowGradeScale(false)}
        >
          <div className="absolute inset-0 bg-black bg-opacity-40" />
          <div
            className="relative z-10 w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-lg">WSU Grade Scale</h3>
              <button
                onClick={() => setShowGradeScale(false)}
                className="text-gray-600 hover:text-gray-800 rounded p-1"
                aria-label="Close grade scale"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-gray-700 mb-3">This shows the standard grade-to-point mapping used for GPA calculations.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {Object.entries(GRADE_POINTS).map(([grade, points]) => (
                  <div key={grade} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                    <div className="font-medium">{grade}</div>
                    <div className="text-gray-600">{points.toFixed(1)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">Tip: press <span className="font-medium">Esc</span> or tap outside to close.</div>
            </div>
          </div>
        </div>
      )}

      {/* Class Grade Calculator modal (opened per-course) */}
      {showClassCalc && (
        <ClassGradeCalculator
          courseName={classCalcCourseName}
          onClose={() => { setShowClassCalc(false); setClassCalcCourseName(null); }}
        />
      )}

        {/* Catalog Course Picker Modal */}
        {showCatalogModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between">
                <h3 className="text-xl font-bold">Select Courses (Catalog)</h3>
                <button onClick={() => { setShowCatalogModal(false); setAllowedUcoreCategories([]); setCatalogUcoreSelected(null); }} className="text-gray-600">Close</button>
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
                {/* Input area: three modes
                    1) UCORE-aggregated results -> show client-side search + UCORE category buttons
                    2) Footnote-driven (prefix/number) -> hide search, show note
                    3) Normal search -> server-backed search input + year/term
                */}
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
                            <button onClick={() => { setCatalogTarget(null); setCatalogTargetCourse(null); setShowCatalogModal(false); setAllowedUcoreCategories([]); setCatalogUcoreSelected(null); }} className="px-2 py-1 bg-white rounded border text-sm">Done</button>
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
        )}

      {/* Degree Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Select Degree Program</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
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
              placeholder="Type to search majors, minors, certificates..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
            />
            
            {/* Suggestions Dropdown */}
            {showDegreeSuggestions && degreeSearch.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {degrees
                  .filter(d => d.name.toLowerCase().includes(degreeSearch.toLowerCase()))
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
                {degrees.filter(d => d.name.toLowerCase().includes(degreeSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">No results found</div>
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
              {[...selectedPrograms.majors, ...selectedPrograms.minors, ...selectedPrograms.certificates].map((prog, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg">
                  <div className="px-3 py-2 bg-wsu-crimson text-white rounded-t-lg font-medium text-sm">
                    {prog.name}
                  </div>
                  {prog.data?.degree?.narrative && (
                    <details className="px-3 py-2 bg-gray-50">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-wsu-crimson">
                        📋 Degree Information & Requirements
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

      {/* Year Tabs */}
      <div className="bg-white rounded-lg shadow">
        {/* Tab Headers */}
        <div className="border-b border-gray-200 flex items-center">
          <div className="flex overflow-x-auto flex-1">
            {years.map(year => (
              <button
                key={year.id}
                onClick={() => setActiveYearTab(year.id)}
                className={`px-6 py-3 font-medium transition whitespace-nowrap ${
                  activeYearTab === year.id
                    ? 'text-wsu-crimson border-b-2 border-wsu-crimson'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {year.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 border-l border-gray-200">
            <button
              onClick={handleAddYear}
              className="p-2 text-gray-600 hover:text-wsu-crimson hover:bg-gray-100 rounded transition"
              title="Add Year"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {years.length > 1 && (
              <button
                onClick={() => handleDeleteYear(activeYearTab)}
                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition"
                title="Delete Current Year"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {years.filter(year => year.id === activeYearTab).map(year => (
            <YearSection
              key={year.id}
              year={year}
              degreePlan={degreePlan}
              setDegreePlan={setDegreePlan}
              onDeleteYear={() => handleDeleteYear(year.id)}
              canDelete={years.length > 1}
              hideHeader={true}
              openCatalogForCourse={openCatalogForCourse}
              openClassCalc={(name) => { console.log('[DegreePlanner] openClassCalc ->', name); setClassCalcCourseName(name); setShowClassCalc(true); }}
              activeTermTab={activeTermTab}
              setActiveTermTab={setActiveTermTab}
            />
          ))}
        </div>
      </div>

      {/* Optimize Modal */}
      {showOptimizeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Optimize Schedule</h3>
            <div className="space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="speed"
                  value="accelerated"
                  checked={optimizeSpeed === 'accelerated'}
                  onChange={(e) => setOptimizeSpeed(e.target.value)}
                  className="w-4 h-4"
                />
                <span>Accelerated (23 credits/semester)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="speed"
                  value="normal"
                  checked={optimizeSpeed === 'normal'}
                  onChange={(e) => setOptimizeSpeed(e.target.value)}
                  className="w-4 h-4"
                />
                <span>Normal (15-18 credits/semester)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="speed"
                  value="relaxed"
                  checked={optimizeSpeed === 'relaxed'}
                  onChange={(e) => setOptimizeSpeed(e.target.value)}
                  className="w-4 h-4"
                />
                <span>Relaxed (12 credits/semester minimum)</span>
              </label>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleOptimize}
                className="flex-1 px-4 py-2 bg-wsu-crimson text-white rounded-lg hover:bg-red-800"
              >
                Optimize
              </button>
              <button
                onClick={() => setShowOptimizeModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

// Term Card Component
function TermCard({ title, term, yearId, courses, degreePlan, setDegreePlan, openCatalogForCourse, openClassCalc }) {
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);
  
  const calculateTermGPA = () => {
    let points = 0;
    let credits = 0;
    courses.forEach(c => {
      if (c.status === 'taken' && c.grade) {
        points += (GRADE_POINTS[c.grade] || 0) * c.credits;
        credits += c.credits;
      }
    });
    return credits > 0 ? (points / credits).toFixed(2) : '—';
  };

  const addCourse = () => {
    const newCourse = {
      id: Date.now(),
      name: '',
      credits: 0,
      grade: '',
      status: 'not-taken'
    };
    
    setDegreePlan(prev => ({
      ...prev,
      [yearId]: {
        ...prev[yearId],
        [term]: {
          courses: [...prev[yearId][term].courses, newCourse]
        }
      }
    }));
  };

  const updateCourse = (courseId, field, value) => {
    setDegreePlan(prev => ({
      ...prev,
      [yearId]: {
        ...prev[yearId],
        [term]: {
          courses: prev[yearId][term].courses.map(c =>
            c.id === courseId ? { ...c, [field]: value } : c
          )
        }
      }
    }));
  };

  const removeCourse = (courseId) => {
    setDegreePlan(prev => ({
      ...prev,
      [yearId]: {
        ...prev[yearId],
        [term]: {
          courses: prev[yearId][term].courses.filter(c => c.id !== courseId)
        }
      }
    }));
  };

  const enrollmentStatus = totalCredits >= 12 ? 'Full-Time' : 'Part-Time';
  const statusColor = totalCredits >= 12 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold">{title}</h4>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
          {enrollmentStatus}
        </span>
      </div>
      
      <div className="text-sm text-gray-600 mb-3">
        {totalCredits} credits
        {totalCredits > 23 && (
          <div className="text-xs text-orange-600 mt-1">⚠️ Advisor approval required</div>
        )}
      </div>

      <div className="space-y-2">
        {courses.map((course, idx) => (
          <CourseRow
            key={`${course.id || 'noid'}-${idx}`}
            course={course}
            onUpdate={updateCourse}
            onRemove={removeCourse}
            yearId={yearId}
            term={term}
            openCatalog={openCatalogForCourse}
            openClassCalc={openClassCalc}
          />
        ))}
      </div>

      <button
        onClick={addCourse}
        className="w-full mt-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded text-gray-600 hover:border-wsu-crimson hover:text-wsu-crimson transition"
      >
        + Add Course
      </button>

      <div className="mt-3 pt-3 border-t text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Term GPA:</span>
          <span className="font-semibold">{calculateTermGPA()}</span>
        </div>
      </div>
    </div>
  );
}

// Course Row Component with autocomplete
function CourseRow({ course, onUpdate, onRemove, yearId, term, openCatalog, openClassCalc }) {
  const textareaRef = useRef(null);
  const [courseSuggestions, setCourseSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [course.name]);

  const handleCourseSearch = async (value) => {
    onUpdate(course.id, 'name', value);
    
    if (value.length > 1) {
      try {
        const data = await searchCourses(value, 10);
        // Group courses by prefix + number
        const grouped = {};
        (data.courses || []).forEach(c => {
          const key = `${c.coursePrefix} ${c.courseNumber}`;
          if (!grouped[key]) {
            grouped[key] = {
              key,
              course: c,
              sections: []
            };
          }
          grouped[key].sections.push(c);
        });
        // Limit suggestions on mobile to avoid pushing other layout elements down
        let results = Object.values(grouped);
        try {
          const isMobile = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches);
          const maxItems = isMobile ? 5 : 20;
          results = results.slice(0, maxItems);
        } catch (e) {
          // ignore and fall back to full list
        }
        setCourseSuggestions(results);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error searching courses:', error);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const selectCourse = (courseData) => {
    onUpdate(course.id, 'name', `${courseData.coursePrefix} ${courseData.courseNumber}`);
    onUpdate(course.id, 'credits', parseInt(courseData.credits) || 0);
    setShowSuggestions(false);
    setExpandedCourse(null);
  };

  // Determine whether this row is a placeholder/elective that should show the catalog Select button.
  const hasCourseCode = (name) => {
    if (!name) return false;
    return /\b[A-Za-z]{2,6}\s*\.?\s*\d{3}\b/.test(name);
  };

  const isPlaceholderRow = () => {
    const nm = String(course.name || '');
    if (!nm.trim()) return true;
    // obvious elective/requirement tokens
    if (/elective|requirement|u-?core/i.test(nm)) return true;
    // if the name is just a bracketed attribute (e.g., "[WRTG]") treat as placeholder
    if (/^\s*\[.*\]\s*$/.test(nm) && !hasCourseCode(nm)) return true;
    return false;
  };

  return (
    <div className="space-y-2 group relative">
      <div className="flex gap-2 items-start">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={course.name}
            onChange={(e) => handleCourseSearch(e.target.value)}
            onFocus={() => course.name.length > 1 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Type course name (e.g., CPTS 121)"
            rows={1}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded resize-none overflow-hidden focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          />
          
          {/* Course Suggestions Dropdown */}
          {showSuggestions && courseSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-44 md:max-h-60 overflow-y-auto">
              {courseSuggestions.map(({ key, course: c, sections }) => (
                <div key={key} className="border-b border-gray-200 last:border-b-0">
                  <button
                    onClick={() => {
                      if (sections.length === 1) {
                        selectCourse(sections[0]);
                      } else {
                        setExpandedCourse(expandedCourse === key ? null : key);
                      }
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium text-sm">
                        {c.coursePrefix} {c.courseNumber}
                      </div>
                      <div className="text-xs text-gray-600 truncate">{c.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{sections.length} section{sections.length > 1 ? 's' : ''}</span>
                      {sections.length > 1 && (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                  
                  {/* Expanded Sections */}
                  {expandedCourse === key && sections.length > 1 && (
                    <div className="bg-gray-50 px-3 py-2 space-y-1">
                      {sections.map(section => (
                        <button
                          key={section.uniqueId}
                          onClick={() => selectCourse(section)}
                          className="w-full text-left px-2 py-1 text-xs hover:bg-white rounded"
                        >
                          <div className="flex justify-between">
                            <span className="font-medium">Section {section.sectionNumber}</span>
                            <span className="text-gray-600">{section.credits} cr</span>
                          </div>
                          <div className="text-gray-600">
                            {section.instructor || 'Staff'} • {section.dayTime || 'ARR'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Show 'Select' button only for true placeholders (not rows already containing a code like 'ENGL 101 [WRTG]') */}
          {(!course.catalogCourseId && isPlaceholderRow()) && (
            <button
              onClick={() => openCatalog && openCatalog(course.id, yearId, term)}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              title="Select course from catalog"
            >
              Select
            </button>
          )}

          {/* Grade calculator trigger (visible on all sizes) */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); console.log('[CourseRow] calc button clicked', course.name); if (openClassCalc) openClassCalc(course.name || 'Course'); else console.warn('openClassCalc is not provided'); }}
            aria-label="Open grade calculator"
            title="Open grade calculator"
            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 7h10" />
              <path d="M7 11h4" />
              <path d="M7 15h4" />
            </svg>
            <span className="sr-only">Open grade calculator</span>
          </button>

          <button
            onClick={() => onRemove(course.id)}
            aria-label="Remove course"
            title="Remove course"
            className="text-red-600 hover:text-red-800 text-sm px-2 focus:outline-none"
          >
            ×
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-2">
        <input
          type="number"
          value={course.credits || ''}
          onChange={(e) => onUpdate(course.id, 'credits', parseInt(e.target.value) || 0)}
          placeholder="Cr"
          min="0"
          max="18"
          className="input-field text-sm"
        />
        
        <select
          value={course.status || 'not-taken'}
          onChange={(e) => onUpdate(course.id, 'status', e.target.value)}
          className="select-field text-sm"
        >
          <option value="not-taken">Not Taken</option>
          <option value="planned">Planned</option>
          <option value="in-progress">In Progress</option>
          <option value="taken">Taken</option>
        </select>
        
        <select
          value={course.grade || ''}
          onChange={(e) => onUpdate(course.id, 'grade', e.target.value)}
          disabled={course.status === 'not-taken' || course.status === 'planned'}
          className="select-field text-sm disabled:bg-gray-100"
        >
          <option value="">—</option>
          {Object.keys(GRADE_POINTS).map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        
        <div className="px-2 py-1 text-sm text-gray-600 text-right">
          {course.grade && course.credits ? ((GRADE_POINTS[course.grade] || 0) * course.credits).toFixed(1) : '—'}
        </div>
      </div>
      {/* Footnotes / Notes for the course - collapsible on mobile */}
      {((Array.isArray(course.footnotes) && course.footnotes.length > 0) || (course.footnotes && !Array.isArray(course.footnotes))) && (() => {
        const hasNotes = true;
        return (
          <CourseNotes notes={course.footnotes} />
        );
      })()}
    </div>
  );
}

// CourseNotes - separates note rendering and includes mobile-first collapsed behavior
function CourseNotes({ notes }) {
  const isArray = Array.isArray(notes);
  const [open, setOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        // default expanded on md+ (desktop), collapsed on small screens
        return window.matchMedia('(min-width: 768px)').matches;
      }
    } catch (e) {}
    return false;
  });

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-gray-600 hover:text-gray-800 flex items-center gap-2"
        aria-expanded={open}
      >
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium text-sm">Notes</span>
        <span className="text-xs text-gray-500">{isArray ? notes.length : 1}</span>
      </button>

      {open && (
        <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
          <strong className="text-sm text-gray-700">Details:</strong>
          <div className="mt-1 space-y-1">
            {isArray
              ? notes.map((fn, i) => (
                  <div key={i} className="leading-snug">{fn}</div>
                ))
              : <div className="leading-snug">{notes}</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default DegreePlanner;
