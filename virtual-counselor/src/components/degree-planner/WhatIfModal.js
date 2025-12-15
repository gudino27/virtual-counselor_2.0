import React, { useState, useEffect } from "react";
import { fetchDegrees, fetchDegreeRequirements, fetchMinors, fetchCertificates, searchCatalogCourses } from "../../utils/api"; // Added searchCatalogCourses
import { analyzeWhatIf } from "../../utils/degreeCalculations";
import CatalogModal from "./CatalogModal"; // Added CatalogModal
import toast from "react-hot-toast";

export default function WhatIfModal({ show, onClose, degreePlan, userCourses = [], years }) {
  // --- Multi-Program State ---
  const [activeTab, setActiveTab] = useState("majors"); // "majors", "minors", "certificates"
  const [searchTerm, setSearchTerm] = useState("");
  const [availablePrograms, setAvailablePrograms] = useState([]); // List of results for current tab
  const [selectedPrograms, setSelectedPrograms] = useState([]); // Array of { type, name, data, id }
  
  // --- Refinement State ---
  const [refinements, setRefinements] = useState({}); // { "Requirement Name": "Course Code" or true }
  const [showCatalog, setShowCatalog] = useState(false);
  const [refiningRequirement, setRefiningRequirement] = useState(null);
  
  // --- Analysis State ---
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- Catalog Modal State (minimal state to drive the catalog modal) ---
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState([]);
  const [catalogFilteredResults, setCatalogFilteredResults] = useState([]);
  const [catalogViewMode, setCatalogViewMode] = useState("list");
  const [catalogIndex, setCatalogIndex] = useState(0);
  const [catalogModalYear, setCatalogModalYear] = useState(new Date().getFullYear());
  const [catalogModalTerm, setCatalogModalTerm] = useState("fall");

  // Load programs when tab changes
  useEffect(() => {
    const loadPrograms = async () => {
        setLoading(true);
        try {
            let res;
            if (activeTab === "majors") res = await fetchDegrees();
            else if (activeTab === "minors") res = await fetchMinors();
            else if (activeTab === "certificates") res = await fetchCertificates();
            
            // Normalize response
            let data = res.data || res;
            if (data.data) data = data.data; 
            if (data.degrees) data = data.degrees;
            
            if (Array.isArray(data)) {
                setAvailablePrograms(data);
            } else {
                setAvailablePrograms([]);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to load programs");
        } finally {
            setLoading(false);
        }
    };
    if (show) loadPrograms();
  }, [show, activeTab]);

  // Handle adding a program to the selection list
  const handleAddProgram = async (program) => {
    // Check if already selected
    if (selectedPrograms.find(p => p.name === program.name && p.type === activeTab)) return;

    const toastId = toast.loading(`Loading requirements for ${program.name}...`);
    try {
        const reqData = await fetchDegreeRequirements(program.name.trim());
        
        let validData = null;
        if (reqData.success && reqData.data) validData = reqData.data;
        else if (reqData.schedule) validData = reqData; 
        else if (reqData.data) validData = reqData.data; 
        
        if (!validData) throw new Error("No requirements found");

        setSelectedPrograms(prev => [...prev, {
            type: activeTab,
            name: program.name,
            data: validData,
            id: Date.now()
        }]);
        setSearchTerm(""); // Clear search
        toast.success("Program added", { id: toastId });
    } catch (err) {
        console.error(err);
        toast.error("Failed to load requirements", { id: toastId });
    }
  };

  const handleRemoveProgram = (id) => {
    setSelectedPrograms(prev => prev.filter(p => p.id !== id));
  };

  // Re-run analysis whenever selected programs or refinements change
  useEffect(() => {
    if (selectedPrograms.length > 0) {
        handleAnalyze();
    } else {
        setAnalysis(null);
    }
  }, [selectedPrograms, refinements]);

  const handleAnalyze = () => {
    if (selectedPrograms.length === 0) return;
    
    // Combine data from all selected programs
    const programsData = selectedPrograms.map(p => p.data);
    
    try {
      const result = analyzeWhatIf(degreePlan, programsData, refinements);
      setAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
      toast.error("Analysis failed");
    }
  };

  // --- Refinement Handlers ---
  const handleRefineClick = (req) => {
    setRefiningRequirement(req);
    setShowCatalog(true);
    setCatalogSearch(req.name); 
    setCatalogResults([]); // Clear previous results
  };

  const handeCatalogClose = () => {
    setShowCatalog(false);
    setRefiningRequirement(null);
  };
  
  // Mock fetch candidates locally since we don't have fetchCatalogCandidates imported or passed
  // We'll rely on a simple fetch here if possible, or skip catalog search for now.
  // Ideally we import `searchCatalog` from utils/api.js, let's assume it exists or use fetch.
  // Just in case, let's skip actual API call in this step and fix import next if needed.
  // Wait, I can't add imports easily without another tool call. 
  // I'll leave search mostly empty for now but wired up.

  const handleSelectRefinement = (course) => {
      if (!refiningRequirement) return;
      const code = course.code || `${course.prefix} ${course.number}`;
      setRefinements(prev => ({
          ...prev,
          [refiningRequirement.name]: code
      }));
      setShowCatalog(false);
      setRefiningRequirement(null);
      toast.success(`Refined ${refiningRequirement.name} with ${code}`);
  };
  
  const handleMarkAsMet = (req) => {
      setRefinements(prev => ({
          ...prev,
          [req.name]: true
      }));
      toast.success(`Marked ${req.name} as met`);
  };

  const handleUnrefine = (reqName) => {
      setRefinements(prev => {
          const next = { ...prev };
          delete next[reqName];
          return next;
      });
      toast.success(`Removed refinement/override for ${reqName}`);
  };

  if (!show) return null;

  const filteredPrograms = Array.isArray(availablePrograms) ? availablePrograms.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-3/4 max-w-5xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">What-If Analysis</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Simulate changes to your degree plan.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex gap-6">
           {/* Left Panel: Configuration */}
           <div className="w-1/3 space-y-6">
                
                {/* Mode Selection */}
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                    {["majors", "minors", "certificates"].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setSearchTerm(""); }}
                            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                                activeTab === tab 
                                ? "border-wsu-crimson text-wsu-crimson" 
                                : "border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Search & Add */}
                <div className="relative">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={`Search ${activeTab}...`}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-wsu-crimson dark:bg-gray-700 dark:text-white"
                    />
                    {searchTerm && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                           {filteredPrograms.length > 0 ? (
                               filteredPrograms.map(prog => (
                                   <button
                                     key={prog.id || prog.name}
                                     onClick={() => handleAddProgram(prog)}
                                     className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm"
                                   >
                                     {prog.name}
                                   </button>
                               ))
                           ) : (
                               <div className="px-4 py-2 text-sm text-gray-500">No results found.</div>
                           )}
                        </div>
                    )}
                </div>

                {/* Selected Programs List */}
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Selected Programs</h3>
                    {selectedPrograms.length === 0 ? (
                        <div className="text-sm text-gray-500 italic">No programs selected.</div>
                    ) : (
                        selectedPrograms.map(p => (
                            <div key={p.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border">
                                <div>
                                    <div className="text-sm font-medium">{p.name}</div>
                                    <div className="text-xs text-gray-500 capitalize">{p.type}</div>
                                </div>
                                <button onClick={() => handleRemoveProgram(p.id)} className="text-red-500 hover:text-red-700">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
           </div>

           {/* Right Panel: Analysis */}
           <div className="flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-800">
              {!analysis ? (
                  <div className="flex h-full items-center justify-center text-gray-400">
                      Select a program to see analysis
                  </div>
              ) : (
                  <div className="space-y-6 animate-fadeIn">
                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-4">
                         <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                            <div className="text-2xl font-bold text-green-600">{analysis.matched.length}</div>
                            <div className="text-xs text-green-800 font-semibold uppercase">Matches</div>
                         </div>
                         <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                            <div className="text-2xl font-bold text-red-600">{analysis.missing.length}</div>
                            <div className="text-xs text-red-800 font-semibold uppercase">Remaining</div>
                         </div>
                         <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                            <div className="text-2xl font-bold text-gray-800">{analysis.missing.reduce((s,c)=>s+(c.credits||0),0)}</div>
                            <div className="text-xs text-gray-600 font-semibold uppercase">Credits Needed</div>
                         </div>
                         <div className="flex items-stretch">
                            <button 
                                onClick={() => onApply && onApply(selectedPrograms, refinements, analysis.missing)}
                                className="w-full bg-wsu-crimson hover:bg-red-800 text-white font-bold rounded-xl shadow-sm flex flex-col items-center justify-center gap-1 transition-colors"
                            >
                                <span className="text-lg">Apply Plan</span>
                                <span className="text-xs opacity-80 uppercase">Update Planner</span>
                            </button>
                         </div>
                      </div>

                      {/* Missing Requirements List */}
                      <div>
                          <h3 className="font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                             Still Required
                          </h3>
                          <div className="space-y-2">
                              {analysis.missing.length === 0 ? (
                                  <div className="text-center py-4 text-green-600 dark:text-green-400 font-medium">All requirements met!</div>
                              ) : (
                                  analysis.missing.map((req, idx) => (
                                      <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-red-100 dark:border-red-900 group">
                                          <div className="flex justify-between items-start">
                                              <div>
                                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{req.name}</div>
                                                  <div className="text-xs text-gray-500 dark:text-gray-400">{req.code !== req.name ? req.code : ''} • {req.credits} cr</div>
                                                  {req.footnotes && (
                                                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 italic border-l-2 border-gray-300 dark:border-gray-600 pl-2">
                                                          {req.footnotes}
                                                      </div>
                                                  )}
                                              </div>
                                              
                                              {/* Actions */}
                                              <div className="opacity-100 transition-opacity flex items-center gap-2">
                                                  <button
                                                      onClick={() => handleRefineClick(req)}
                                                      className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                                                  >
                                                      Find Course
                                                  </button>
                                                  <button
                                                      onClick={() => handleMarkAsMet(req)}
                                                      className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded border border-green-100 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30"
                                                  >
                                                      Mark Met
                                                  </button>
                                              </div>
                                          </div>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>

                      {/* Matched List */}
                      <div>
                           <h3 className="font-semibold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">Transferred / Met</h3>
                           <div className="space-y-2">
                               {analysis.matched.map((m, i) => {
                                   const isManual = m.matchedCourse?.code === "MET";
                                   const courseCode = m.matchedCourse ? m.matchedCourse.code : "";
                                   // Show course code only if it's a real course and different from the requirement name
                                   const showCourse = courseCode && courseCode !== "MET" && courseCode !== m.name;
                                   
                                   return (
                                     <div key={i} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-green-100 dark:border-green-900 flex justify-between items-start">
                                       <div>
                                           <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.name}</div>
                                           {showCourse && (
                                               <div className="text-xs text-gray-600 dark:text-gray-400">Met by: <span className="font-semibold text-gray-800 dark:text-gray-200">{courseCode}</span></div>
                                           )}
                                           {isManual && (
                                               <div className="text-xs text-gray-500 italic">Manually marked as met</div>
                                           )}
                                           <div className="text-xs text-gray-500 mt-0.5">{m.credits} cr</div>
                                       </div>
                                       <div className="flex items-center gap-2">
                                            {refinements[m.name] && (
                                                <button onClick={() => handleUnrefine(m.name)} className="px-2 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-100 transition-colors dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                                                    Reset
                                                </button>
                                            )}
                                            <div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                <span className="text-green-600 dark:text-green-400 text-xs font-bold">✔</span>
                                            </div>
                                       </div>
                                   </div>
                                 );
                               })}
                           </div>
                      </div>
                  </div>
              )}
           </div>
        </div>

      </div>
      
      {/* Catalog Modal Integration */}
      {showCatalog && (
        <CatalogModal
          show={showCatalog}
          onClose={handeCatalogClose}
          // Pass minimum props to make it work or display simplified view
          // Ideally updated CatalogModal handles 'simple' mode. 
          // For now, assume it works with basic props.
          catalogSearch={catalogSearch}
          setCatalogSearch={setCatalogSearch}
          catalogResults={catalogResults}
          filteredCatalogResults={catalogResults} // Pass results as filtered results
          availableUcoreCats={[]} // Safe default
          catalogYears={[]} // Safe default
          fetchCatalogCandidates={async (q) => { 
              if (!q) return;
              try {
                  const res = await searchCatalogCourses(q);
                  // Handle potential response structures
                  const data = res.data || res;
                  setCatalogResults(Array.isArray(data) ? data : []);
              } catch (e) {
                  console.error(e);
                  toast.error("Failed to search catalog");
                  setCatalogResults([]);
              }
          }}  
          addCatalogCourseToPlan={(course) => handleSelectRefinement(course)}
          // Mock other required props to prevent crash
          years={years || []}
          activeYearTab={null}
          // ... 
        />
      )}
    </div>
  );
}
