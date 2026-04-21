// Local storage utilities for persisting user data

const STORAGE_KEYS = {
  DEGREE_PLAN: 'wsu_vc_degree_plan',
  SELECTED_DEGREE: 'wsu_vc_selected_degree',
  USER_COURSES: 'wsu_vc_user_courses',
  PREFERENCES: 'wsu_vc_preferences',
  UCORE_CACHE: 'wsu_vc_ucore_cache',
  GRADE_CALCULATOR: 'wsu_vc_grade_calculator',
  RECENT_COURSES: 'wsu_vc_recent_courses',
  THEME: 'wsu_vc_theme',
};

export function saveDegreePlan(plan) {
  try {
    const str = JSON.stringify(plan);
    console.debug('[storage] saveDegreePlan -> writing', STORAGE_KEYS.DEGREE_PLAN);
    // Academic planning data only (no credentials/tokens) — safe for browser localStorage
    // lgtm[js/clear-text-storage-of-sensitive-data]
    localStorage.setItem(STORAGE_KEYS.DEGREE_PLAN, str);
    // back-compat: also store old key used by earlier builds
    // lgtm[js/clear-text-storage-of-sensitive-data]
    try { localStorage.setItem('vc-degree-plan', str); } catch (_) {}
    return true;
  } catch (error) {
    console.error('Error saving degree plan:', error);
    return false;
  }
}

export function loadDegreePlan() {
  try {
    console.debug('[storage] loadDegreePlan -> reading', STORAGE_KEYS.DEGREE_PLAN);
    let plan = localStorage.getItem(STORAGE_KEYS.DEGREE_PLAN);
    if (!plan) {
      // Fallback to legacy key
      plan = localStorage.getItem('vc-degree-plan');
    }
    return plan ? JSON.parse(plan) : null;
  } catch (error) {
    console.error('Error loading degree plan:', error);
    return null;
  }
}

export function saveSelectedDegree(degree) {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_DEGREE, JSON.stringify(degree));
    return true;
  } catch (error) {
    console.error('Error saving selected degree:', error);
    return false;
  }
}

export function loadSelectedDegree() {
  try {
    const degree = localStorage.getItem(STORAGE_KEYS.SELECTED_DEGREE);
    return degree ? JSON.parse(degree) : null;
  } catch (error) {
    console.error('Error loading selected degree:', error);
    return null;
  }
}

export function saveUserCourses(courses) {
  try {
    const str = JSON.stringify(courses);
    console.debug('[storage] saveUserCourses -> writing', STORAGE_KEYS.USER_COURSES);
    localStorage.setItem(STORAGE_KEYS.USER_COURSES, str);
    // back-compat: also store under legacy key
    try { localStorage.setItem('vc_course_schedule', str); } catch (_) {}
    return true;
  } catch (error) {
    console.error('Error saving user courses:', error);
    return false;
  }
}

export function loadUserCourses() {
  try {
    console.debug('[storage] loadUserCourses -> reading', STORAGE_KEYS.USER_COURSES);
    let courses = localStorage.getItem(STORAGE_KEYS.USER_COURSES);
    if (!courses) {
      courses = localStorage.getItem('vc_course_schedule');
    }
    const parsed = courses ? JSON.parse(courses) : [];
    return parsed;
  } catch (error) {
    console.error('Error loading user courses:', error);
    return [];
  }
}

export function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    return false;
  }
}

// UCORE cache functions - store courses by category for instant modal loading
export function saveUcoreCache(cache, year) {
  try {
    const data = {
      cache,
      year,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.UCORE_CACHE, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Error saving UCORE cache:', error);
    return false;
  }
}

export function loadUcoreCache(expectedYear) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.UCORE_CACHE);
    if (!stored) return null;

    const data = JSON.parse(stored);

    // Check if cache is for the expected year
    if (data.year !== expectedYear) return null;

    // Check if cache is less than 24 hours old
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - data.timestamp > maxAge) {
      localStorage.removeItem(STORAGE_KEYS.UCORE_CACHE);
      return null;
    }

    return data.cache;
  } catch (error) {
    console.error('Error loading UCORE cache:', error);
    return null;
  }
}

export function clearUcoreCache() {
  try {
    localStorage.removeItem(STORAGE_KEYS.UCORE_CACHE);
    return true;
  } catch (error) {
    console.error('Error clearing UCORE cache:', error);
    return false;
  }
}

