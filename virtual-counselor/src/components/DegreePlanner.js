import React, { useState, useEffect, useRef } from "react";
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
  analyzeDegreeProgress
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

  const progressAnalysis = React.useMemo(() => {
      // Use the generic analyzer which handles duplicates/consumption
      return analyzeDegreeProgress(flatUserCourses, allRequiredCourses, refinements);
  }, [flatUserCourses, allRequiredCourses, refinements]);


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
  
  // New Credits Achieved based on Analysis (only count MATCHED courses that are COMPLETED)
  const creditsAchievedSmart = progressAnalysis.matched.reduce((sum, m) => {
      // Check if the matched user course is actually completed (has grade and is taken)
      const isCompleted = m.matchedCourse && m.matchedCourse.status === "taken" && m.matchedCourse.grade &&
                     ["A", "A-", "B+", "B", "B-", "C+", "C", "P"].includes(m.matchedCourse.grade);
      return sum + (isCompleted ? (m.matchedCourse.credits || m.credits || 0) : 0);
  }, 0);

  // New Credits Planned (Smart) - count all matched (planned or taken)
  const creditsPlannedSmart = progressAnalysis.matched.reduce((sum, m) => sum + (m.credits || 0), 0);
  
  // New Credits Required = analysis total
  const creditsRequiredSmart = progressAnalysis.totalRequiredCredits || 120; // Fallback?

  // Override the naive variables
  const creditsAchieved = creditsAchievedSmart; 
  const creditsPlanned = creditsPlannedSmart;
  const creditsRequired = creditsRequiredSmart;

  // Compute list of completed course codes for prerequisite checking
  const allCompletedCourses = React.useMemo(() => {
    return getCompletedCourses(degreePlan);
  }, [degreePlan]);

  // Detect duplicate courses across the degree plan
  const duplicateCourses = React.useMemo(() => {
    return getDuplicateCourses(degreePlan);
  }, [degreePlan]);

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
        majors: "major",
        minors: "minor",
        certificates: "certificate",
      };
      const apiType = apiTypeMap[type] || type;
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

          // Now populate
          data.schedule.forEach((semester) => {
            const yearId = parseInt(semester.year, 10);
            const term = termMap[parseInt(semester.term, 10)];
            if (!base[yearId]) {
              base[yearId] = {
                fall: { courses: [] },
                spring: { courses: [] },
                summer: { courses: [] },
              };
            }

            if (base[yearId] && base[yearId][term]) {
              semester.courses.forEach((course) => {
                if (course.isNonCredit) return;
                base[yearId][term].courses.push({
                  id: Date.now() + Math.random(),
                  name: course.raw || course.label || "",
                  credits: course.credits || 0,
                  grade: "",
                  status: "planned",
                  footnotes: course.footnotes || [],
                  prefix: course.prefix,
                  number: course.number,
                  attributes: course.attributes || [],
                  prerequisites:
                    course.prerequisiteCodes || course.prerequisites || [],
                });
              });
            }
          });

          // Log counts per year/term before returning state
          try {
            const counts = Object.keys(base).map((y) => ({
              year: y,
              fall: (base[y].fall?.courses || []).length,
              spring: (base[y].spring?.courses || []).length,
              summer: (base[y].summer?.courses || []).length,
            }));
            console.log("newPlan populated counts", counts);
          } catch (e) {
            console.log("Error computing newPlan counts", e);
          }

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
          onClose={() => {
            setShowClassCalc(false);
            setClassCalcCourseName(null);
            setClassCalcCourseId(null);
          }}
          onUpdateGrade={(gradeValue, letterGrade) => {
             // Find and update the course
             if (!classCalcCourseId) return;
             
             setDegreePlan(prev => {
                const newPlan = JSON.parse(JSON.stringify(prev));
                let found = false;
                
                Object.keys(newPlan).forEach(yearId => {
                   ['fall', 'spring', 'summer'].forEach(term => {
                      if (found) return;
                      const courses = newPlan[yearId][term].courses || [];
                      courses.forEach(c => {
                         if (c.id === classCalcCourseId) {
                            if (letterGrade) {
                               c.grade = letterGrade;
                               // Only switch to in-progress if not already taken (don't downgrade status)
                               if (c.status !== 'taken') {
                                  c.status = 'in-progress';
                               }
                            } else {
                               // Grade cleared
                               c.grade = '';
                               // Revert in-progress to planned
                               if (c.status === 'in-progress') {
                                  c.status = 'planned';
                               }
                            }
                            found = true;
                         }
                      });
                   });
                });
                return newPlan;
             });
          }}
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
    </div>
  );
}

export default DegreePlanner;
