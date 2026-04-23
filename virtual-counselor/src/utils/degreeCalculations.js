import { GRADE_POINTS } from "../components/degree-planner/CourseRow";

export const PASSING_GRADES = new Set(["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "P", "S"]);

// Grade ordering for minimum-grade comparisons (higher index = better grade)
const GRADE_ORDER = ["C-", "C", "C+", "B-", "B", "B+", "A-", "A"];

// Degrees that require better than C- in their core courses.
// Keys are substrings matched against the uppercase degree name.
// Value is the minimum letter grade needed for a course to count toward the major.
export const DEGREE_GRADE_MINIMUMS = {
  "COMPUTER SCIENCE": "C+",
  "ELECTRICAL ENGINEERING": "C+",
  "COMPUTER ENGINEERING": "C+",
  "SOFTWARE ENGINEERING": "C+",
  "MECHANICAL ENGINEERING": "C",
  "CIVIL ENGINEERING": "C",
  "CHEMICAL ENGINEERING": "C",
  "DATA ANALYTICS": "C+",
  "MATHEMATICS": "C",
  "PHYSICS": "C",
  "CHEMISTRY": "C",
  "BIOLOGY": "C",
  "BIOCHEMISTRY": "C",
  "NEUROSCIENCE": "C",
};

export const getMinGradeForDegree = (degreeName) => {
  if (!degreeName) return "C-";
  const upper = degreeName.toUpperCase();
  for (const [key, grade] of Object.entries(DEGREE_GRADE_MINIMUMS)) {
    if (upper.includes(key)) return grade;
  }
  return "C-";
};

export const gradeMetMinimum = (grade, minGrade) => {
  if (!grade || !minGrade) return true; // no grade yet / no minimum = no flag
  if (grade === "P" || grade === "S") return true;
  const gradeIdx = GRADE_ORDER.indexOf(grade);
  const minIdx = GRADE_ORDER.indexOf(minGrade);
  if (gradeIdx === -1 || minIdx === -1) return true; // unknown grade, don't flag
  return gradeIdx >= minIdx;
};

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
        const NON_GPA_GRADES = new Set(['P', 'S', 'U', 'NC', 'W', 'I']);
        if (course.status === "taken" && course.grade && course.credits > 0
            && !NON_GPA_GRADES.has(course.grade) && course.grade in GRADE_POINTS) {
          const points = GRADE_POINTS[course.grade] * course.credits;
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
          PASSING_GRADES.has(course.grade)
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
export const analyzeDegreeProgress = (userCourses, requiredCourses, refinements = {}, minGrade = null) => {
  const matched = [];
  const missing = [];
  const usedUserCourseIds = new Set();
  
  // Create a copy of userCourses and SORT by priority
  // Priority: Taken & Passing > In-Progress > Planned > Not-Taken/Failed
  // This ensures requirements grab the "best" available course first.
  const getScore = (c) => {
      if (c.status === "taken" && c.grade && PASSING_GRADES.has(c.grade)) return 4;
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

     // Priority 3: Partial/OR Match — user course code appears in requirement label
     if (!matchFound) {
        matchFound = sortedUserCourses.find(uc => {
            if (usedUserCourseIds.has(uc.id)) return false;
            const escaped = uc.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            return regex.test(req.name) || regex.test(req.code);
        });
     }

     // Priority 4: Footnote match — eligible courses listed in footnote text
     // e.g. "Lab Science Requirement" footnote lists PHYSICS 201, BIOL 106, CHEM 105
     if (!matchFound && req.footnotes && req.footnotes.length > 0) {
        const footnoteText = req.footnotes.join(' ').toUpperCase();
        const codeRegex = /\b([A-Z]{2,8}(?:\s+[A-Z]+)*\s+\d{3})\b/g;
        const footnoteCodes = new Set();
        let fm;
        while ((fm = codeRegex.exec(footnoteText)) !== null) {
            footnoteCodes.add(fm[1].replace(/\s+/g, ' ').trim());
        }
        if (footnoteCodes.size > 0) {
            matchFound = sortedUserCourses.find(uc =>
                !usedUserCourseIds.has(uc.id) && footnoteCodes.has(uc.code)
            );
        }
     }

     // Priority 5: Named elective / elective bucket — match unmatched courses by prefix + level
     // e.g. "CPT S Technical Elective" matches any unused CPT S 300-400 level course
     // e.g. "Computer Science Electives" matches any unused 300-400 level course in approved prefixes
     if (!matchFound && (req.requirementType === 'elective-bucket' || req.requirementType === 'named-elective')) {
        // Extract leading department prefix only if it's already uppercase (real dept code like "CPT S", "MATH").
        // Mixed-case names like "Computer Science Electives" intentionally produce no prefix → match any 300+ level course.
        const prefixMatch = req.name.match(/^([A-Z]{2,8}(?:\s+[A-Z]{1,2})?)\s+/);
        const reqPrefix = prefixMatch ? prefixMatch[1] : null;

        matchFound = sortedUserCourses.find(uc => {
            if (usedUserCourseIds.has(uc.id)) return false;
            // Course must be at 300+ level
            const levelMatch = uc.code.match(/(\d{3})$/);
            if (!levelMatch || parseInt(levelMatch[1], 10) < 300) return false;
            // If requirement names a specific department, course prefix must match
            if (reqPrefix && !uc.code.toUpperCase().startsWith(reqPrefix.toUpperCase())) return false;
            return true;
        });
     }

     // Priority 6: UCORE slot — match by UCORE attribute tag on the course
     // e.g. "UCORE Inquiry [HUM]" matches any course the student has with [HUM] attribute
     if (!matchFound && req.requirementType === 'ucore-slot') {
        const ucoreMatch = (req.name || req.code || '').match(/\[([A-Z]+)\]/);
        if (ucoreMatch) {
            const attr = ucoreMatch[1].toUpperCase();
            matchFound = sortedUserCourses.find(uc => {
                if (usedUserCourseIds.has(uc.id)) return false;
                const attrs = [].concat(uc.attributes || uc.ucore || []).map(a => a.toString().toUpperCase());
                return attrs.includes(attr);
            });
        }
     }

     if (matchFound) {
        const belowMinGrade = minGrade && matchFound.grade
          ? !gradeMetMinimum(matchFound.grade, minGrade)
          : false;
        matched.push({ ...req, matchedCourse: matchFound, belowMinGrade });
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
  const belowMinGradeCount = matched.filter(m => m.belowMinGrade).length;

  return {
    matched,
    missing,
    missingCredits,
    totalRequiredCredits,
    belowMinGradeCount,
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
