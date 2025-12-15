import { GRADE_POINTS } from "../components/degree-planner/CourseRow";

/**
 * Calculates the GPA based on the degree plan.
 * @param {Object} degreePlan - The degree plan object.
 * @returns {string} - The calculated GPA formatted to 2 decimal places.
 */
export const calculateGPA = (degreePlan) => {
  let totalPoints = 0;
  let totalCredits = 0;

  Object.values(degreePlan).forEach((year) => {
    ["fall", "spring", "summer"].forEach((term) => {
      year[term]?.courses.forEach((course) => {
        if (course.status === "taken" && course.grade && course.credits > 0) {
          const points = (GRADE_POINTS[course.grade] || 0) * course.credits;
          totalPoints += points;
          totalCredits += course.credits;
        }
      });
    });
  });

  return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : "0.00";
};

/**
 * Calculates the total credits achieved (passed courses).
 * @param {Object} degreePlan - The degree plan object.
 * @returns {number} - The total credits achieved.
 */
export const calculateCreditsAchieved = (degreePlan) => {
  let credits = 0;
  Object.values(degreePlan).forEach((year) => {
    ["fall", "spring", "summer"].forEach((term) => {
      year[term]?.courses.forEach((course) => {
        if (
          course.status === "taken" &&
          course.grade &&
          ["A", "A-", "B+", "B", "B-", "C+", "C", "P"].includes(course.grade)
        ) {
          credits += course.credits || 0;
        }
      });
    });
  });
  return credits;
};

/**
 * Calculates the total credits planned (all courses with credits).
 * @param {Object} degreePlan - The degree plan object.
 * @returns {number} - The total credits planned.
 */
export const calculateCreditsPlanned = (degreePlan) => {
  let credits = 0;
  Object.values(degreePlan).forEach((year) => {
    ["fall", "spring", "summer"].forEach((term) => {
      year[term]?.courses.forEach((course) => {
        if (course.name && course.credits > 0) {
          credits += course.credits;
        }
      });
    });
  });
  return credits;
};

/**
 * Calculates the total credits required based on selected programs.
 * @param {Object} selectedPrograms - The selected programs (majors, minors, certificates).
 * @returns {number} - The total credits required.
 */
export const calculateCreditsRequired = (selectedPrograms) => {
  // Compute required credits from selected program metadata when available.
  // Each selected program entry may be { name, data } where data may include credits/totalHours.
  let total = 0;
  const majors = selectedPrograms.majors || [];
  const minors = selectedPrograms.minors || [];
  const certs = selectedPrograms.certificates || [];

  const creditsFromProgram = (p) => {
    if (!p) return 0;
    if (typeof p === "number") return p;
    if (p.data) {
      return (
        p.data.totalHours || p.data.credits || p.data.creditsRequired || 0
      );
    }
    return 0;
  };

  majors.forEach((m) => {
    total += creditsFromProgram(m) || 120;
  });
  minors.forEach((m) => {
    total += creditsFromProgram(m) || 18;
  });
  certs.forEach((c) => {
    total += creditsFromProgram(c) || 15;
  });

  // If nothing selected, don't default to 120 — return 0 so UI shows 'Not Started'
  if (majors.length + minors.length + certs.length === 0) return 0;

  // Adjust for simple overlap estimate when multiple majors
  if (majors.length > 1) total -= 40 * (majors.length - 1);

  return total;
};

/**
 * Extract list of completed course codes.
 * @param {Object} degreePlan 
 * @returns {Array<string>} List of completed course codes
 */
export const getCompletedCourses = (degreePlan) => {
  const completed = [];
  Object.values(degreePlan).forEach((year) => {
    ["fall", "spring", "summer"].forEach((term) => {
      year[term]?.courses.forEach((course) => {
        if (course.status === "taken" && course.name) {
          // Extract course code from name (e.g., "CPTS 121" or "CPTS 121 [QUAN]")
          const match = course.name.match(/^([A-Z]{2,6}\s*\d{3})/i);
          if (match) {
            completed.push(match[1].toUpperCase().replace(/\s+/g, " "));
          }
        }
      });
    });
  });
  return completed;
};

/**
 * Detect duplicate courses across the degree plan.
 * @param {Object} degreePlan 
 * @returns {Set<string>} Set of duplicate course codes
 */
export const getDuplicateCourses = (degreePlan) => {
  const courseOccurrences = {};
  const duplicates = new Set();

  Object.entries(degreePlan).forEach(([, yearData]) => {
    ["fall", "spring", "summer"].forEach((term) => {
      yearData[term]?.courses.forEach((course) => {
        if (course.name) {
          // Robust extraction matching analyzeDegreeProgress
          const match = course.name.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
          if (match) {
            const code = `${match[1].trim().toUpperCase()} ${match[2]}`;
            if (courseOccurrences[code]) {
              duplicates.add(code);
            } else {
              courseOccurrences[code] = true;
            }
          }
        }
      });
    });
  });

  return duplicates;
};

/**
 * Analyzes "What-If" scenario: switching to a new major.
 * @param {Object} degreePlan - Current degree plan
 * @param {Object} newMajorData - Requirements data for new major
 * @returns {Object} Analysis result { matched, missing, netCredits }
 */