// Grade Calculator storage - keyed by course name
export function saveGradeCalculatorData(courseName, data) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.GRADE_CALCULATOR);
    const allData = stored ? JSON.parse(stored) : {};

    // Use a sanitized key (course name or 'default' for no course)
    const key = courseName ? courseName.trim().toLowerCase().replace(/\s+/g, '_') : 'default';
    allData[key] = {
      ...data,
      updatedAt: Date.now(),
    };

    localStorage.setItem(STORAGE_KEYS.GRADE_CALCULATOR, JSON.stringify(allData));
    return true;
  } catch (error) {
    console.error('Error saving grade calculator data:', error);
    return false;
  }
}

export function loadGradeCalculatorData(courseName) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.GRADE_CALCULATOR);
    if (!stored) return null;

    const allData = JSON.parse(stored);
    const key = courseName ? courseName.trim().toLowerCase().replace(/\s+/g, '_') : 'default';

    return allData[key] || null;
  } catch (error) {
    console.error('Error loading grade calculator data:', error);
    return null;
  }
}

export function clearGradeCalculatorData(courseName) {
  try {
    if (!courseName) {
      // Clear all calculator data
      localStorage.removeItem(STORAGE_KEYS.GRADE_CALCULATOR);
    } else {
      // Clear specific course data
      const stored = localStorage.getItem(STORAGE_KEYS.GRADE_CALCULATOR);
      if (stored) {
        const allData = JSON.parse(stored);
        const key = courseName.trim().toLowerCase().replace(/\s+/g, '_');
        delete allData[key];
        localStorage.setItem(STORAGE_KEYS.GRADE_CALCULATOR, JSON.stringify(allData));
      }
    }
    return true;
  } catch (error) {
    console.error('Error clearing grade calculator data:', error);
    return false;
  }
}

// Recent courses storage for search history
export function saveRecentCourse(course) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECENT_COURSES);
    let recentCourses = stored ? JSON.parse(stored) : [];

    // Remove if already exists (to move to front)
    recentCourses = recentCourses.filter(c =>
      c.prefix !== course.prefix || c.number !== course.number
    );

    // Add to front
    recentCourses.unshift({
      ...course,
      addedAt: Date.now(),
    });

    // Keep only last 15 courses
    recentCourses = recentCourses.slice(0, 15);

    localStorage.setItem(STORAGE_KEYS.RECENT_COURSES, JSON.stringify(recentCourses));
    return true;
  } catch (error) {
    console.error('Error saving recent course:', error);
    return false;
  }
}

export function loadRecentCourses() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECENT_COURSES);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading recent courses:', error);
    return [];
  }
}

export function clearRecentCourses() {
  try {
    localStorage.removeItem(STORAGE_KEYS.RECENT_COURSES);
    return true;
  } catch (error) {
    console.error('Error clearing recent courses:', error);
    return false;
  }
}

// Theme storage
export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    return true;
  } catch (error) {
    console.error('Error saving theme:', error);
    return false;
  }
}

export function loadTheme() {
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme) return theme;

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  } catch (error) {
    console.error('Error loading theme:', error);
    return 'light';
  }
}

// Helper functions for degree planner
export function createEmptyCourses(count = 1) {
  const courses = [];
  for (let i = 0; i < count; i++) {
    courses.push({
      id: Date.now().toString() + '-' + i,
      name: '',
      credits: 0,
      grade: '',
      isRequired: false
    });
  }
  return courses;
}

export function createEmptyDegreePlan() {
  return {
    years: [
      {
        id: 1,
        terms: {
          fall: { courses: createEmptyCourses(1) },
          spring: { courses: createEmptyCourses(1) },
          summer: { courses: createEmptyCourses(1) }
        }
      },
      {
        id: 2,
        terms: {
          fall: { courses: createEmptyCourses(1) },
          spring: { courses: createEmptyCourses(1) },
          summer: { courses: createEmptyCourses(1) }
        }
      },
      {
        id: 3,
        terms: {
          fall: { courses: createEmptyCourses(1) },
          spring: { courses: createEmptyCourses(1) },
          summer: { courses: createEmptyCourses(1) }
        }
      },
      {
        id: 4,
        terms: {
          fall: { courses: createEmptyCourses(1) },
          spring: { courses: createEmptyCourses(1) },
          summer: { courses: createEmptyCourses(1) }
        }
      }
    ]
  };
}

export default {
  saveDegreePlan,
  loadDegreePlan,
  saveSelectedDegree,
  loadSelectedDegree,
  saveUserCourses,
  loadUserCourses,
  clearAllData,
  saveUcoreCache,
  loadUcoreCache,
  clearUcoreCache,
  saveGradeCalculatorData,
  loadGradeCalculatorData,
  clearGradeCalculatorData,
  saveRecentCourse,
  loadRecentCourses,
  clearRecentCourses,
  saveTheme,
  loadTheme,
  createEmptyCourses,
  createEmptyDegreePlan,
};
