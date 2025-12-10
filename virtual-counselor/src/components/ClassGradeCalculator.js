import React, { useState, useEffect, useRef } from 'react';

export default function ClassGradeCalculator({ courseName, onClose }) {
  const [categories, setCategories] = useState([
    { name: 'Homework', weight: 20, earnedPoints: 0, totalPoints: 0 },
    { name: 'Midterm', weight: 30, earnedPoints: 0, totalPoints: 0 },
    { name: 'Final', weight: 40, earnedPoints: 0, totalPoints: 0 },
    { name: 'Participation', weight: 10, earnedPoints: 0, totalPoints: 0 },
  ]);
  
  const [targetGrade, setTargetGrade] = useState('A');
  const [selectedCategoryForCalc, setSelectedCategoryForCalc] = useState(0);

  const handleCategoryChange = (index, field, value) => {
    const newCategories = [...categories];
    // Handle text field (name) differently from numeric fields
    if (field === 'name') {
      newCategories[index] = { ...newCategories[index], [field]: value };
    } else {
      // Allow empty string, otherwise parse as number
      newCategories[index] = { ...newCategories[index], [field]: value === '' ? '' : parseFloat(value) || 0 };
    }
    setCategories(newCategories);
  };

  const addCategory = () => {
    setCategories([...categories, { name: `Category ${categories.length + 1}`, weight: 0, earnedPoints: 0, totalPoints: 0 }]);
  };

  const removeCategory = (index) => {
    if (categories.length > 1) {
      setCategories(categories.filter((_, i) => i !== index));
    }
  };

  // Calculate current grade
  const calculateCurrentGrade = () => {
    let totalWeightedScore = 0;
    let totalWeightUsed = 0;

    categories.forEach(cat => {
      if (cat.totalPoints > 0) {
        const percentage = (cat.earnedPoints / cat.totalPoints) * 100;
        totalWeightedScore += (percentage * cat.weight) / 100;
        totalWeightUsed += cat.weight;
      }
    });

    if (totalWeightUsed === 0) return null;
    return totalWeightedScore;
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
      if (cat.totalPoints > 0) {
        const percentage = (cat.earnedPoints / cat.totalPoints) * 100;
        currentWeightedScore += (percentage * cat.weight) / 100;
      } else if (idx !== selectedCategoryForCalc) {
        // Count categories with no points yet as remaining (except the selected one)
        remainingWeight += cat.weight;
      }
    });

    const selectedCategory = categories[selectedCategoryForCalc];
    const selectedWeight = selectedCategory.weight;
    
    // If this category already has points, we can't calculate needed grade
    if (selectedCategory.totalPoints > 0) {
      return { error: 'Selected category already has grades entered' };
    }

    // Calculate needed percentage on selected category
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
  const totalWeight = categories.reduce((sum, cat) => sum + cat.weight, 0);

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

  const containerRef = useRef(null);
  const firstFocusableRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    // focus first input inside modal
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="presentation">
      <div ref={containerRef} role="dialog" aria-modal="true" aria-label="Class Grade Calculator" className="glass-card relative rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 rounded-t-2xl bg-white/80 backdrop-blur-sm border-b px-4 sm:px-6 py-3 flex justify-between items-center">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-wsu-crimson">Class Grade Calculator</h2>
            {courseName && <p className="text-gray-600 text-xs sm:text-sm mt-1">{courseName}</p>}
          </div>
          <button onClick={onClose} aria-label="Close calculator" className="text-gray-500 hover:text-gray-800 p-2 rounded focus:outline-none focus:ring-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Current Grade Display */}
          <div className="rounded-xl p-4 bg-gradient-to-r from-wsu-crimson to-red-700 text-white shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-xs opacity-90">Current estimated score</div>
                <div className="text-3xl sm:text-4xl font-bold">
                  {currentGrade !== null ? `${currentGrade.toFixed(1)}%` : '—'}
                </div>
                {currentGrade !== null && (
                  <div className="text-sm opacity-90 mt-1">Letter grade: <span className="font-semibold">{getLetterGrade(currentGrade)}</span></div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-white/90">Summary</div>
                <div className="text-sm mt-1 text-white/90">Based on completed categories (weights applied)</div>
              </div>
            </div>
          </div>

          {/* Weight Warning */}
          {totalWeight !== 100 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-xl">
              <div className="font-medium">Heads up</div>
              <div className="text-sm mt-1">Total weight is <span className="font-semibold">{totalWeight}%</span>. For accurate results, adjust category weights to total <span className="font-semibold">100%</span>.</div>
            </div>
          )}

          {/* Categories */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg">Grade Categories</h3>
              <button onClick={addCategory} className="btn-outline text-sm py-1">
                + Add Category
              </button>
            </div>

            <div className="space-y-3">
              {categories.map((category, index) => (
                <div key={index} className="card bg-gray-50 rounded-xl">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    {/* Name */}
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category Name</label>
                      <input
                        type="text"
                        value={category.name}
                        onChange={(e) => handleCategoryChange(index, 'name', e.target.value)}
                        className="input-field text-sm"
                        placeholder="e.g., Homework"
                      />
                    </div>

                    {/* Weight */}
                    <div className="col-span-4 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Weight</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={category.weight}
                          onChange={(e) => handleCategoryChange(index, 'weight', e.target.value)}
                          className="input-field text-sm text-center"
                          min="0"
                          max="100"
                        />
                        <span className="text-sm text-gray-600">%</span>
                      </div>
                    </div>

                    {/* Earned Points */}
                    <div className="col-span-4 md:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Earned Points</label>
                      <input
                        type="number"
                        value={category.earnedPoints}
                        onChange={(e) => handleCategoryChange(index, 'earnedPoints', e.target.value)}
                        className="input-field text-sm"
                        placeholder="0"
                        min="0"
                        step="0.5"
                      />
                    </div>

                    {/* Total Points */}
                    <div className="col-span-4 md:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Total Points</label>
                      <input
                        type="number"
                        value={category.totalPoints}
                        onChange={(e) => handleCategoryChange(index, 'totalPoints', e.target.value)}
                        className="input-field text-sm"
                        placeholder="0"
                        min="0"
                        step="0.5"
                      />
                    </div>

                    {/* Remove Button */}
                    <div className="col-span-12 md:col-span-1 flex justify-center">
                      <button
                        onClick={() => removeCategory(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                        disabled={categories.length === 1}
                      >
                        Delete
                      </button>
                    </div>

                    {/* Score Display */}
                    {category.totalPoints > 0 && (
                      <div className="col-span-12 text-sm text-gray-600 text-right">
                        Score: {((category.earnedPoints / category.totalPoints) * 100).toFixed(1)}%
                        {' '}(contributes {((category.earnedPoints / category.totalPoints) * category.weight).toFixed(1)}% to final grade)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What Grade Do I Need? */}
          <div className="card bg-blue-50 rounded-xl">
            <h3 className="font-bold text-lg mb-3">What grade do I need?</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Target Grade */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Grade
                </label>
                <select
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(e.target.value)}
                  className="input-field"
                  ref={firstFocusableRef}
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

                <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">
                  Upcoming category
                </label>
                <select
                  value={selectedCategoryForCalc}
                  onChange={(e) => setSelectedCategoryForCalc(parseInt(e.target.value))}
                  className="input-field"
                >
                  {categories.map((cat, idx) => (
                    <option key={idx} value={idx}>
                      {cat.name} ({cat.weight}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results */}
            {neededCalc.error ? (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl">
                {neededCalc.error}
              </div>
            ) : (
              <div className="bg-white border-2 border-blue-300 rounded-xl p-4">
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="text-sm text-gray-600">To achieve <span className="font-bold text-blue-600">{targetGrade}</span>, you will need:</div>
                  <div className="inline-flex items-baseline gap-4">
                    <div className="text-5xl font-extrabold text-blue-600 bg-blue-50 px-5 py-2 rounded-lg">{neededCalc.neededPercentage >= 0 ? `${neededCalc.neededPercentage}%` : 'Already'}</div>
                    <div className="text-sm text-gray-700">in <span className="font-medium">{categories[selectedCategoryForCalc].name}</span></div>
                  </div>
                  <div className="text-xs text-gray-500">Current weighted score: <span className="font-medium">{neededCalc.currentGrade}%</span> · Remaining weight considered: <span className="font-medium">{neededCalc.remainingWeight}%</span></div>
                  {neededCalc.neededPercentage > 100 && (
                    <div className="mt-3 text-sm text-red-600">⚠️ This target may not be achievable with current grades</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl">
            <h4 className="font-semibold mb-2">How to use:</h4>
            <ol className="list-decimal list-inside space-y-1">
              <li>Enter your assignment categories and their weights (must total 100%)</li>
              <li>For completed assignments, enter earned points and total points</li>
              <li>To see what you need on an upcoming assignment, select your target grade and the assignment category</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