/**
 * Core logic for matching courses against requirements with duplicate prevention.
 * @param {Array} userCourses - Flattened list of user courses
 * @param {Array} requiredCourses - Flattened list of requirements
 * @param {Object} refinements - Manual overrides/refinements
 * @returns {Object} { matched, missing, missingCredits, totalRequiredCredits }
 */
export const analyzeDegreeProgress = (userCourses, requiredCourses, refinements = {}) => {
  const matched = [];
  const missing = [];
  const usedUserCourseIds = new Set();
  
  // Create a copy of userCourses and SORT by priority
  // Priority: Taken & Passing > In-Progress > Planned > Not-Taken/Failed
  // This ensures requirements grab the "best" available course first.
  const passingGrades = new Set(["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "P", "S"]); // Typical passing
  const getScore = (c) => {
      if (c.status === "taken" && c.grade && passingGrades.has(c.grade)) return 4;
      if (c.status === "in-progress") return 3;
      if (c.status === "planned") return 2;
      return 1; // Failed or not taken
  };

  // Sort user courses descending by score
  const sortedUserCourses = [...userCourses].sort((a, b) => getScore(b) - getScore(a));
  
  // Sort requirements: Put refined ones first
  const sortedRequirements = [...requiredCourses].sort((a, b) => {
      const aRefined = !!refinements[a.name];
      const bRefined = !!refinements[b.name];
      return bRefined - aRefined; 
  });

  sortedRequirements.forEach(req => {
     let matchFound = null;

     // Priority 1: Refinement (User manually linked a requirement to a specific course OR marked as met)
     if (refinements[req.name]) {
        if (refinements[req.name] === true) {
            // Manually met override
            matchFound = { 
                code: "MET", 
                name: "Manually Marked as Met", 
                credits: req.credits || 0, 
                id: `manual-${req.name}` 
            };
        } else {
            const refinedCode = refinements[req.name];
            // Look in sorted list
            matchFound = sortedUserCourses.find(uc => 
                !usedUserCourseIds.has(uc.id) && 
                uc.code === refinedCode
            );
        }
     }

     // Priority 2: Exact Code Match
     if (!matchFound) {
        matchFound = sortedUserCourses.find(uc => 
            !usedUserCourseIds.has(uc.id) && 
            uc.code === req.code
        );
     }

     // Priority 3: Partial/OR Match
     if (!matchFound) {
        matchFound = sortedUserCourses.find(uc => {
            if (usedUserCourseIds.has(uc.id)) return false;
            const escaped = uc.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            return regex.test(req.name) || regex.test(req.code);
        });
     }

     if (matchFound) {
        matched.push({ ...req, matchedCourse: matchFound });
        // Only mark as used if it's a real course (not a manual "true" override)
        if (matchFound.id && !matchFound.id.toString().startsWith('manual-')) {
            usedUserCourseIds.add(matchFound.id);
        }
     } else {
        missing.push(req);
     }
  });

  const missingCredits = missing.reduce((sum, c) => sum + (c.credits || 0), 0);
  const totalRequiredCredits = requiredCourses.reduce((sum, c) => sum + (c.credits || 0), 0);

  return {
    matched,
    missing,
    missingCredits,
    totalRequiredCredits,
    usedUserCourseIds
  };
};

/**
 * Analyzes "What-If" scenario: switching to a new major.
 * @param {Object} degreePlan - Current degree plan
 * @param {Object} newMajorData - Requirements data for new major
 * @returns {Object} Analysis result { matched, missing, netCredits }
 */
export const analyzeWhatIf = (degreePlan, newMajorData, refinements = {}) => {
  // 1. Flatten current user courses
  const userCourses = [];
  Object.values(degreePlan).forEach(year => {
    ["fall", "spring", "summer"].forEach(term => {
      year[term]?.courses.forEach(c => {
        if (c.name && c.credits > 0) {
           // Normalize: "CPTS 121 [QUAN]" -> "CPTS 121"
           const match = c.name.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
           const code = match ? `${match[1].trim().toUpperCase()} ${match[2]}` : c.name.toUpperCase();
           userCourses.push({ ...c, code, id: c.id || `${c.name}-${Math.random()}` }); 
        }
      });
    });
  });

  // 2. Flatten new major requirements
  const requiredCourses = [];
  // Normalize input to array
  const programs = Array.isArray(newMajorData) ? newMajorData : [newMajorData];
  
  programs.forEach(program => {
    if (program && program.schedule) {
      program.schedule.forEach(sem => {
         const courses = sem.courses || []; 
         courses.forEach(c => {
            const rawName = c.raw || c.courseCode || c.name;
            if (rawName) {
               let code = rawName;
               // Try to extract strict code if possible
               const match = rawName.match(/^([A-Z\s&/]{2,15})\s*(\d{3})/i);
               if (match) {
                 code = `${match[1].trim().toUpperCase()} ${match[2]}`;
                 requiredCourses.push({ ...c, name: rawName, code, credits: c.credits || 3 });
               } else {
                 // It's a placeholder or generic
                 requiredCourses.push({ ...c, name: rawName, code: rawName, credits: c.credits || 3, isPlaceholder: true });
               }
            }
         });
      });
    }
  });

  const result = analyzeDegreeProgress(userCourses, requiredCourses, refinements);

  return {
    matched: result.matched,
    missing: result.missing,
    missingCredits: result.missingCredits,
    totalNewMajorCredits: result.totalRequiredCredits
  };
};
