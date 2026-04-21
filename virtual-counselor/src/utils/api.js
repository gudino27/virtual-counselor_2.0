// API client for backend communication
const API_URL = import.meta.env.VITE_API_URL || 'https://api.virtual-counselor.org';

// Helper function for fetch requests
async function fetchJSON(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

// Course APIs
export async function fetchCourses(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, value);
    }
  });

  return fetchJSON(`/api/courses?${params}`);
}

export async function searchCourses(query, limit = 100) {
  return fetchJSON(`/api/courses/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

// Search catalog courses (unique courses with descriptions, not sections)
export async function searchCatalogCourses(query, limit = 5) {
  return fetchJSON(`/api/catalog/courses?search=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function fetchCourseDescription(prefix, number) {
  try {
    return await fetchJSON(`/api/courses/${prefix}/${number}/description`);
  } catch (error) {
    return { description: null, source: 'none' };
  }
}

// Degree APIs
export async function fetchDegrees(year) {
  const params = year ? `?year=${year}` : '';
  return fetchJSON(`/api/degrees${params}`);
}

export async function fetchDegreeRequirements(degreeName, acadUnitId, type = 'degree') {
  const params = new URLSearchParams({ name: degreeName, type });
  if (acadUnitId) params.append('acadUnitId', acadUnitId);
  return fetchJSON(`/api/degree-requirements?${params}`);
}

// Minor and Certificate APIs
export async function fetchMinors(year) {
  const params = year ? `?year=${year}` : '';
  return fetchJSON(`/api/minors${params}`);
}

export async function fetchCertificates(year) {
  const params = year ? `?year=${year}` : '';
  return fetchJSON(`/api/certificates${params}`);
}

// Prefix APIs
export async function fetchPrefixes(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  return fetchJSON(`/api/prefixes?${params}`);
}

// Terms/Semesters APIs
export async function fetchTerms() {
  return fetchJSON('/api/terms');
}

export default {
  fetchCourses,
  searchCourses,
  fetchCourseDescription,
  fetchDegrees,
  fetchDegreeRequirements,
  fetchMinors,
  fetchCertificates,
  fetchPrefixes,
  fetchTerms,
};

export const getLLMAdvice = async (question, studentContext) => {
  // Client-side guardrail: Strip HTML before sending
  const cleanQuestion = question.replace(/<\/?[^>]+(>|$)/g, "");

  // FIXED: Added ${API_URL} to the front of the route
  const response = await fetch(`${API_URL}/api/llm-advice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: cleanQuestion, studentContext })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }
  return data;
};