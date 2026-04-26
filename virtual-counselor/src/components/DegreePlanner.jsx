import React, { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import ClassGradeCalculator from "./ClassGradeCalculator";
import { fetchDegrees, fetchDegreeRequirements } from "../utils/api";
import { exportToExcel, importFromExcel, exportToICS } from "./degree-planner/DegreePlannerExport";
import { printDegreePlan } from "./degree-planner/DegreePlannerPrint";
import DegreePlannerHeader from "./degree-planner/DegreePlannerHeader";
import DegreePlannerStats from "./degree-planner/DegreePlannerStats";


import {
  saveUcoreCache,
  loadUcoreCache,
  saveDegreePlan,
  loadDegreePlan,
  clearAllData,
} from "../utils/storage";
import {
  calculateGPA,
  calculateCreditsAchieved,
  calculateCreditsPlanned,
  calculateCreditsRequired,
  getCompletedCourses,
  getDuplicateCourses,
  analyzeDegreeProgress,
  PASSING_GRADES,
  getMinGradeForDegree,
} from "../utils/degreeCalculations";
import { optimizeSchedule } from "../utils/degreeOptimizer";
import YearSection from "./degree-planner/YearSection";
import OptimizeModal from "./degree-planner/OptimizeModal";
import GradeScaleModal from "./degree-planner/GradeScaleModal";
import WhatIfModal from "./degree-planner/WhatIfModal";
import CatalogPicker from "./degree-planner/CatalogPicker";
import DegreeSelector from "./degree-planner/DegreeSelector";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import CourseDestinationPicker from "./degree-planner/CourseDestinationPicker";
import useHistory from "../hooks/useHistory";

function DegreePlanner() {
  // State management
  const [catalogYears, setCatalogYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [degrees, setDegrees] = useState([]);
  const [degreeSearch, setDegreeSearch] = useState("");
  const [showDegreeSuggestions, setShowDegreeSuggestions] = useState(false);
  const [degreeSortBy, setDegreeSortBy] = useState("name-asc"); // 'name-asc', 'name-desc', 'type'
  const [degreeFilterType, setDegreeFilterType] = useState("all"); // 'all', 'major', 'minor', 'certificate'
  const [selectedPrograms, setSelectedPrograms] = useState({
    majors: [],
    minors: [],
    certificates: [],
  });
  const [years, setYears] = useState([
    { id: 1, name: "Year 1" },
    { id: 2, name: "Year 2" },
    { id: 3, name: "Year 3" },
    { id: 4, name: "Year 4" },
  ]);
  const [activeYearTab, setActiveYearTab] = useState(1);
  const [activeTermTab, setActiveTermTab] = useState("fall"); // 'fall', 'spring', 'summer'

  // Use history hook for undo/redo functionality
  const {
    state: degreePlan,
    setState: setDegreePlan,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory({});

  const [showGradeScale, setShowGradeScale] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveModalData, setMoveModalData] = useState({ course: null, fromYear: null, fromTerm: null });
  const [optimizeSpeed, setOptimizeSpeed] = useState("normal");
  const [includeSummer, setIncludeSummer] = useState(true);
  const [ensureFullTime, setEnsureFullTime] = useState(true);
  const degreeInputRef = useRef(null);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showClassCalc, setShowClassCalc] = useState(false);
  const [classCalcCourseName, setClassCalcCourseName] = useState(null);
  const [classCalcCourseId, setClassCalcCourseId] = useState(null);
  const [catalogModalYear, setCatalogModalYear] = useState("");
  const [catalogModalTerm, setCatalogModalTerm] = useState("fall");
  const [catalogTarget, setCatalogTarget] = useState(null); // { courseId, yearId, term }
  const [catalogTargetCourse, setCatalogTargetCourse] = useState(null);

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
        certificates: programs.certificates || [],
      });
      setHydrated(true);
    } else {
      initializeEmptyPlan();
      setHydrated(true);
    }
  }, []);

  const initializeEmptyPlan = () => {
    const plan = {};
    years.forEach((year) => {
      plan[year.id] = {
        fall: { courses: [] },
        spring: { courses: [] },
        summer: { courses: [] },
      };
    });
    setDegreePlan(plan);
  };

  // --- Refinements State (Manual Overrides) ---
  const [refinements, setRefinements] = useState({});

  // ... (previous useEffects) ...

  // Load degree plan including refinements
  useEffect(() => {
    const data = loadDegreePlan();
    if (data) {
      setDegreePlan(data.plan || {});
      setYears(data.years || years);
      const programs = data.programs || {};
      setSelectedPrograms({
        majors: programs.majors || [],
        minors: programs.minors || [],
        certificates: programs.certificates || [],
      });
      setRefinements(data.refinements || {}); // Load refinements
      setHydrated(true);
    } else {
      initializeEmptyPlan();
      setHydrated(true);
    }
  }, []);

  // Save to persistent storage incl refinements
  useEffect(() => {
    try {
      if (!hydrated) {
        console.debug("[DegreePlanner] skipping save until hydrated");
        return;
      }
      saveDegreePlan({ plan: degreePlan, years, programs: selectedPrograms, refinements });
      console.debug(
        "[DegreePlanner] saved degree plan"
      );
    } catch (e) {
      console.error("Failed saving degree plan:", e);
    }
  }, [degreePlan, years, selectedPrograms, refinements]);


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
      console.error("Error loading degrees:", error);
    }
  };

  // --- Improved Progress Calculation ---
  // We use the shared logic from degreeCalculations to match requirements smart.
  // We need to flatten ALL requirements from ALL selected programs first.
  const allRequiredCourses = React.useMemo(() => {
    const reqs = [];
    // Helper to extract courses from program schedule
    const extract = (progList) => {
        progList.forEach(p => {
             if(p.data && p.data.schedule) {
                 p.data.schedule.forEach(sem => {
                     (sem.courses || []).forEach(c => {
                         const rawName = c.raw || c.courseCode || c.name;
                         if (rawName && !c.isNonCredit) {
                             const match = rawName.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
                             const code = match ? `${match[1].trim().toUpperCase()} ${match[2]}` : rawName.toUpperCase();
                             reqs.push({ ...c, name: rawName, code, credits: c.credits || 0 });
                         }
                     })
                 })
             }
        });
    };
    extract(selectedPrograms.majors || []);
    extract(selectedPrograms.minors || []);
    extract(selectedPrograms.certificates || []);
    
    // Deduplicate requirements based on specific course codes
    // e.g. If Major and Minor both ask for "CPT S 121", only count it once.
    // However, keep generics like "Elective" if they don't look like strict codes?
    // User request: "credits required should match the non duplicate courses"
    
    const uniqueReqs = [];
    const seenCodes = new Set();
    
    reqs.forEach(r => {
        // strict code check regex
        const isStrictCode = /^([A-Z\s&/]{2,15})\s*(\d{3})$/i.test(r.code);
        
        if (isStrictCode) {
            if (!seenCodes.has(r.code)) {
                seenCodes.add(r.code);
                uniqueReqs.push(r);
            }
        } else {
            // Include generic/electives?
            // If we have 2 "Technical Elective", we probably want 2.
            // But if they are identically named generics? 
            // Usually safest to keep generics, dedupe strict codes.
            uniqueReqs.push(r);
        }
    });
    
    return uniqueReqs;
  }, [selectedPrograms]);

  // Flatten user courses for analysis
  const flatUserCourses = React.useMemo(() => {
      const courses = [];
      Object.keys(degreePlan).forEach(y => {
          ['fall','spring','summer'].forEach(t => {
              (degreePlan[y][t]?.courses || []).forEach(c => {
                  if(c.name && c.credits > 0) {
                      const match = c.name.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
                      const code = match ? `${match[1].trim().toUpperCase()} ${match[2]}` : c.name.toUpperCase();
                      courses.push({ ...c, code, id: c.id });
                  }
              })
          })
      })
      return courses;
  }, [degreePlan]);

  const degreeMinGrade = React.useMemo(() => {
    const majorNames = (selectedPrograms.majors || []).map(m => m.name || '');
    if (majorNames.length === 0) return null;
    // Use the strictest (highest) minimum grade across all selected majors
    const GRADE_RANK = { "C-": 0, "C": 1, "C+": 2, "B-": 3, "B": 4, "B+": 5, "A-": 6, "A": 7 };
    let strictest = "C-";
    majorNames.forEach(n => {
      const g = getMinGradeForDegree(n);
      if ((GRADE_RANK[g] ?? 0) > (GRADE_RANK[strictest] ?? 0)) strictest = g;
    });
    return strictest;
  }, [selectedPrograms]);

  const progressAnalysis = React.useMemo(() => {
      return analyzeDegreeProgress(flatUserCourses, allRequiredCourses, refinements, degreeMinGrade);
  }, [flatUserCourses, allRequiredCourses, refinements, degreeMinGrade]);


  const gpa = calculateGPA(degreePlan);
  // Credits Achieved: Only count what is MATCHED (met) by passed courses?
  // Or stick to total completed credits? Usually progress bar is "Requirements Met".
  // The user asked for "account for those that are duplicates the same way".
  // So we should use the `matched` set from analysis for the progress bar.
  
  // Actually, standard "credits achieved" is just total passed credits. 
  // "Degree Progress" usually implies % of requirements met. 
  // The existing bar uses `creditsAchieved / creditsRequired`.
  // Let's refine `creditsAchieved` to be `progressAnalysis.matched` sum (but only taken ones? or planned too?)
  // Wait, standard UI is "Credits Planned" vs "Credits Achieved" (completed).
  
  // Use generic calc for raw stats, but use analysis for the progress bar if needed.
  // Actually, let's keep separate: `creditsAchieved` (raw total passed) vs `creditsRequired` (program total).
  // BUT the user specifically asked for duplicate handling.
  // If I take CPT S 121 twice, `calculateCreditsAchieved` counts it twice. `analyzeDegreeProgress` counts it once (if requirements only need it once).
  // The user wants the PLANNER (progress bar) to account for duplicates properly.
  
  // Credits Achieved = raw total of passed courses in the plan (always, regardless of degree matching)
  const creditsAchieved = calculateCreditsAchieved(degreePlan);
  // Credits Planned = raw total of all courses with credits in the plan
  const creditsPlanned = calculateCreditsPlanned(degreePlan);
  // Credits Required = from degree requirements (or 0 if no program selected)
  const noProgramSelected = allRequiredCourses.length === 0;
  const creditsRequired = progressAnalysis.totalRequiredCredits || 0;

  // Compute list of completed course codes for prerequisite checking
  const allCompletedCourses = React.useMemo(() => {
    return getCompletedCourses(degreePlan);
  }, [degreePlan]);

  // Detect duplicate courses across the degree plan
  const duplicateCourses = React.useMemo(() => {
    return getDuplicateCourses(degreePlan);
  }, [degreePlan]);

  // Graduation projection: figure out current semester + how many more are needed
  const graduationProjection = React.useMemo(() => {
    if (creditsRequired === 0) return null;
    const creditsRemaining = Math.max(creditsRequired - creditsAchieved, 0);
    if (creditsRemaining === 0) return { semestersLeft: 0, yearsLeft: 0, extraYearsNeeded: 0 };

    // Find the latest term with a "taken" course to determine current position
    const TERM_ORDER = { fall: 0, spring: 1, summer: 2 };
    let latestYearId = 0;
    let latestTerm = 'fall';
    Object.entries(degreePlan).forEach(([yId, yr]) => {
      ['fall', 'spring', 'summer'].forEach(t => {
        const hasTaken = (yr[t]?.courses || []).some(c => c.status === 'taken');
        if (hasTaken) {
          const y = parseInt(yId, 10);
          if (y > latestYearId || (y === latestYearId && TERM_ORDER[t] > TERM_ORDER[latestTerm])) {
            latestYearId = y;
            latestTerm = t;
          }
        }
      });
    });

    // Average credits/semester based on taken courses (fall+spring only, ignore summer)
    let totalTakenCredits = 0;
    let semestersTaken = 0;
    Object.values(degreePlan).forEach(yr => {
      ['fall', 'spring'].forEach(t => {
        const sem = yr[t]?.courses || [];
        const semCredits = sem.filter(c => c.status === 'taken').reduce((s, c) => s + (c.credits || 0), 0);
        if (semCredits > 0) { totalTakenCredits += semCredits; semestersTaken++; }
      });
    });
    const avgPerSemester = semestersTaken > 0 ? Math.round(totalTakenCredits / semestersTaken) : 15;
    const avgEffective = Math.max(avgPerSemester, 9); // floor at 9 to avoid infinity

    const semestersLeft = Math.ceil(creditsRemaining / avgEffective);
    const yearsLeft = Math.ceil(semestersLeft / 2);

    // How many more year tabs are needed beyond current plan?
    const maxExistingYear = years.length > 0 ? Math.max(...years.map(y => y.id)) : 4;
    const lastActiveYear = latestYearId || maxExistingYear;
    const totalYearsNeeded = lastActiveYear + yearsLeft;
    const extraYearsNeeded = Math.max(totalYearsNeeded - maxExistingYear, 0);

    return { semestersLeft, yearsLeft, extraYearsNeeded, avgPerSemester: avgEffective, latestYearId, latestTerm };
  }, [creditsRequired, creditsAchieved, degreePlan, years]);

  // Auto-extend plan when extra years are needed
  React.useEffect(() => {
    if (!graduationProjection || graduationProjection.extraYearsNeeded <= 0) return;
    setYears(prev => {
      const maxId = prev.length > 0 ? Math.max(...prev.map(y => y.id)) : 4;
      const toAdd = [];
      for (let i = 1; i <= graduationProjection.extraYearsNeeded; i++) {
        const newId = maxId + i;
        toAdd.push({ id: newId, name: `Year ${newId}` });
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
    setDegreePlan(prev => {
      const next = { ...prev };
      const maxId = years.length > 0 ? Math.max(...years.map(y => y.id)) : 4;
      for (let i = 1; i <= graduationProjection.extraYearsNeeded; i++) {
        const newId = maxId + i;
        if (!next[newId]) {
          next[newId] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
        }
      }
      return next;
    });
  }, [graduationProjection?.extraYearsNeeded]);

  // Progress state: when no programs selected or creditsRequired === 0, show Not Started.
  let progress = "Not Started";
  const programCount =
    (selectedPrograms.majors?.length || 0) +
    (selectedPrograms.minors?.length || 0) +
    (selectedPrograms.certificates?.length || 0);
  if (programCount === 0 || creditsRequired === 0) {
    progress = "Not Started";
  } else if (creditsAchieved >= creditsRequired) {
    progress = "Completed";
  } else {
    progress = "In Progress";
  }

  // Handle Apply What-If
  const handleApplyWhatIf = (newSelectedPrograms, newRefinements, missingReqs) => {
      // 1. Update Programs
      setSelectedPrograms(newSelectedPrograms);
      // 2. Update Refinements
      setRefinements(newRefinements);

      // 3. Add MISSING requirements as planned courses
      if (missingReqs && missingReqs.length > 0) {
          setDegreePlan(prev => {
              const newPlan = JSON.parse(JSON.stringify(prev));
              
              // Find first available year/term after current max year? 
              // Or just append to Year 1 Fall if empty, else find first slot?
              // Simple strategy: Distribute into Year 1, 2, 3...
              // Better: Append to the end of the current plan to avoid messing up existing schedule.
              
              // Let's find the first year.
              const yearIds = Object.keys(newPlan).sort();
              const targetYearId = yearIds[yearIds.length - 1] || 1; // Last year
              const targetTerm = 'fall'; // Default dumping ground?

              missingReqs.forEach(req => {
                 // Try to put in the last year, fall/spring/summer?
                 // Let's just dump them in the first available slot? 
                 // User said "only add the missing ones".
                 // We'll add them to the *last* year's 'fall' or create a new year if full? 
                 // Keep it simple: Add to Year 1 Fall for now, user can move them. 
                 // Or better: Distribute them.
                 
                 // Let's iterate years and find first "empty-ish" spot or just dump in Year 1 Fall.
                 // Given the complexity of optimal scheduling, preventing duplicates is key.
                 // Matches are already handled (not added). these are strictly missing.
                 
                 const y = yearIds[0];
                 if(newPlan[y]) {
                     newPlan[y].fall.courses.push({
                         id: Date.now() + Math.random(),
                         name: req.name, // Use original name e.g. "CPT S 121"
                         credits: req.credits || 3,
                         grade: "",
                         status: "planned",
                         footnotes: req.footnotes || [],
                         // ... other props
                     });
                 }
              });
              
              return newPlan;
          });
          toast.success(`Applied What-If analysis. Added ${missingReqs.length} missing courses.`);
      } else {
          toast.success("Applied What-If analysis (no new courses needed).");
      }
      setShowWhatIfModal(false);
  };

  // Year management
  const handleAddYear = () => {
    const newId = years.length + 1;
    const newYears = [...years, { id: newId, name: `Year ${newId}` }];
    setYears(newYears);

    setDegreePlan((prev) => ({
      ...prev,
      [newId]: {
        fall: { courses: [] },
        spring: { courses: [] },
        summer: { courses: [] },
      },
    }));
    toast.success(`Year ${newId} added`);
  };

  const handleDeleteYear = (yearId) => {
    if (years.length <= 1) {
      toast.error("Cannot delete the only year");
      return;
    }

    const newYears = years
      .filter((y) => y.id !== yearId)
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
    toast.success(`Year ${yearId} deleted`);
  };

  // Handle move course click
  const handleMoveClick = (course, fromYear, fromTerm) => {
    setMoveModalData({ course, fromYear, fromTerm });
    setShowMoveModal(true);
  };

  // Handle course move
  const handleMoveCourse = (course, fromYear, fromTerm, toYear, toTerm) => {
    setDegreePlan(prev => {
      const newPlan = JSON.parse(JSON.stringify(prev));

      // Remove from source
      if (newPlan[fromYear] && newPlan[fromYear][fromTerm]) {
        newPlan[fromYear][fromTerm].courses = newPlan[fromYear][fromTerm].courses.filter(
          c => c.id !== course.id
        );
      }

      // Add to destination (ensure structure exists)
      if (!newPlan[toYear]) {
        newPlan[toYear] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
      }
      if (!newPlan[toYear][toTerm]) {
        newPlan[toYear][toTerm] = { courses: [] };
      }

      newPlan[toYear][toTerm].courses.push(course);

      return newPlan;
    });

    const fromYearName = years.find(y => y.id === fromYear)?.name || `Year ${fromYear}`;
    const toYearName = years.find(y => y.id === toYear)?.name || `Year ${toYear}`;
    const fromTermLabel = fromTerm.charAt(0).toUpperCase() + fromTerm.slice(1);
    const toTermLabel = toTerm.charAt(0).toUpperCase() + toTerm.slice(1);

    toast.success(`Moved ${course.name || 'course'} from ${fromYearName} ${fromTermLabel} to ${toYearName} ${toTermLabel}`);
  };

  // Add program
  const handleAddProgram = async (type, name) => {
    try {
      // Convert plural state key to singular for API call
      const apiTypeMap = {
        majors: "degree",
        minors: "minor",
        certificates: "certificate",
      };
      const apiType = apiTypeMap[type] || "degree";
      const data = await fetchDegreeRequirements(name, null, apiType);
      console.log("fetchDegreeRequirements result for", name, data);

      setSelectedPrograms((prev) => ({
        ...prev,
        [type]: [...(prev[type] || []), { name, data }],
      }));

      // Show success toast with program type label
      const typeLabels = {
        majors: "Major",
        minors: "Minor",
        certificates: "Certificate",
      };
      toast.success(`${typeLabels[type] || "Program"} "${name}" added`);

      // Auto-populate courses
      if (data.schedule && Array.isArray(data.schedule)) {
        const termMap = { 1: "fall", 2: "spring", 3: "summer" };

        setDegreePlan((prev) => {
          // start from latest state; if empty, initialize a blank plan from `years`
          const base =
            prev && Object.keys(prev).length
              ? JSON.parse(JSON.stringify(prev))
              : (() => {
                  const p = {};
                  years.forEach((y) => {
                    p[y.id] = {
                      fall: { courses: [] },
                      spring: { courses: [] },
                      summer: { courses: [] },
                    };
                  });
                  return p;
                })();

          // Clear existing empty slots in the target year before populating
          const newPlan = JSON.parse(JSON.stringify(prev));
          data.schedule.forEach((semester) => {
            const yearId = parseInt(semester.year, 10);
            const term = termMap[parseInt(semester.term, 10)];

            if (newPlan[yearId] && newPlan[yearId][term]) {
              // remove any course with empty name (placeholder)
              newPlan[yearId][term].courses = newPlan[yearId][
                term
              ].courses.filter((c) => c.name && c.name.trim() !== "");
              // Also update the base reference so subsequent additions use the clean list
              if (base[yearId] && base[yearId][term]) {
                base[yearId][term].courses = newPlan[yearId][term].courses;
              }
            }
          });

          // Build a set of course codes already in the plan to avoid duplicates
          const existingCodes = new Set();
          Object.values(base).forEach((yr) => {
            ["fall", "spring", "summer"].forEach((t) => {
              (yr[t]?.courses || []).forEach((c) => {
                if (c.name) {
                  const m = c.name.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
                  if (m) existingCodes.add(`${m[1].trim().toUpperCase()} ${m[2]}`);
                }
              });
            });
          });

          // --- Smart placement: start after the student's last taken semester ---

          // 1. Find the latest semester that has a taken course (fall/spring only for placement)
          const TERM_SEQ = ["fall", "spring"]; // skip summer for planned course placement
          let lastTakenYear = 0;
          let lastTakenTermIdx = -1;
          Object.entries(base).forEach(([yId, yr]) => {
            TERM_SEQ.forEach((t, ti) => {
              const hasTaken = (yr[t]?.courses || []).some(c => c.status === "taken");
              if (hasTaken) {
                const y = parseInt(yId, 10);
                if (y > lastTakenYear || (y === lastTakenYear && ti > lastTakenTermIdx)) {
                  lastTakenYear = y;
                  lastTakenTermIdx = ti;
                }
              }
            });
          });

          // 2. Compute the next semester after that
          const nextSem = (() => {
            if (lastTakenYear === 0) return { year: 1, termIdx: 0 }; // no taken courses, start at Y1 Fall
            const nextTermIdx = lastTakenTermIdx + 1;
            if (nextTermIdx >= TERM_SEQ.length) return { year: lastTakenYear + 1, termIdx: 0 };
            return { year: lastTakenYear, termIdx: nextTermIdx };
          })();

          // 3. Pre-analyze: find requirements already satisfied by taken courses so we skip placing them
          const takenCoursesForAnalysis = [];
          Object.values(base).forEach(yr => {
            ['fall', 'spring', 'summer'].forEach(t => {
              (yr[t]?.courses || []).forEach(c => {
                if (c.status === 'taken' && c.name && c.credits > 0) {
                  const m = c.name.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
                  const code = m ? `${m[1].trim().toUpperCase()} ${m[2]}` : c.name.toUpperCase();
                  takenCoursesForAnalysis.push({ ...c, code, id: c.id || `${c.name}-taken` });
                }
              });
            });
          });
          const degreeReqsForAnalysis = [];
          data.schedule.forEach(sem => {
            (sem.courses || []).forEach(c => {
              if (c.isNonCredit) return;
              const rawName = c.raw || c.label || '';
              const m = rawName.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
              const code = m ? `${m[1].trim().toUpperCase()} ${m[2]}` : rawName.toUpperCase();
              degreeReqsForAnalysis.push({ ...c, name: rawName, code, credits: c.credits || 0 });
            });
          });
          const preAnalysis = analyzeDegreeProgress(takenCoursesForAnalysis, degreeReqsForAnalysis, {}, degreeMinGrade);
          const alreadyMatchedReqNames = new Set(preAnalysis.matched.map(m => m.name));

          // Also skip complex UCORE aggregate requirements (no [TAG] in name) — these are
          // institutional audit requirements that can't be matched to a single course.
          degreeReqsForAnalysis.forEach(req => {
            if (req.requirementType === 'ucore-slot' && !/\[[A-Z]+\]/.test(req.name)) {
              alreadyMatchedReqNames.add(req.name);
            }
          });

          // 3b. Collect remaining courses from degree schedule IN ORDER (preserves prereq order)
          const remaining = [];
          data.schedule.forEach((semester) => {
            semester.courses.forEach((course) => {
              if (course.isNonCredit) return;
              const rawName = course.raw || course.label || "";
              // Skip if already satisfied by a taken course
              if (alreadyMatchedReqNames.has(rawName)) return;
              const codeMatch = rawName.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
              if (codeMatch) {
                const code = `${codeMatch[1].trim().toUpperCase()} ${codeMatch[2]}`;
                if (existingCodes.has(code)) return;
                existingCodes.add(code);
              } else {
                // Generic/elective — still include, use raw name as key to avoid dupes
                if (existingCodes.has(`__${rawName}`)) return;
                existingCodes.add(`__${rawName}`);
              }
              remaining.push({
                id: Date.now() + Math.random(),
                name: rawName,
                credits: course.credits || 0,
                grade: "",
                status: "planned",
                footnotes: course.footnotes || [],
                prefix: course.prefix,
                number: course.number,
                attributes: course.attributes || [],
                prerequisites: course.prerequisiteCodes || course.prerequisites || [],
              });
            });
          });

          // 4. Place remaining courses into semesters starting at nextSem, ~15 cr/sem
          const MAX_CREDITS_PER_SEM = 15;
          let curYear = nextSem.year;
          let curTermIdx = nextSem.termIdx;
          let semCredits = 0;

          const advanceSemester = () => {
            curTermIdx++;
            if (curTermIdx >= TERM_SEQ.length) { curYear++; curTermIdx = 0; }
            semCredits = 0;
            // Ensure the year slot exists in base
            if (!base[curYear]) {
              base[curYear] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
            }
          };

          // Ensure starting slot exists
          if (!base[curYear]) {
            base[curYear] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
          }

          remaining.forEach((course) => {
            // If adding this course would exceed limit, move to next semester
            if (semCredits + (course.credits || 0) > MAX_CREDITS_PER_SEM && semCredits > 0) {
              advanceSemester();
            }
            const term = TERM_SEQ[curTermIdx];
            base[curYear][term].courses.push(course);
            semCredits += course.credits || 0;
          });

          // Sync year tabs: add any new year IDs the placement created
          const planYearIds = Object.keys(base).map(Number).sort((a, b) => a - b);
          setYears(prev => {
            const existingIds = new Set(prev.map(y => y.id));
            const toAdd = planYearIds.filter(id => !existingIds.has(id)).map(id => ({ id, name: `Year ${id}` }));
            return toAdd.length > 0 ? [...prev, ...toAdd].sort((a, b) => a.id - b.id) : prev;
          });

          return base;
        });
      }
    } catch (error) {
      console.error("Error adding program:", error);
      toast.error("Error loading program requirements");
    }
  };

  // Remove a program (major, minor, or certificate)
  const handleRemoveProgram = (type, name) => {
    setSelectedPrograms((prev) => ({
      ...prev,
      [type]: prev[type].filter((p) => p.name !== name),
    }));
    toast.success(`Removed ${name}`);
  };

  // Optimize schedule
  const handleOptimize = async () => {
    try {
      const result = await optimizeSchedule({
        degreePlan,
        selectedYear,
        years,
        optimizeSpeed,
        includeSummer,
        ensureFullTime
      });
      
      // Handle legacy return (just the plan) or new return ({ degreePlan, years })
      const newPlan = result.degreePlan || result;
      const newYears = result.newYears || null;

      if (newYears) {
          setYears(newYears);
      }
      setDegreePlan(newPlan);
      
      setShowOptimizeModal(false);
      toast.success("Schedule optimized!");
    } catch (e) {
      console.error("Optimize failed", e);
      toast.error("Optimization failed");
    }
  };

  // Helper: open explicitly (Browse Full Catalog button)
  const openCatalogModal = (initialYear) => {
    setCatalogModalYear(initialYear || selectedYear || catalogYears[0] || "");
    setCatalogModalTerm("fall");
    setCatalogTarget(null);
    setCatalogTargetCourse(null);
    setShowCatalogModal(true);
  };

  // --- Catalog course picker (wrapper) ---
  const openCatalogForCourse = async (courseId, yearId, termName) => {
    const target = { courseId, yearId, term: termName };
    setCatalogTarget(target);
    
    // Determine the course object to pass as context
    const findCourseById = (id) => {
      for (const y of Object.keys(degreePlan || {})) {
        for (const t of ["fall", "spring", "summer"]) {
          const list = degreePlan[y]?.[t]?.courses || [];
          for (const c of list) if (c.id === id) return c;
        }
      }
      return null;
    };
    const courseObj = findCourseById(courseId);
    setCatalogTargetCourse(courseObj);

    // Set initial context for the picker
    setCatalogModalYear(selectedYear || catalogYears[0] || "");
    setCatalogModalTerm(termName || "fall");
    
    // Open the picker
    setShowCatalogModal(true);
  };

  // Export to Excel (Matches user provided WSU Degree Plan image)
  const handleExport = async () => {
    await exportToExcel({
      years,
      degreePlan,
      selectedPrograms,
      selectedYear,
      calculateCreditsRequired,
    });
  };

  // Print/Save as PDF
  const handlePrintPDF = () => {
    printDegreePlan({
      selectedPrograms,
      selectedYear,
      gpa,
      creditsAchieved,
      creditsPlanned,
      creditsRequired,
      years,
      degreePlan,
    });
  };

  // Export to Calendar (ICS)
  const handleExportICS = async () => {
    await exportToICS({
      degreePlan,
      years
    });
  };

  // Import from Excel (prefer hidden JSON backup for perfect round-trip)
  const handleImport = async (e) => {
    const file = e.target.files[0];
    await importFromExcel(file, {
      years, // Pass current years state for scaffolding if legacy
      setYears,
      setDegreePlan,
      setSelectedPrograms,
    });
  };

  // ── Transcript import ────────────────────────────────────────────────────
  const [transcriptModal, setTranscriptModal] = useState(null); // null | { student, courses }
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [degreeSuggestModal, setDegreeSuggestModal] = useState(null); // null | { raw, candidates }

  const handleImportTranscript = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-uploaded
    setTranscriptLoading(true);
    const toastId = toast.loading('Parsing transcript…');
    try {
      const formData = new FormData();
      formData.append('transcript', file);
      const apiBase = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/parse-transcript`, { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      toast.success('Transcript parsed — review and confirm below', { id: toastId });
      setTranscriptModal(data);
    } catch (err) {
      toast.error(`Transcript import failed: ${err.message}`, { id: toastId });
    } finally {
      setTranscriptLoading(false);
    }
  };

  const applyTranscriptCourses = (courses) => {
    const TERM_MAP = { fall: 1, spring: 2, summer: 3 };
    const termFromString = (t) => {
      if (!t) return { yearIdx: 0, term: 'fall' };
      const lower = t.toLowerCase();
      const yearMatch = t.match(/\d{4}/);
      const calYear = yearMatch ? parseInt(yearMatch[0], 10) : 2022;
      const term = lower.includes('spring') ? 'spring' : lower.includes('summer') ? 'summer' : 'fall';
      // Map calendar year + term to academic year index (Year 1 = first fall)
      // Find the earliest year across all courses to establish baseline
      return { calYear, term };
    };

    // Determine academic year baseline (earliest fall = Year 1)
    const calYears = courses.map(c => termFromString(c.term).calYear);
    const minCal = Math.min(...calYears);

    const academicYear = (calYear, term) => {
      // Fall of minCal = Year 1 Fall; Spring/Summer after that fall = Year 1 Spring/Summer
      // Fall of minCal+1 = Year 2 Fall, etc.
      const fallYear = term === 'spring' || term === 'summer' ? calYear - 1 : calYear;
      return Math.max(1, fallYear - minCal + 1);
    };

    setDegreePlan(prev => {
      const next = JSON.parse(JSON.stringify(prev));

      // Ensure enough year slots exist
      const maxYear = Math.max(...courses.map(c => {
        const { calYear, term } = termFromString(c.term);
        return academicYear(calYear, term);
      }));
      setYears(y => {
        const existing = y.map(yr => yr.id);
        const extra = [];
        for (let i = existing.length + 1; i <= maxYear; i++) {
          extra.push({ id: i, name: `Year ${i}` });
        }
        return extra.length ? [...y, ...extra] : y;
      });

      // Build a set of course codes already in the plan to avoid duplicates
      const existingCodes = new Set();
      Object.values(next).forEach(yr => {
        ['fall', 'spring', 'summer'].forEach(t => {
          (yr[t]?.courses || []).forEach(c => {
            if (c.name) existingCodes.add(c.name.trim().toUpperCase());
          });
        });
      });

      courses.forEach(course => {
        const courseName = `${course.prefix} ${course.number}`;
        if (existingCodes.has(courseName.toUpperCase())) return; // skip duplicate
        existingCodes.add(courseName.toUpperCase());

        const { calYear, term } = termFromString(course.term);
        const yr = academicYear(calYear, term);
        if (!next[yr]) next[yr] = { fall: { courses: [] }, spring: { courses: [] }, summer: { courses: [] } };
        // Remove any empty placeholder slot
        next[yr][term].courses = next[yr][term].courses.filter(c => c.name && c.name.trim() !== '');
        next[yr][term].courses.push({
          id: Date.now() + Math.random(),
          name: courseName,
          credits: course.credits || 0,
          grade: course.grade || '',
          status: course.grade ? 'taken' : 'planned',
          attributes: course.ucore || [],
        });
      });

      return next;
    });

    setTranscriptModal(null);
    toast.success('Transcript courses added to your degree plan');

    // Suggest degree from transcript — always ask, never auto-assume
    if (transcriptModal?.student?.major && degrees.length > 0) {
      const majorText = transcriptModal.student.major.toUpperCase();
      // Strip degree-type prefixes only; strip punctuation so "Science," → "Science"
      const stopWords = /\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|BACHELOR|MASTER|OF|IN|THE|AND|OR)\b/gi;
      const words = majorText
        .replace(stopWords, '')
        .replace(/[,;:.()]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 2);

      if (words.length > 0) {
        const scored = degrees.map(d => {
          const dName = d.name.toUpperCase();
          // Whole-word match so "SCIENCE" doesn't match "SCIENCES"
          const hits = words.filter(w => {
            const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${esc}\\b`).test(dName);
          }).length;
          return { degree: d, hits };
        }).filter(s => s.hits > 0).sort((a, b) => b.hits - a.hits);

        // Take top 3 candidates to show in the picker
        const candidates = scored.slice(0, 3).map(s => s.degree);
        if (candidates.length > 0) {
          setDegreeSuggestModal({
            raw: transcriptModal.student.major,
            candidates,
          });
        }
      }
    }
  };

  // Reset / delete entire degree plan and selected programs
  const handleResetPlan = () => {
    const ok = window.confirm(
      "Reset degree plan and selected programs? This cannot be undone."
    );
    if (!ok) return;

    const defaultYears = [
      { id: 1, name: "Year 1" },
      { id: 2, name: "Year 2" },
      { id: 3, name: "Year 3" },
      { id: 4, name: "Year 4" },
    ];

    const emptyPlan = {};
    defaultYears.forEach((y, idx) => {
      emptyPlan[y.id] = {
        fall: {
          courses: [
            {
              id: Date.now() + idx * 10 + 1,
              name: "",
              credits: 0,
              grade: "",
              status: "not-taken",
            },
          ],
        },
        spring: {
          courses: [
            {
              id: Date.now() + idx * 10 + 2,
              name: "",
              credits: 0,
              grade: "",
              status: "not-taken",
            },
          ],
        },
        summer: {
          courses: [
            {
              id: Date.now() + idx * 10 + 3,
              name: "",
              credits: 0,
              grade: "",
              status: "not-taken",
            },
          ],
        },
      };
    });

    setYears(defaultYears);
    setDegreePlan(emptyPlan);
    setSelectedPrograms({ majors: [], minors: [], certificates: [] });
    // Persist cleared plan
    try {
      saveDegreePlan({
        plan: emptyPlan,
        years: defaultYears,
        programs: { majors: [], minors: [], certificates: [] },
      });
      console.debug("[DegreePlanner] reset saved to storage");
    } catch (e) {
      console.error("Failed to save reset plan:", e);
    }
  };

  // Close grade scale modal on Escape key
  useEffect(() => {
    if (!showGradeScale) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowGradeScale(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showGradeScale]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl/Cmd + Z
      if (ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        toast.success("Undone");
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (
        (ctrlKey && e.shiftKey && e.key === "z") ||
        (ctrlKey && e.key === "y")
      ) {
        e.preventDefault();
        redo();
        toast.success("Redone");
      }

      // Show keyboard shortcuts: ?
      if (e.key === "?" && !ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleCalcClose = useCallback(() => {
    setShowClassCalc(false);
    setClassCalcCourseName(null);
    setClassCalcCourseId(null);
  }, []);

  const handleGradeUpdate = useCallback((_gradeValue, letterGrade) => {
    if (!classCalcCourseId) return;
    if (!letterGrade) return;
    setDegreePlan(prev => {
      const newPlan = JSON.parse(JSON.stringify(prev));
      let found = false;
      Object.keys(newPlan).forEach(yearId => {
        ['fall', 'spring', 'summer'].forEach(term => {
          if (found) return;
          const courses = newPlan[yearId][term].courses || [];
          courses.forEach(c => {
            if (c.id === classCalcCourseId) {
              c.grade = letterGrade;
              if (c.status !== 'taken') c.status = 'in-progress';
              found = true;
            }
          });
        });
      });
      return newPlan;
    });
  }, [classCalcCourseId]);

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <DegreePlannerHeader
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onOptimize={() => setShowOptimizeModal(true)}
        onExport={handleExport}
        onPrintPDF={handlePrintPDF}
        onExportICS={handleExportICS}
        onImport={handleImport}
        onImportTranscript={handleImportTranscript}
        onReset={handleResetPlan}
        onWhatIf={() => setShowWhatIfModal(true)}
      />

      {/* Statistics */}
      <DegreePlannerStats
        showGradeScale={showGradeScale}
        setShowGradeScale={setShowGradeScale}
        gpa={gpa}
        creditsAchieved={creditsAchieved}
        creditsPlanned={creditsPlanned}
        creditsRequired={creditsRequired}
        progress={progress}
        belowMinGradeCount={progressAnalysis.belowMinGradeCount || 0}
        degreeMinGrade={degreeMinGrade}
        graduationProjection={graduationProjection}
      />

      {/* Degree Progress Bar */}
      {creditsRequired > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-gray-800">Degree Progress</h4>
            <span className="text-sm font-medium text-gray-600">
              {Math.min(
                Math.round((creditsAchieved / creditsRequired) * 100),
                100
              )}
              % Complete
            </span>
          </div>

          {/* Main Progress Bar */}
          <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
            {/* Achieved (green) */}
            <div
              className="absolute h-full bg-green-500 transition-all duration-500"
              style={{
                width: `${Math.min(
                  (creditsAchieved / creditsRequired) * 100,
                  100
                )}%`,
              }}
            />
            {/* Planned but not achieved (blue striped) */}
            <div
              className="absolute h-full bg-blue-400 opacity-60 transition-all duration-500"
              style={{
                left: `${Math.min(
                  (creditsAchieved / creditsRequired) * 100,
                  100
                )}%`,
                width: `${Math.max(
                  Math.min(
                    ((creditsPlanned - creditsAchieved) / creditsRequired) *
                      100,
                    100 - (creditsAchieved / creditsRequired) * 100
                  ),
                  0
                )}%`,
              }}
            />
            {/* Percentage label inside bar */}
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow">
              {creditsAchieved} / {creditsRequired} credits
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-gray-600">
                Completed ({creditsAchieved} cr)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-400 rounded"></div>
              <span className="text-gray-600">
                In Progress / Planned ({creditsPlanned - creditsAchieved} cr)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-200 rounded"></div>
              <span className="text-gray-600">
                Remaining ({Math.max(creditsRequired - creditsPlanned, 0)} cr)
              </span>
            </div>
          </div>

          {/* Milestones */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div
                className={`p-2 rounded ${
                  creditsAchieved >= 30
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <div className="font-semibold">30 cr</div>
                <div>Sophomore</div>
              </div>
              <div
                className={`p-2 rounded ${
                  creditsAchieved >= 60
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <div className="font-semibold">60 cr</div>
                <div>Junior</div>
              </div>
              <div
                className={`p-2 rounded ${
                  creditsAchieved >= 90
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <div className="font-semibold">90 cr</div>
                <div>Senior</div>
              </div>
              <div
                className={`p-2 rounded ${
                  creditsAchieved >= creditsRequired
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <div className="font-semibold">{creditsRequired} cr</div>
                <div>Graduate</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grade Scale Modal */}
      <GradeScaleModal
        show={showGradeScale}
        onClose={() => setShowGradeScale(false)}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        show={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      {/* Class Grade Calculator modal (opened per-course) */}
      {showClassCalc && (
        <ClassGradeCalculator
          courseName={classCalcCourseName}
          onClose={handleCalcClose}
          onUpdateGrade={handleGradeUpdate}
        />
      )}

      {/* Catalog Course Picker Modal */}
      <CatalogPicker
        show={showCatalogModal}
        onClose={() => {
          setShowCatalogModal(false);
          setCatalogTarget(null);
          setCatalogTargetCourse(null);
        }}
        target={catalogTarget}
        targetCourse={catalogTargetCourse}
        initialYear={catalogModalYear}
        initialTerm={catalogModalTerm}
        degreePlan={degreePlan}
        setDegreePlan={setDegreePlan}
        years={years}
        activeYearTab={activeYearTab}
        selectedPrograms={selectedPrograms}
      />

      {/* Degree Selection */}
      <DegreeSelector
        catalogYears={catalogYears}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        degreeFilterType={degreeFilterType}
        setDegreeFilterType={setDegreeFilterType}
        degreeSortBy={degreeSortBy}
        setDegreeSortBy={setDegreeSortBy}
        degreeSearch={degreeSearch}
        setDegreeSearch={setDegreeSearch}
        showDegreeSuggestions={showDegreeSuggestions}
        setShowDegreeSuggestions={setShowDegreeSuggestions}
        degreeInputRef={degreeInputRef}
        degrees={degrees}
        selectedPrograms={selectedPrograms}
        handleAddProgram={handleAddProgram}
        handleRemoveProgram={handleRemoveProgram}
      />

      {/* Year Tabs */}
      <div className="bg-white rounded-lg shadow">
        {/* Tab Headers */}
        <div className="border-b border-gray-200 flex items-center">
          <div className="flex overflow-x-auto flex-1">
            {years.map((year) => (
              <button
                key={year.id}
                onClick={() => setActiveYearTab(year.id)}
                className={`px-6 py-3 font-medium transition whitespace-nowrap ${
                  activeYearTab === year.id
                    ? "text-wsu-crimson border-b-2 border-wsu-crimson"
                    : "text-gray-600 hover:text-gray-900"
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
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            {years.length > 1 && (
              <button
                onClick={() => handleDeleteYear(activeYearTab)}
                className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition"
                title="Delete Current Year"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {years
            .filter((year) => year.id === activeYearTab)
            .map((year) => (
              <YearSection
                key={year.id}
                year={year}
                degreePlan={degreePlan}
                setDegreePlan={setDegreePlan}
                onDeleteYear={() => handleDeleteYear(year.id)}
                canDelete={years.length > 1}
                hideHeader={true}
                openCatalogForCourse={openCatalogForCourse}
                openClassCalc={(courseId, name) => {
                  console.log("[DegreePlanner] openClassCalc ->", courseId, name);
                  setClassCalcCourseId(courseId);
                  setClassCalcCourseName(name || "Course");
                  setShowClassCalc(true);
                }}
                onMoveClick={handleMoveClick}
                activeTermTab={activeTermTab}
                setActiveTermTab={setActiveTermTab}
                allCompletedCourses={allCompletedCourses}
                duplicateCourses={duplicateCourses}
              />
            ))}
        </div>
      </div>

      {/* Optimize Modal */}
      <OptimizeModal
        show={showOptimizeModal}
        onClose={() => setShowOptimizeModal(false)}
        optimizeSpeed={optimizeSpeed}
        setOptimizeSpeed={setOptimizeSpeed}
        includeSummer={includeSummer}
        setIncludeSummer={setIncludeSummer}
        ensureFullTime={ensureFullTime}
        setEnsureFullTime={setEnsureFullTime}
        onOptimize={handleOptimize}
      />

      {/* What-If Analysis Modal */}
      <WhatIfModal 
        show={showWhatIfModal}
        onClose={() => setShowWhatIfModal(false)}
        degreePlan={degreePlan}
        onApply={handleApplyWhatIf}
      />

      {/* Course Move Modal */}
      <CourseDestinationPicker
        show={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        course={moveModalData.course}
        currentYear={moveModalData.fromYear}
        currentTerm={moveModalData.fromTerm}
        years={years}
        onMove={handleMoveCourse}
      />

      {/* Transcript Review Modal */}
      {transcriptModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-6 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col my-auto">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Review Transcript</h2>
                {transcriptModal.student && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {transcriptModal.student.name} · {transcriptModal.student.major}
                  </p>
                )}
              </div>
              <button
                onClick={() => setTranscriptModal(null)}
                className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="px-4 pt-3 pb-1 text-xs text-gray-500 dark:text-gray-400">
              Review courses extracted from your transcript. You can edit anything after importing.
            </p>

            {/* Sticky column header — outside the scroll container so it never moves */}
            <div className="px-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <th className="text-left px-2 py-1.5 font-medium text-xs w-28">Course</th>
                    <th className="text-left px-2 py-1.5 font-medium text-xs">Name</th>
                    <th className="text-center px-2 py-1.5 font-medium text-xs w-8">Cr</th>
                    <th className="text-center px-2 py-1.5 font-medium text-xs w-16">Grade</th>
                    <th className="text-left px-2 py-1.5 font-medium text-xs w-24">Term</th>
                  </tr>
                </thead>
              </table>
            </div>

            {/* Scrollable body only */}
            <div className="overflow-y-auto px-4 pb-3" style={{ maxHeight: '52vh' }}>
              <table className="w-full text-sm border-collapse">
                <colgroup>
                  <col className="w-28" />
                  <col />
                  <col className="w-8" />
                  <col className="w-16" />
                  <col className="w-24" />
                </colgroup>
                <tbody>
                  {(transcriptModal.courses || []).map((c, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-2 py-1 font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {c.prefix} {c.number}
                      </td>
                      <td className="px-2 py-1 text-xs text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{c.name}</td>
                      <td className="px-2 py-1 text-center text-xs text-gray-700 dark:text-gray-300">{c.credits}</td>
                      <td className="px-2 py-1 text-center">
                        {c.grade ? (
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.grade}</span>
                        ) : (
                          <span className="text-xs text-blue-600 dark:text-blue-400 italic">In Progress</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{c.term}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setTranscriptModal(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => applyTranscriptCourses(transcriptModal.courses || [])}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Add {transcriptModal.courses?.length || 0} Courses to Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Degree Suggestion Modal — shown after transcript import */}
      {degreeSuggestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">What is your degree?</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Your transcript lists <strong>{degreeSuggestModal.raw}</strong>. Select the degree that matches, or skip to choose manually.
              </p>
            </div>
            <div className="px-5 py-3 space-y-2">
              {degreeSuggestModal.candidates.map((d) => {
                const typeMap = { major: 'majors', minor: 'minors', certificate: 'certificates' };
                const programType = typeMap[d.degree_type] || 'majors';
                const typeLabelMap = { major: 'Major', minor: 'Minor', certificate: 'Certificate' };
                const typeLabel = typeLabelMap[d.degree_type] || 'Major';
                const typeColor = d.degree_type === 'minor' ? 'bg-green-100 text-green-700' : d.degree_type === 'certificate' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';
                return (
                  <button
                    key={d.id || `${d.name}-${d.degree_type}`}
                    onClick={() => {
                      setDegreeSuggestModal(null);
                      handleAddProgram(programType, d.name);
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition text-sm text-gray-800 dark:text-gray-200 flex items-center justify-between"
                  >
                    <span>{d.name}</span>
                    <span className={`ml-3 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${typeColor}`}>
                      {typeLabel}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setDegreeSuggestModal(null)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Skip — I'll pick my degree manually
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DegreePlanner;
