import { calculateCreditsAchieved } from "./degreeCalculations";


export const optimizeSchedule = async ({
  degreePlan,
  selectedYear,
  years,
  optimizeSpeed,
  includeSummer = true,
  ensureFullTime = true,
}) => {
  // Build list of unscheduled courses
  const unscheduled = [];
  const taken = new Set();
  
  const initialCreditsAchieved = calculateCreditsAchieved(degreePlan);

  Object.entries(degreePlan).forEach(([yearId, year]) => {
    ["fall", "spring", "summer"].forEach((term) => {
      year[term].courses.forEach((course) => {
        if (course.name) {
          // normalize key to 'PREFIX ###' when possible
          const normPrefix = course.prefix
            ? String(course.prefix).toUpperCase().replace(/\s+/g, "")
            : "";
          const normNumber = course.number ? String(course.number) : "";
          const key =
            normPrefix && normNumber
              ? `${normPrefix} ${normNumber}`
              : String(course.name || "").toUpperCase();
          if (course.status === "taken") taken.add(key);
          else
            unscheduled.push({
              ...course,
              key,
              originalYear: parseInt(yearId, 10),
              originalTerm: term,
            });
        }
      });
    });
  });

  // Load catalog prereqs for selected catalog year (if available)
  const catalogMap = {};
  try {
    if (selectedYear) {
      const resp = await fetch(
        `/api/catalog/courses?year=${encodeURIComponent(selectedYear)}`
      );
      if (resp.ok) {
        const j = await resp.json();
        (j.courses || []).forEach((r) => {
          if (r.code) catalogMap[String(r.code).toUpperCase()] = r;
        });
      }
    }
  } catch (e) {
    console.warn("Could not load catalog courses for optimizer", e);
  }

  // Helper: parse prerequisite course codes from strings (footnotes, attributes, raw)
  // Returns array of groups; each group is an array of alternative codes (OR semantics).
  const parsePrereqs = (course) => {
    const sources = [];
    if (course.footnotes)
      sources.push(
        Array.isArray(course.footnotes)
          ? course.footnotes.join(" ")
          : String(course.footnotes)
      );
    if (course.attributes)
      sources.push(
        Array.isArray(course.attributes)
          ? course.attributes.join(" ")
          : String(course.attributes)
      );
    if (course.raw) sources.push(String(course.raw));
    if (course.name) sources.push(String(course.name));

    const text = sources.join(" ");
    if (!text) return [];

    // Match either PREFIX NUMBER or standalone NUMBER; capture positions for grouping
    const tokenRe = /([A-Za-z]{2,6})\s*\.?\s*(\d{3})|\b(\d{3})\b/g;
    const matches = [];
    let mm;
    while ((mm = tokenRe.exec(text)) !== null) {
      if (mm[1] && mm[2]) {
        const pref = mm[1].toUpperCase().replace(/\s+/g, "");
        const num = mm[2];
        matches.push({
          code: `${pref} ${num}`,
          start: mm.index,
          end: tokenRe.lastIndex,
          pref,
          num,
        });
      } else if (mm[3]) {
        const num = mm[3];
        matches.push({
          code: `${num}`,
          start: mm.index,
          end: tokenRe.lastIndex,
          pref: null,
          num,
        });
      }
    }

    if (matches.length === 0) return [];

    // Inherit prefix for standalone numbers from nearest previous match when appropriate
    for (let i = 0; i < matches.length; i++) {
      if (!matches[i].pref) {
        for (let j = i - 1; j >= 0; j--) {
          const between = text
            .substring(matches[j].end, matches[i].start)
            .toLowerCase();
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
    let current = [matches[0].code.replace(/\s+/g, " ").toUpperCase()];
    for (let i = 1; i < matches.length; i++) {
      const between = text
        .substring(matches[i - 1].end, matches[i].start)
        .toLowerCase();
      const hasOr = /\bor\b|\//.test(between);
      if (hasOr) {
        current.push(matches[i].code.replace(/\s+/g, " ").toUpperCase());
      } else {
        groups.push(Array.from(new Set(current)));
        current = [matches[i].code.replace(/\s+/g, " ").toUpperCase()];
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
    const attrs = (course.attributes || []).join(" ").toLowerCase();
    const foot = (
      Array.isArray(course.footnotes)
        ? course.footnotes.join(" ")
        : course.footnotes || ""
    ).toLowerCase();
    
    // Check strict constraints
    const isSummerOnly = attrs.includes("summer only") || foot.includes("summer only");
    const isNotSummer = attrs.includes("not summer") || 
                        foot.includes("not offered summer") || 
                        attrs.includes("fall/spring");

    if (isNotSummer) return termName !== "summer";
    if (isSummerOnly) return termName === "summer";

    // User preference check: if includeSummer is false, disallow summer unless strictly required (handled above)
    // Since we returned above for strict summer only, if we are here, it's NOT strict summer only.
    if (!includeSummer && termName === "summer") {
        return false;
    }

    // Default: allow term but prefer non-summer. We'll deprioritize summer by scheduling others first.
    return true;
  };

  // Build lookup map for quick access
  const courseMap = {};
  unscheduled.forEach((c) => {
    courseMap[c.key] = c;
  });

  // Build prereq graph and prerequisites list for each course
  // Each entry is an array of groups; each group is an array of alternative codes (OR semantics)
  const prereqs = {};
  unscheduled.forEach((c) => {
    let groups = parsePrereqs(c) || [];
    const normKey = String(c.key || "").toUpperCase();
    // If catalog has metadata for this course, apply offered terms and use its prereqs as fallback
    if (catalogMap[normKey]) {
      const meta = catalogMap[normKey];
      // apply offered terms if missing on the course object
      if (
        (!c.offeredTerms || !c.offeredTerms.length) &&
        meta.offered_terms &&
        meta.offered_terms.length
      ) {
        c.offeredTerms = meta.offered_terms;
      }
      // if parser didn't find anything, use catalog prereqs
      if (
        (groups.length === 0 || groups.every((g) => g.length === 0)) &&
        meta.prerequisite_codes &&
        meta.prerequisite_codes.length
      ) {
        groups = meta.prerequisite_codes.map((pc) => [
          String(pc).toUpperCase(),
        ]);
      }
    }

    // Canonicalize groups: uppercase, single-spaced, remove empties
    const cleanedGroups = groups
      .map((g) =>
        (Array.isArray(g) ? g : [g])
          .map((code) =>
            String(code || "")
              .replace(/\s+/g, " ")
              .toUpperCase()
          )
          .filter(Boolean)
      )
      .filter((g) => g.length > 0);
    prereqs[c.key] = cleanedGroups;
  });

  // Scheduling parameters
  const creditLimits = { accelerated: 23, normal: 18, relaxed: 12 };
  const maxCredits = creditLimits[optimizeSpeed] || 18;

  // Prepare empty newPlan
  const newPlan = {};
  years.forEach((y) => {
    newPlan[y.id] = {
      fall: { courses: [] },
      spring: { courses: [] },
      summer: { courses: [] },
    };
  });
  
  // Flatten terms in chronological order
  const termSequence = [];
  years.forEach((y) => {
    termSequence.push({ yearId: y.id, term: "fall" });
    termSequence.push({ yearId: y.id, term: "spring" });
    termSequence.push({ yearId: y.id, term: "summer" });
  });

  // Helper: compute credits scheduled before a given slot (yearId, term)
  const creditsBeforeSlot = (slot) => {
    // start with already achieved credits
    let credits = initialCreditsAchieved || 0;
    for (const s of termSequence) {
      if (s.yearId === slot.yearId && s.term === slot.term) break;
      const termCourses = newPlan[s.yearId][s.term].courses || [];
      credits += termCourses.reduce((sum, cc) => sum + (cc.credits || 0), 0);
    }
    return credits;
  };

  // Helper: derive student level from credits
  const studentLevelFromCredits = (credits) => {
    if (credits >= 90) return "senior";
    if (credits >= 60) return "junior";
    if (credits >= 30) return "sophomore";
    return "freshman";
  };

  // Maintain set of scheduled courses
  const scheduled = new Set([...taken]);

  // Function to check if prereqs satisfied (all prereq groups are satisfied) for a given slot
  const prereqsSatisfied = (course, slot) => {
    const groups = prereqs[course.key] || [];
    // Special handling for alternative course groups: if the course has `alternatives` defined,
    // be conservative: only allow moving earlier if NONE of the alternatives have explicit prereqs.
    if (
      course.alternatives &&
      Array.isArray(course.alternatives) &&
      course.alternatives.length > 0
    ) {
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
        const meta =
          catalogMap[String(courseObj.key || "").toUpperCase()] || {};
        const combined = [];
        if (courseObj.footnotes)
          combined.push(
            Array.isArray(courseObj.footnotes)
              ? courseObj.footnotes.join(" ")
              : String(courseObj.footnotes)
          );
        if (courseObj.attributes)
          combined.push(
            Array.isArray(courseObj.attributes)
              ? courseObj.attributes.join(" ")
              : String(courseObj.attributes)
          );
        if (courseObj.raw) combined.push(String(courseObj.raw));
        if (meta && meta.notes) combined.push(String(meta.notes));
        const txt = combined.join(" ").toLowerCase();
        if (/\bjunior\b/.test(txt)) return "junior";
        if (/\bsenior\b/.test(txt)) return "senior";
        return null;
      } catch (e) {
        return null;
      }
    };

    // credits the student would have before this slot
    const creditsBefore = slot
      ? creditsBeforeSlot(slot)
      : initialCreditsAchieved || 0;
    const levelBefore = studentLevelFromCredits(creditsBefore);

    const allowsConcurrent = (courseObj) => {
      try {
        if (
          courseObj.concurrent === true ||
          courseObj.allowConcurrent === true
        )
          return true;
        const meta = catalogMap[String(courseObj.key || "").toUpperCase()];
        if (
          meta &&
          (meta.concurrent === true || meta.allow_concurrent === true)
        )
          return true;
        const combined = [];
        if (courseObj.footnotes)
          combined.push(
            Array.isArray(courseObj.footnotes)
              ? courseObj.footnotes.join(" ")
              : String(courseObj.footnotes)
          );
        if (courseObj.attributes)
          combined.push(
            Array.isArray(courseObj.attributes)
              ? courseObj.attributes.join(" ")
              : String(courseObj.attributes)
          );
        if (courseObj.raw) combined.push(String(courseObj.raw));
        const txt = combined.join(" ").toLowerCase();
        if (
          /concurrent|may be taken concurrently|concurrent enrollment/.test(
            txt
          )
        )
          return true;
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
        if (scheduled.has(code)) {
          satisfied = true;
          break;
        }
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

  // Greedy placement: iterate through terms and try to place courses whose prereqs are satisfied and allowed in that term.
  // We will prefer non-summer terms first by ordering candidates.
  const remaining = new Set(unscheduled.map((c) => c.key));

  termSequence.forEach((slot) => {
    if (remaining.size === 0) return;
    const termCourses = newPlan[slot.yearId][slot.term].courses;
    let currentCredits = termCourses.reduce(
      (s, c) => s + (c.credits || 0),
      0
    );

    // Build candidate list: unscheduled courses allowed in this term and prereqs satisfied
    const candidates = Array.from(remaining)
      .map((k) => courseMap[k])
      .filter((c) => {
        if (!c) return false;
        if (!allowedInTerm(c, slot.term)) return false;
        if (!prereqsSatisfied(c, slot)) return false;
        return true;
      });

    // Sort candidates: prefer lower originalYear/originalTerm first, and prefer non-summer offerings
    candidates.sort((a, b) => {
      if (a.originalYear !== b.originalYear)
        return a.originalYear - b.originalYear;
      const order = { fall: 1, spring: 2, summer: 3 };
      if (order[a.originalTerm] !== order[b.originalTerm])
        return order[a.originalTerm] - order[b.originalTerm];
      // deprioritize courses that appear to be summer-only when we're not in summer
      const aSummerOnly =
        a.offeredTerms &&
        a.offeredTerms.length === 1 &&
        a.offeredTerms[0] === "summer"
          ? 1
          : 0;
      const bSummerOnly =
        b.offeredTerms &&
        b.offeredTerms.length === 1 &&
        b.offeredTerms[0] === "summer"
          ? 1
          : 0;
      return aSummerOnly - bSummerOnly;
    });

    for (const c of candidates) {
      let hasCapacity = false;
      const newTotal = currentCredits + (c.credits || 0);

      if (newTotal <= maxCredits) {
          hasCapacity = true;
      } else if (ensureFullTime && optimizeSpeed === 'relaxed') {
            // Relaxed mode (12 limit): allow up to 14 if currently under 12
            if (currentCredits < 12 && newTotal <= 14) {
                 hasCapacity = true;
            }
      }

      if (hasCapacity) {
        termCourses.push(c);
        scheduled.add(c.key);
        remaining.delete(c.key);
        currentCredits += c.credits || 0;
      }
    }
  });

  // If anything remains (due to prereqs cycles or term restrictions), append them as fallback
  // We will dynamically add years if needed instead of jamming into the last term.
  
  // Track all years (initial + dynamically added)
  const finalYears = [...years];

  if (remaining.size > 0) {
    const fallback = unscheduled.filter((c) => remaining.has(c.key));
    // Sort logic...
    fallback.sort(
      (a, b) =>
        a.originalYear - b.originalYear ||
        a.originalTerm.localeCompare(b.originalTerm)
    );
    
    // We iterate through fallback courses and try to place them
    // We treat termSequence (slots) as a growable list
    const slots = termSequence; 
    
    for (const c of fallback) {
      // Find next slot with capacity
      let placed = false;
      let idx = 0;
      
      while (!placed) {
        // Dynamic Expansion: If we run out of slots, create a new year
        if (idx >= slots.length) {
          const lastYear = finalYears[finalYears.length - 1];
          const newId = lastYear ? lastYear.id + 1 : 1;
          const newYearObj = { id: newId, name: `Year ${newId}` };
          
          finalYears.push(newYearObj);
          newPlan[newId] = {
            fall: { courses: [] },
            spring: { courses: [] },
            summer: { courses: [] },
          };
          
          // Append new terms to slots
          slots.push({ yearId: newId, term: "fall" });
          slots.push({ yearId: newId, term: "spring" });
          slots.push({ yearId: newId, term: "summer" });
          
          // Loop continues immediately to check these new slots
        }

        const slot = slots[idx];
        const termCourses = newPlan[slot.yearId][slot.term].courses;
        const currentCredits = termCourses.reduce(
          (s, cc) => s + (cc.credits || 0),
          0
        );
        
        // Check capacity
        let hasCapacity = false;
        const newTotal = currentCredits + (c.credits || 0);

        // Standard check
        if (newTotal <= maxCredits) {
            hasCapacity = true;
        } 
        // Ensure Full Time Logic (Relaxed Boost)
        else if (ensureFullTime && optimizeSpeed === 'relaxed') {
            // If currently under 12 credits, allow going up to 14 to reach full time
            // Basically, if we are currently < 12, we can add a course even if it pushes us over 12,
            // as long as the new total is <= 14.
            if (currentCredits < 12 && newTotal <= 14) {
                 hasCapacity = true;
            }
        }
        else if (ensureFullTime && optimizeSpeed === 'normal') {
             // Normal mode (18 limit) rarely needs this, but theoretically if a student had 11 credits 
             // and needed a 4 credit course (total 15), it fits in standard limit anyway.
             // This logic is mostly for "relaxed" (12) limit.
        }


        if (
          allowedInTerm(c, slot.term) &&
          hasCapacity
        ) {
          termCourses.push(c);
          remaining.delete(c.key);
          placed = true;
        }
        idx++;
        
        // Safety break for infinite loops (e.g. course not allowed in ANY term?)
        if (idx > 500) { // arbitrary high limit (approx 160 years)
            console.warn("Optimizer panic: could not place course", c);
            const last = slots[slots.length-1];
            newPlan[last.yearId][last.term].courses.push(c);
            placed = true;
        }
      }
    }
  }

  return { degreePlan: newPlan, newYears: finalYears };
};
