import { useState, useEffect, useRef } from 'react';
import { saveGradeCalculatorData, loadGradeCalculatorData, clearGradeCalculatorData } from '../utils/storage';

const DEFAULT_CATEGORIES = [
  { name: 'Homework', weight: 20, assignments: [] },
  { name: 'Midterm', weight: 30, assignments: [] },
  { name: 'Final', weight: 40, assignments: [] },
  { name: 'Participation', weight: 10, assignments: [] },
];

export default function ClassGradeCalculator({ courseName, onClose, onUpdateGrade }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [targetGrade, setTargetGrade] = useState('A');
  const [selectedCategoryForCalc, setSelectedCategoryForCalc] = useState(0);
  const [calcMode, setCalcMode] = useState('available'); // 'available' or 'all'
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    const savedData = loadGradeCalculatorData(courseName);
    if (savedData) {
      if (savedData.categories) setCategories(savedData.categories);
      if (savedData.targetGrade) setTargetGrade(savedData.targetGrade);
      if (savedData.selectedCategoryForCalc !== undefined) setSelectedCategoryForCalc(savedData.selectedCategoryForCalc);
      if (savedData.calcMode) setCalcMode(savedData.calcMode);
    }
    setIsHydrated(true);
  }, [courseName]);

  // Save data whenever state changes (after hydration)
  useEffect(() => {
    if (!isHydrated) return;

    saveGradeCalculatorData(courseName, {
      categories,
      targetGrade,
      selectedCategoryForCalc,
      calcMode,
    });
  }, [categories, targetGrade, selectedCategoryForCalc, calcMode, courseName, isHydrated]);

  // Clear all data for this course
  const handleClearData = () => {
    if (window.confirm('Are you sure you want to reset the calculator? This will clear all categories and assignments.')) {
      setCategories(DEFAULT_CATEGORIES);
      setTargetGrade('A');
      setSelectedCategoryForCalc(0);
      setCalcMode('available');
      setExpandedCategory(null);
      clearGradeCalculatorData(courseName);
    }
  };

  // Add assignment to a category
  const addAssignment = (categoryIndex) => {
    const newCategories = [...categories];
    newCategories[categoryIndex].assignments.push({
      id: Date.now(),
      name: `Assignment ${newCategories[categoryIndex].assignments.length + 1}`,
      earnedPoints: 0,
      totalPoints: 0
    });
    setCategories(newCategories);
  };

  // Remove assignment from a category
  const removeAssignment = (categoryIndex, assignmentId) => {
    const newCategories = [...categories];
    newCategories[categoryIndex].assignments = newCategories[categoryIndex].assignments.filter(a => a.id !== assignmentId);
    setCategories(newCategories);
  };

  // Update assignment
  const updateAssignment = (categoryIndex, assignmentId, field, value) => {
    const newCategories = [...categories];
    const assignment = newCategories[categoryIndex].assignments.find(a => a.id === assignmentId);
    if (assignment) {
      if (field === 'name') {
        assignment[field] = value;
      } else {
        assignment[field] = value === '' ? '' : parseFloat(value) || 0;
      }
    }
    setCategories(newCategories);
  };

  // Update category
  const handleCategoryChange = (index, field, value) => {
    const newCategories = [...categories];
    if (field === 'name') {
      newCategories[index] = { ...newCategories[index], [field]: value };
    } else {
      newCategories[index] = { ...newCategories[index], [field]: value === '' ? '' : parseFloat(value) || 0 };
    }
    setCategories(newCategories);
  };

  const addCategory = () => {
    setCategories([...categories, { name: `Category ${categories.length + 1}`, weight: 0, assignments: [] }]);
  };

  const removeCategory = (index) => {
    if (categories.length > 1) {
      setCategories(categories.filter((_, i) => i !== index));
      if (selectedCategoryForCalc >= categories.length - 1) {
        setSelectedCategoryForCalc(Math.max(0, categories.length - 2));
      }
      if (expandedCategory === index) {
        setExpandedCategory(null);
      }
    }
  };

  // Calculate category totals from assignments
  const getCategoryTotals = (category) => {
    if (!category.assignments || category.assignments.length === 0) {
      return { earnedPoints: 0, totalPoints: 0, hasGrades: false };
    }

    let earnedPoints = 0;
    let totalPoints = 0;
    let hasGrades = false;

    category.assignments.forEach(a => {
      if (a.totalPoints > 0) {
        earnedPoints += a.earnedPoints || 0;
        totalPoints += a.totalPoints;
        hasGrades = true;
      }
    });

    return { earnedPoints, totalPoints, hasGrades };
  };

  // Calculate current grade
  const calculateCurrentGrade = () => {
    let totalWeightedScore = 0;
    let totalWeightUsed = 0;

    categories.forEach(cat => {
      const totals = getCategoryTotals(cat);
      if (totals.hasGrades && totals.totalPoints > 0) {
        const percentage = (totals.earnedPoints / totals.totalPoints) * 100;

        if (calcMode === 'available') {
          // Only count categories with grades
          totalWeightedScore += (percentage * cat.weight) / 100;
          totalWeightUsed += cat.weight;
        } else {
          // Count all categories, treating missing as 0
          totalWeightedScore += (percentage * cat.weight) / 100;
          totalWeightUsed += cat.weight;
        }
      } else if (calcMode === 'all') {
        // In 'all' mode, count missing categories as 0%
        totalWeightUsed += cat.weight;
      }
    });

    if (totalWeightUsed === 0) return null;

    if (calcMode === 'available') {
      // Normalize to the weight used
      return (totalWeightedScore / totalWeightUsed) * 100;
    } else {
      return totalWeightedScore;
    }
  };

  // Calculate what grade is needed on remaining work
  const calculateNeededGrade = () => {
    const targetPercentages = {
      'A': 93, 'A-': 90,
      'B+': 87, 'B': 83, 'B-': 80,
      'C+': 77, 'C': 73, 'C-': 70,
      'D+': 67, 'D': 63, 'D-': 60,
      'F': 0
    };

    const targetPercentage = targetPercentages[targetGrade] || 93;

    let currentWeightedScore = 0;
    let remainingWeight = 0;

    categories.forEach((cat, idx) => {
      const totals = getCategoryTotals(cat);
      if (totals.hasGrades && totals.totalPoints > 0) {
        const percentage = (totals.earnedPoints / totals.totalPoints) * 100;
        currentWeightedScore += (percentage * cat.weight) / 100;
      } else if (idx !== selectedCategoryForCalc) {
        remainingWeight += cat.weight;
      }
    });

    const selectedCategory = categories[selectedCategoryForCalc];
    const selectedWeight = selectedCategory.weight;
    const selectedTotals = getCategoryTotals(selectedCategory);

    if (selectedTotals.hasGrades) {
      return { error: 'Selected category already has grades entered' };
    }

    const neededWeightedPoints = targetPercentage - currentWeightedScore;
    const neededPercentage = (neededWeightedPoints / selectedWeight) * 100;

    return {
      neededPercentage: Math.round(neededPercentage * 100) / 100,
      currentGrade: Math.round(currentWeightedScore * 100) / 100,
      remainingWeight: selectedWeight + remainingWeight
    };
  };

  const currentGrade = calculateCurrentGrade();
  const neededCalc = calculateNeededGrade();
  const totalWeight = categories.reduce((sum, cat) => sum + (cat.weight || 0), 0);

  // Count categories with grades
  const categoriesWithGrades = categories.filter(cat => getCategoryTotals(cat).hasGrades).length;

  const getLetterGrade = (percentage) => {
    if (percentage >= 93) return 'A';
    if (percentage >= 90) return 'A-';
    if (percentage >= 87) return 'B+';
    if (percentage >= 83) return 'B';
    if (percentage >= 80) return 'B-';
    if (percentage >= 77) return 'C+';
    if (percentage >= 73) return 'C';
    if (percentage >= 70) return 'C-';
    if (percentage >= 67) return 'D+';
    if (percentage >= 63) return 'D';
    if (percentage >= 60) return 'D-';
    return 'F';
  };

  const getGradeColor = (grade) => {
    if (['A', 'A-'].includes(grade)) return 'text-green-600';
    if (['B+', 'B', 'B-'].includes(grade)) return 'text-blue-600';
    if (['C+', 'C', 'C-'].includes(grade)) return 'text-yellow-600';
    if (['D+', 'D', 'D-'].includes(grade)) return 'text-orange-600';
    return 'text-red-600';
  };

  // Notify parent of grade updates
  useEffect(() => {
    if (onUpdateGrade) {
      if (currentGrade !== null) {
        const letter = getLetterGrade(currentGrade);
        onUpdateGrade(currentGrade, letter);
      } else {
        onUpdateGrade(null, null);
      }
    }
  }, [currentGrade, onUpdateGrade]);

  const containerRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    const toFocus = containerRef.current?.querySelector('input,select,button,textarea');
    if (toFocus) toFocus.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try { prev && prev.focus(); } catch (e) {}
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" role="presentation">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Class Grade Calculator"
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] sm:max-h-[70vh] overflow-hidden flex flex-col transform translate-y-[3vh] "
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-wsu-crimson to-red-700 px-4 sm:px-6 py-3 sm:py-4 text-white">
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <h2 className="text-lg sm:text-xl font-bold truncate">Grade Calculator</h2>
              </div>
              {courseName && <p className="text-white/80 text-xs sm:text-sm mt-1 ml-7 sm:ml-8 truncate">{courseName}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleClearData}
                aria-label="Reset calculator"
                title="Reset calculator"
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={onClose}
                aria-label="Close calculator"
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Current Grade Display */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 sm:p-5 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Current Grade</p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-4xl font-bold text-gray-900">
                    {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : '—'}
                  </span>
                  {currentGrade !== null && (
                    <span className={`text-2xl font-bold ${getGradeColor(getLetterGrade(currentGrade))}`}>
                      {getLetterGrade(currentGrade)}
                    </span>
                  )}
                </div>
                {currentGrade === null && (
                  <p className="text-sm text-gray-500 mt-1">Add assignments to see your grade</p>
                )}
              </div>
              <div className="hidden sm:block">
                <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${
                  currentGrade !== null
                    ? currentGrade >= 70 ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                    : 'border-gray-300 bg-gray-50'
                }`}>
                  <span className={`text-2xl font-bold ${
                    currentGrade !== null
                      ? currentGrade >= 70 ? 'text-green-600' : 'text-red-600'
                      : 'text-gray-400'
                  }`}>
                    {currentGrade !== null ? getLetterGrade(currentGrade) : '?'}
                  </span>
                </div>
              </div>
            </div>

            {/* Calculation Mode Toggle */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Calculation Mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {calcMode === 'available'
                      ? `Based on ${categoriesWithGrades} of ${categories.length} categories with grades`
                      : 'Using all categories (missing = 0%)'
                    }
                  </p>
                </div>
                <div className="flex bg-gray-200 rounded-lg p-1 self-start sm:self-auto">
                  <button
                    onClick={() => setCalcMode('available')}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all touch-manipulation ${
                      calcMode === 'available'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Available Only
                  </button>
                  <button
                    onClick={() => setCalcMode('all')}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-all touch-manipulation ${
                      calcMode === 'all'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All Categories
                  </button>
                </div>
              </div>
              {calcMode === 'available' && categoriesWithGrades > 0 && (
                <div className="mt-2 flex items-start sm:items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Your grade is calculated only from entered assignments — add more as you go!</span>
                </div>
              )}
            </div>
          </div>

          {/* Weight Warning */}
          {totalWeight !== 100 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold">Weights don't add up to 100%</p>
                <p className="text-sm mt-0.5">Current total: <span className="font-bold">{totalWeight}%</span>. Adjust your category weights for accurate results.</p>
              </div>
            </div>
          )}

          {/* Categories Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Grade Categories
              </h3>
              <button
                onClick={addCategory}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-wsu-crimson hover:text-red-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Category
              </button>
            </div>

            <div className="space-y-3">
              {categories.map((category, index) => {
                const totals = getCategoryTotals(category);
                const hasGrade = totals.hasGrades;
                const pct = hasGrade ? (totals.earnedPoints / totals.totalPoints) * 100 : null;
                const isExpanded = expandedCategory === index;

                return (
                  <div
                    key={index}
                    className={`rounded-xl border transition-all ${
                      hasGrade
                        ? 'bg-white border-gray-200 shadow-sm'
                        : 'bg-gray-50 border-gray-200 border-dashed'
                    }`}
                  >
                    {/* Category Header */}
                    <div className="p-3 sm:p-4">
                      {/* Mobile Layout */}
                      <div className="sm:hidden">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setExpandedCategory(isExpanded ? null : index)}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors touch-manipulation"
                          >
                            <svg
                              className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <input
                            type="text"
                            value={category.name}
                            onChange={(e) => handleCategoryChange(index, 'name', e.target.value)}
                            className="flex-1 min-w-0 text-sm font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 px-0"
                            placeholder="Category name"
                          />
                          <button
                            onClick={() => removeCategory(index)}
                            disabled={categories.length === 1}
                            className={`p-2 rounded-lg transition-colors touch-manipulation ${
                              categories.length === 1
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            }`}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-2 ml-7">
                          <div className="flex items-center gap-1 bg-wsu-crimson/10 px-2 py-1 rounded-lg">
                            <input
                              type="number"
                              value={category.weight}
                              onChange={(e) => handleCategoryChange(index, 'weight', e.target.value)}
                              className="w-10 text-center text-sm font-bold text-wsu-crimson bg-transparent border-0 focus:outline-none focus:ring-0"
                              min="0"
                              max="100"
                            />
                            <span className="text-sm font-bold text-wsu-crimson">%</span>
                          </div>
                          <div className="text-right">
                            {hasGrade ? (
                              <span className={`text-lg font-bold ${pct >= 70 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {pct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">No grades</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden sm:flex items-center gap-3">
                        <button
                          onClick={() => setExpandedCategory(isExpanded ? null : index)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        <input
                          type="text"
                          value={category.name}
                          onChange={(e) => handleCategoryChange(index, 'name', e.target.value)}
                          className="flex-1 text-base font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-0 px-0"
                          placeholder="Category name"
                        />

                        <div className="flex items-center gap-1 bg-wsu-crimson/10 px-2 py-1 rounded-lg">
                          <input
                            type="number"
                            value={category.weight}
                            onChange={(e) => handleCategoryChange(index, 'weight', e.target.value)}
                            className="w-12 text-center text-sm font-bold text-wsu-crimson bg-transparent border-0 focus:outline-none focus:ring-0"
                            min="0"
                            max="100"
                          />
                          <span className="text-sm font-bold text-wsu-crimson">%</span>
                        </div>

                        {/* Category Score */}
                        <div className="w-20 text-right">
                          {hasGrade ? (
                            <span className={`text-lg font-bold ${pct >= 70 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {pct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </div>

                        <button
                          onClick={() => removeCategory(index)}
                          disabled={categories.length === 1}
                          className={`p-1.5 rounded-lg transition-colors ${
                            categories.length === 1
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {/* Progress Bar */}
                      {hasGrade && (
                        <div className="mt-3 ml-7 sm:ml-8">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                pct >= 90 ? 'bg-green-500' :
                                pct >= 80 ? 'bg-blue-500' :
                                pct >= 70 ? 'bg-yellow-500' :
                                pct >= 60 ? 'bg-orange-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-xs text-gray-500">
                            <span>{totals.earnedPoints} / {totals.totalPoints} pts</span>
                            <span>{category.assignments.length} assignment{category.assignments.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      )}

                      {/* Quick add button when collapsed */}
                      {!isExpanded && (
                        <div className="mt-2 ml-7 sm:ml-8">
                          <button
                            onClick={() => { setExpandedCategory(index); addAssignment(index); }}
                            className="text-xs text-wsu-crimson hover:text-red-800 font-medium flex items-center gap-1 py-1 touch-manipulation"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add assignment
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded Assignments Section */}
                    {isExpanded && (
                      <div className="px-2 sm:px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
                        <div className="pt-3 space-y-2">
                          {/* Assignment Headers - hidden on mobile */}
                          {category.assignments.length > 0 && (
                            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
                              <div className="col-span-5">Assignment</div>
                              <div className="col-span-2 text-center">Earned</div>
                              <div className="col-span-2 text-center">Total</div>
                              <div className="col-span-2 text-center">Score</div>
                              <div className="col-span-1"></div>
                            </div>
                          )}

                          {/* Assignment Rows - responsive layout */}
                          {category.assignments.map((assignment) => {
                            const assignmentPct = assignment.totalPoints > 0
                              ? (assignment.earnedPoints / assignment.totalPoints) * 100
                              : null;
                            return (
                              <div key={assignment.id} className="bg-white rounded-lg p-3 border border-gray-200">
                                {/* Mobile Layout */}
                                <div className="sm:hidden space-y-2">
                                  <div className="flex items-center justify-between">
                                    <input
                                      type="text"
                                      value={assignment.name}
                                      onChange={(e) => updateAssignment(index, assignment.id, 'name', e.target.value)}
                                      className="flex-1 text-sm font-medium border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
                                      placeholder="Assignment name"
                                    />
                                    <button
                                      onClick={() => removeAssignment(index, assignment.id)}
                                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                                    >
                                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <label className="block text-xs text-gray-500 mb-1">Earned</label>
                                      <input
                                        type="number"
                                        value={assignment.earnedPoints || ''}
                                        onChange={(e) => updateAssignment(index, assignment.id, 'earnedPoints', e.target.value)}
                                        className="w-full text-sm text-center border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                                        placeholder="0"
                                        min="0"
                                        step="0.5"
                                      />
                                    </div>
                                    <div className="text-gray-400 pt-5">/</div>
                                    <div className="flex-1">
                                      <label className="block text-xs text-gray-500 mb-1">Total</label>
                                      <input
                                        type="number"
                                        value={assignment.totalPoints || ''}
                                        onChange={(e) => updateAssignment(index, assignment.id, 'totalPoints', e.target.value)}
                                        className="w-full text-sm text-center border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                                        placeholder="0"
                                        min="0"
                                        step="0.5"
                                      />
                                    </div>
                                    <div className="w-16 pt-5 text-center">
                                      {assignmentPct !== null ? (
                                        <span className={`text-lg font-bold ${
                                          assignmentPct >= 70 ? 'text-green-600' : assignmentPct >= 60 ? 'text-yellow-600' : 'text-red-600'
                                        }`}>
                                          {assignmentPct.toFixed(0)}%
                                        </span>
                                      ) : (
                                        <span className="text-sm text-gray-400">—</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Desktop Layout */}
                                <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                                  <div className="col-span-5">
                                    <input
                                      type="text"
                                      value={assignment.name}
                                      onChange={(e) => updateAssignment(index, assignment.id, 'name', e.target.value)}
                                      className="w-full text-sm border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
                                      placeholder="Assignment name"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      value={assignment.earnedPoints || ''}
                                      onChange={(e) => updateAssignment(index, assignment.id, 'earnedPoints', e.target.value)}
                                      className="w-full text-sm text-center border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                                      placeholder="0"
                                      min="0"
                                      step="0.5"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      value={assignment.totalPoints || ''}
                                      onChange={(e) => updateAssignment(index, assignment.id, 'totalPoints', e.target.value)}
                                      className="w-full text-sm text-center border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
                                      placeholder="0"
                                      min="0"
                                      step="0.5"
                                    />
                                  </div>
                                  <div className="col-span-2 text-center">
                                    {assignmentPct !== null ? (
                                      <span className={`text-sm font-semibold ${
                                        assignmentPct >= 70 ? 'text-green-600' : assignmentPct >= 60 ? 'text-yellow-600' : 'text-red-600'
                                      }`}>
                                        {assignmentPct.toFixed(0)}%
                                      </span>
                                    ) : (
                                      <span className="text-sm text-gray-400">—</span>
                                    )}
                                  </div>
                                  <div className="col-span-1 text-center">
                                    <button
                                      onClick={() => removeAssignment(index, assignment.id)}
                                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    >
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Add Assignment Button */}
                          <button
                            onClick={() => addAssignment(index)}
                            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-wsu-crimson hover:text-wsu-crimson transition-colors flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Assignment
                          </button>

                          {category.assignments.length === 0 && (
                            <p className="text-center text-xs text-gray-500 py-2">
                              No assignments yet. Add your first assignment above.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* What Grade Do I Need Section */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-blue-200 bg-blue-100/50">
              <h3 className="font-bold text-blue-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                What Grade Do I Need?
              </h3>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-2">Target Grade</label>
                  <select
                    value={targetGrade}
                    onChange={(e) => setTargetGrade(e.target.value)}
                    className="w-full px-3 py-3 sm:py-2.5 bg-white border border-blue-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-sm"
                  >
                    <option value="A">A (93%)</option>
                    <option value="A-">A- (90%)</option>
                    <option value="B+">B+ (87%)</option>
                    <option value="B">B (83%)</option>
                    <option value="B-">B- (80%)</option>
                    <option value="C+">C+ (77%)</option>
                    <option value="C">C (73%)</option>
                    <option value="C-">C- (70%)</option>
                    <option value="D">D (63%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-2">On Category</label>
                  <select
                    value={selectedCategoryForCalc}
                    onChange={(e) => setSelectedCategoryForCalc(parseInt(e.target.value))}
                    className="w-full px-3 py-3 sm:py-2.5 bg-white border border-blue-300 rounded-lg text-gray-900 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-sm"
                  >
                    {categories.map((cat, idx) => (
                      <option key={idx} value={idx}>
                        {cat.name} ({cat.weight}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Result */}
              {neededCalc.error ? (
                <div className="flex items-center gap-2 bg-red-100 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">{neededCalc.error}</span>
                </div>
              ) : (
                <div className="bg-white rounded-xl border-2 border-blue-300 p-5 text-center">
                  <p className="text-sm text-gray-600 mb-2">
                    To get a <span className="font-bold text-blue-600">{targetGrade}</span> in this class:
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm text-gray-500">You need</span>
                    <span className={`text-4xl font-black ${
                      neededCalc.neededPercentage <= 100 ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {neededCalc.neededPercentage >= 0 ? `${neededCalc.neededPercentage}%` : 'Done!'}
                    </span>
                    <span className="text-sm text-gray-500">
                      on <span className="font-semibold">{categories[selectedCategoryForCalc].name}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
                    <span>Current: <span className="font-semibold">{neededCalc.currentGrade}%</span></span>
                    <span className="text-gray-300">|</span>
                    <span>Remaining: <span className="font-semibold">{neededCalc.remainingWeight}%</span></span>
                  </div>

                  {neededCalc.neededPercentage > 100 && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-red-600 text-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="font-medium">This target may not be achievable</span>
                    </div>
                  )}

                  {neededCalc.neededPercentage < 0 && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-green-600 text-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">You've already achieved this grade!</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="bg-gray-50 rounded-xl p-4">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  How to use this calculator
                </span>
                <svg className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <ol className="mt-3 text-sm text-gray-600 list-decimal list-inside space-y-1.5 pl-1">
                <li>Set up your grade categories (homework, exams, etc.) with their weights</li>
                <li>Click on a category to expand it and add individual assignments</li>
                <li>Use <strong>"Available Only"</strong> mode early in the semester to see your real grade</li>
                <li>Switch to <strong>"All Categories"</strong> to see worst-case scenario</li>
                <li>Use "What Grade Do I Need?" to plan for upcoming work</li>
              </ol>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
