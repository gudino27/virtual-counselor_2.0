import ExcelJS from "exceljs";
import toast from "react-hot-toast";

// Helper to format date for ICS
const formatICSDate = (date) => {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

export const exportToICS = async ({ degreePlan, years }) => {
  let icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Virtual Counselor//Degree Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ].join("\r\n");

  const termMap = {
    fall: { month: 8, day: 1 },    // Approx Sept 1
    spring: { month: 1, day: 10 }, // Approx Jan 10
    summer: { month: 5, day: 15 }  // Approx May 15
  };

  // Iterate through plan to find "Planned" or "In-Progress" courses
  Object.keys(degreePlan).forEach(yearId => {
    // Find the year name to guess the calendar year
    const yearObj = years.find(y => y.id === parseInt(yearId));
    if (!yearObj) return;
    
    // Very rough heuristic: "Year 1" -> currentYear, "Year 2" -> currentYear+1, etc.
    // Ideally we'd ask user for start year, but for now we'll assume Year 1 starts this Fall.
    // Or better: Use the year number if available or default to relative.
    // Since we don't have absolute years, let's just use "future" dates based on current year.
    // This is a limitation without real calendar years.
    // Let's assume Year 1 = Current Year.
    const yearIndex = years.findIndex(y => y.id === parseInt(yearId));
    const baseYear = new Date().getFullYear() + yearIndex;
    
    ["fall", "spring", "summer"].forEach(term => {
      const courses = degreePlan[yearId][term]?.courses || [];
      courses.forEach(course => {
        if (!course.name) return;
        
        // Only export planned or in-progress courses
        // if (course.status === 'taken') return; // Maybe user wants past schedule too? Let's export all.
        
        const termStart = termMap[term];
        // Spring is usually in the NEXT calendar year relative to Fall of academic year? 
        // WSU: Fall 2024, Spring 2025.
        // If "Year 1" is Academic Year, then Fall is Year X, Spring/Summer are Year X+1.
        
        let eventYear = baseYear;
        if (term !== 'fall') eventYear += 1;
        
        const startDate = new Date(eventYear, termStart.month - 1, termStart.day, 8, 0, 0);
        const endDate = new Date(eventYear, termStart.month - 1, termStart.day, 9, 0, 0); // 1 hour dummy slot
        
        const uid = `${course.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}@virtualcounselor.com`;
        const dtStamp = formatICSDate(new Date());
        const dtStart = formatICSDate(startDate);
        const dtEnd = formatICSDate(endDate);
        
        const eventBlock = [
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${dtStamp}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `SUMMARY:${course.name}`,
          `DESCRIPTION:Credits: ${course.credits || 0}\\nStatus: ${course.status}\\nGrade: ${course.grade || 'N/A'}`,
          "STATUS:CONFIRMED",
          "END:VEVENT"
        ].join("\r\n");
        
        icsContent += "\r\n" + eventBlock;
      });
    });
  });

  icsContent += "\r\nEND:VCALENDAR";

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "degree-plan-calendar.ics";
  a.click();
  toast.success("Calendar (.ics) exported!");
};

export const exportToExcel = async ({
  years,
  degreePlan,
  selectedPrograms,
  selectedYear,
  calculateCreditsRequired, // Pass function or value? Best to pass value if fixed, or function if dynamic logic needed inside. 
                           // But logic uses `calculateCreditsRequired()` so I should pass the value or the function. 
                           // Looking at original code: `setMeta(6, "Required Credits:", calculateCreditsRequired() || 120);`
                           // I will pass the calculateCreditsRequired function for now to keep it flexible, or just the value. 
                           // Actually, `handleExport` calls `calculateCreditsRequired()`.
  gpa,                     // used for GPA formula fallback? No, formula is dynamic. 
                           // Wait, "Cumulative GPA" uses formulaGPA.
                           // Does it use `gpa` variable? No, `gpa` variable is passed to PDF print, but here it constructs a formula.
                           // Let's check imports.
}) => {
  const workbook = new ExcelJS.Workbook();
  const sheetName = "WSU Degree Plan";
  const worksheet = workbook.addWorksheet(sheetName);
  workbook.calcProperties.fullCalcOnLoad = true;
  const terms = ["Fall", "Spring", "Summer"];

  // Define columns relative widths manually to avoid Row 1 conflicts
  // Columns A-D (Fall), E-H (Spring), I-L (Summer)
  // Indexes: 1,2,3,4 | 5,6,7,8 | 9,10,11,12
  const setColWidths = (startCol) => {
    worksheet.getColumn(startCol).width = 45; // Course
    worksheet.getColumn(startCol + 1).width = 14; // Credits
    worksheet.getColumn(startCol + 2).width = 15; // Grade
    worksheet.getColumn(startCol + 3).width = 10; // Points
  };
  setColWidths(1); // Fall
  setColWidths(5); // Spring
  setColWidths(9); // Summer

  // Metadata columns (M=13, N=14, O=15)
  worksheet.getColumn(13).width = 25;
  worksheet.getColumn(14).width = 25;
  worksheet.getColumn(15).width = 15;

  const getHeaderFill = () => ({
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF981E32" },
  }); // WSU Crimson
  const getHeaderFont = () => ({
    bold: true,
    color: { argb: "FFFFFFFF" },
    name: "Calibri",
    size: 12,
  });
  const getTermHeaderFill = () => ({
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD3D3D3" },
  }); // Light Grey matches image
  const getTermHeaderFont = () => ({ bold: true, name: "Calibri", size: 11 });
  const getBorderStyle = () => ({
    style: "thin",
    color: { argb: "FF000000" },
  }); // Standard black thin border

  // Helper: convert column number to Excel letter
  const colToLetter = (col) => {
    let temp = "";
    let letter = "";
    while (col > 0) {
      temp = (col - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      col = Math.floor((col - 1) / 26);
    }
    return letter;
  };

  // --- METADATA SIDEBAR SETUP ---
  const metaColStart = 13;
  const setMeta = (row, label, val = "", isTotal = false) => {
    const cellLabel = worksheet.getCell(row, metaColStart);
    cellLabel.value = label;
    cellLabel.font = { bold: true, name: "Calibri" };
    if (isTotal) {
      cellLabel.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
      };
    }

    if (val !== undefined && val !== null) {
      const cellVal = worksheet.getCell(row, metaColStart + 1);
      cellVal.value = val;
      cellVal.font = { name: "Calibri" };
      if (isTotal) {
        cellVal.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD9D9D9" },
        };
      }
    }
  };

  // Sidebar: "WSU DEGREE PLAN" Header
  const sidebarTitle = worksheet.getCell(1, metaColStart);
  sidebarTitle.value = "WSU DEGREE PLAN";
  sidebarTitle.font = {
    bold: true,
    color: { argb: "FF981E32" },
    size: 14,
    name: "Calibri",
  };

  // Sidebar: Student Info
  setMeta(3, "STUDENT INFORMATION");
  worksheet.getCell(3, metaColStart).font = { bold: true, underline: true };

  setMeta(
    4,
    "Degree:",
    selectedPrograms?.majors?.[0]?.name ||
      selectedPrograms?.minors?.[0]?.name ||
      "Custom"
  );
  setMeta(5, "Catalog Year:", selectedYear || "");
  
  // NOTE: Calling the passed function
  const creditsRequired = typeof calculateCreditsRequired === 'function' 
    ? calculateCreditsRequired() 
    : (calculateCreditsRequired || 120);

  setMeta(6, "Required Credits:", creditsRequired);

  setMeta(8, "Minors:");
  const minorNames =
    (selectedPrograms?.minors || []).map((m) => m.name).join(", ") ||
    "None selected";
  setMeta(9, minorNames);

  setMeta(11, "Exported:", new Date().toLocaleString());

  setMeta(13, "DEGREE PLAN SUMMARY");
  worksheet.getCell(13, metaColStart).font = {
    bold: true,
    color: { argb: "FF981E32" },
  };

  // Credit Summary Table
  setMeta(15, "Credit Summary", "Credits", true); // Header row styled grey

  // FORMULAS:
  // Completed: Sum of credits where grade is NOT empty
  const formulaCompleted =
    'SUMIFS(B:B,C:C,"<>")+SUMIFS(F:F,G:G,"<>")+SUMIFS(J:J,K:K,"<>")';
  // Planned: Sum of credits where grade IS empty but Course Name is NOT empty
  const formulaPlanned =
    'SUMIFS(B:B,C:C,"",A:A,"<>")+SUMIFS(F:F,G:G,"",E:E,"<>")+SUMIFS(J:J,K:K,"",I:I,"<>")';

  // N16 = Completed, N17 = Planned
  const cellCompleted = worksheet.getCell(16, metaColStart + 1);
  cellCompleted.value = { formula: formulaCompleted };
  cellCompleted.font = { name: "Calibri" };

  const cellPlanned = worksheet.getCell(17, metaColStart + 1);
  cellPlanned.value = { formula: formulaPlanned };
  cellPlanned.font = { name: "Calibri" };

  const cellTotal = worksheet.getCell(18, metaColStart + 1);
  cellTotal.value = { formula: "SUM(N16:N17)" }; // Total
  cellTotal.font = { name: "Calibri" };

  const cellReq = worksheet.getCell(19, metaColStart + 1);
  cellReq.value = 120; // Fixed req
  cellReq.font = { name: "Calibri" };

  setMeta(16, "Completed Credits");
  setMeta(17, "Planned Credits");
  setMeta(18, "Total Credits");
  setMeta(19, "Credits to Graduate");

  // GPA: Total Points / Completed Credits (Avoid DIV/0)
  const formulaGPA = "IF(N16=0,0,(SUM(D:D)+SUM(H:H)+SUM(L:L))/N16)";
  setMeta(21, "Cumulative GPA");
  const cellGPA = worksheet.getCell(21, metaColStart + 1);
  cellGPA.value = { formula: formulaGPA };
  cellGPA.numFmt = "0.00";
  cellGPA.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF2CC" },
  }; // Light yellow

  // --- MAIN EXPORT LOOP ---

  let currentRow = 1;

  years.forEach((year) => {
    // 1. Year Header
    const yearCell = worksheet.getCell(currentRow, 1);
    yearCell.value = year.name.toUpperCase();
    yearCell.fill = getHeaderFill();
    yearCell.font = getHeaderFont();
    yearCell.alignment = { horizontal: "center", vertical: "middle" };
    const border = getBorderStyle();
    yearCell.border = {
      top: border,
      bottom: border,
      left: border,
      right: border,
    };
    worksheet.mergeCells(currentRow, 1, currentRow, 12);
    currentRow++;

    // 2. Term Headers
    let colIdx = 1;
    terms.forEach((t) => {
      const c1 = worksheet.getCell(currentRow, colIdx);
      c1.value = t.toUpperCase();
      const c2 = worksheet.getCell(currentRow, colIdx + 1);
      c2.value = "CREDITS";
      const c3 = worksheet.getCell(currentRow, colIdx + 2);
      c3.value = "GRADE";
      const c4 = worksheet.getCell(currentRow, colIdx + 3);
      c4.value = "POINTS";

      [c1, c2, c3, c4].forEach((cell) => {
        cell.fill = getTermHeaderFill();
        cell.font = getTermHeaderFont();
        cell.alignment = { horizontal: "center", vertical: "middle" };
        const border = getBorderStyle();
        cell.border = {
          top: border,
          bottom: border,
          left: border,
          right: border,
        };
      });
      colIdx += 4;
    });
    currentRow++;

    // 3. Data Rows
    // Filter out null/undefined entries to prevent ghost rows
    const getCourses = (term) => {
      const list =
        (degreePlan[year.id] &&
          degreePlan[year.id][term] &&
          degreePlan[year.id][term].courses) ||
        [];
      return list.filter((c) => c && c.name); // only count real courses
    };
    const fall = getCourses("fall");
    const spring = getCourses("spring");
    const summer = getCourses("summer");

    const rowsNeeded = Math.max(fall.length, spring.length, summer.length, 1);

    for (let i = 0; i < rowsNeeded; i++) {
      const row = worksheet.getRow(currentRow);
      row.height = 18;

      const writeTerm = (courseList, startCol) => {
        const c = courseList[i];
        if (c) {
          row.getCell(startCol).value = c.name || "";
          row.getCell(startCol + 1).value = Number(c.credits) || 0;
          row.getCell(startCol + 2).value = c.grade ? c.grade : null;
        }
      };

      writeTerm(fall, 1);
      writeTerm(spring, 5);
      writeTerm(summer, 9);

      let cBase = 1;
      for (let t = 0; t < 3; t++) {
        // Borders
        for (let k = 0; k < 4; k++) {
          const border = getBorderStyle();
          row.getCell(cBase + k).border = {
            top: border,
            bottom: border,
            left: border,
            right: border,
          };
        }

        const credAddr = `${colToLetter(cBase + 1)}${currentRow}`;
        const gradeAddr = `${colToLetter(cBase + 2)}${currentRow}`;

        const ptsCell = row.getCell(cBase + 3);
        // Use nested IFs instead of SWITCH for maximum compatibility (prevents 'Repaired Records' on older Excel)
        // Grades: A=4, A-=3.7, B+=3.3, B=3, B-=2.7, C+=2.3, C=2, C-=1.7, D+=1.3, D=1, F=0
        const gVal = `MID(${gradeAddr},1,2)`;
        const formulaStr = `IF(${gVal}="A",4,IF(${gVal}="A-",3.7,IF(${gVal}="B+",3.3,IF(${gVal}="B",3,IF(${gVal}="B-",2.7,IF(${gVal}="C+",2.3,IF(${gVal}="C",2,IF(${gVal}="C-",1.7,IF(${gVal}="D+",1.3,IF(${gVal}="D",1,IF(${gVal}="F",0,0)))))))))))`;

        ptsCell.value = {
          formula: `IF(${gradeAddr}="","",IFERROR(${formulaStr}*${credAddr},0))`,
        };
        cBase += 4;
      }
      currentRow++;
    }

    // 4. TOTAL CREDITS Row
    const totalRow = worksheet.getRow(currentRow);

    // Removed row-level font/height to prevent XML corruption on merged cells

    const termsLists = [fall, spring, summer];
    let baseCol = 1;

    termsLists.forEach((list) => {
      // "TOTAL CREDITS"
      const labelCell = totalRow.getCell(baseCol);
      labelCell.value = "TOTAL CREDITS";
      // Explicitly set font since we removed row-level font
      labelCell.font = { bold: true, name: "Calibri" };
      const totalBorder = getBorderStyle();
      labelCell.border = {
        top: { style: "double" },
        bottom: { style: "double" },
        left: totalBorder,
        right: totalBorder,
      };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFEFEF" },
      };

      // Future/Achieved
      // Convert static values to dynamic formulas relative to the current block
      // Range for this term's credits: colToLetter(baseCol+1) from (currentRow - rowsNeeded) to (currentRow - 1)
      // Range for this term's grades: colToLetter(baseCol+2) ...

      const startRow = currentRow - rowsNeeded;
      const endRow = currentRow - 1;
      const credCol = colToLetter(baseCol + 1);
      const gradeCol = colToLetter(baseCol + 2);
      const rangeCreds = `${credCol}${startRow}:${credCol}${endRow}`;
      const rangeGrades = `${gradeCol}${startRow}:${gradeCol}${endRow}`;

      // Formula: ="future: " & SUMIFS(Creds, Grades, "")
      const fFuture = `SUMIFS(${rangeCreds},${rangeGrades},"")`;
      // Formula: ="credits achieved: " & SUMIFS(Creds, Grades, "<>")
      const fAchieved = `SUMIFS(${rangeCreds},${rangeGrades},"<>")`;

      // Col 2: Future
      const futureCell = totalRow.getCell(baseCol + 1);
      futureCell.value = { formula: `"future: " & ${fFuture}` };
      futureCell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      futureCell.font = { size: 9, bold: true, name: "Calibri" };
      futureCell.border = {
        top: { style: "double" },
        bottom: { style: "double" },
        left: totalBorder,
        right: totalBorder,
      };

      // Col 3: Achieved
      const achievedCell = totalRow.getCell(baseCol + 2);
      achievedCell.value = { formula: `"credits achieved: " & ${fAchieved}` };
      achievedCell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      achievedCell.font = { size: 9, bold: true, name: "Calibri" };
      achievedCell.border = {
        top: { style: "double" },
        bottom: { style: "double" },
        left: totalBorder,
        right: totalBorder,
      };

      // No Merge

      // Points Sum -> Term GPA
      // Formula: IF(Achieved=0, 0, SUM(Points)/Achieved)
      // Points range: colToLetter(baseCol+3) startRow:endRow
      // Achieved credits is fAchieved
      const pointsCol = colToLetter(baseCol + 3);
      const rangePoints = `${pointsCol}${startRow}:${pointsCol}${endRow}`;

      const sumCell = totalRow.getCell(baseCol + 3);
      // Terms GPA: IF(Achieved=0, 0, SumPoints/Achieved)
      // AchievedCredits (fAchieved) automatically excludes future courses.
      sumCell.value = {
        formula: `IF(${fAchieved}=0,0,SUM(${rangePoints})/${fAchieved})`,
      };
      sumCell.numFmt = "0.00"; // Format as decimal
      sumCell.font = { bold: true, name: "Calibri" };
      sumCell.border = {
        top: { style: "double" },
        bottom: { style: "double" },
        left: totalBorder,
        right: totalBorder,
      };
      sumCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFEFEF" },
      };
      sumCell.alignment = { horizontal: "center", vertical: "middle" };

      baseCol += 4;
    });
    currentRow++;

    // 5. Spacer (Skip row)
    currentRow++;
  });

  // Hidden JSON backup sheet
  const backup = workbook.addWorksheet("__json_backup");
  backup.state = "veryHidden";
  const backupJson = JSON.stringify({
    plan: degreePlan,
    years,
    programs: selectedPrograms,
  });
  const maxChunk = 32000;
  for (let i = 0; i < backupJson.length; i += maxChunk) {
    backup.addRow([backupJson.slice(i, i + maxChunk)]);
  }

  // Generate file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().split("T")[0];
  a.download = `wsu-degree-plan-${dateStr}.xlsx`;
  a.click();
  toast.success("Degree plan exported successfully");
};

export const importFromExcel = async (
  file,
  { setYears, setDegreePlan, setSelectedPrograms }
) => {
  if (!file) return;

  try {
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);

    // Prefer the hidden JSON backup for an exact round-trip restore
    const backupSheet = workbook.getWorksheet("__json_backup");
    if (backupSheet) {
      // reassemble JSON from rows
      let jsonStr = "";
      backupSheet.eachRow((row) => {
        const v = row.getCell(1).value;
        if (v) jsonStr += String(v);
      });
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.plan) {
          // if years array present, prefer it
          if (parsed.years) setYears(parsed.years);
          setDegreePlan(parsed.plan || {});
          setSelectedPrograms(
            parsed.programs || { majors: [], minors: [], certificates: [] }
          );
          toast.success("Import successful (restored from hidden backup).");
          return;
        }
      } catch (e) {
        // fall through to legacy parsing if JSON malformed
        console.warn("Failed to parse __json_backup:", e);
      }
    }

    // Fallback: try legacy sheet names (either 'WSU Degree Plan' or 'Degree Plan')
    const worksheet =
      workbook.getWorksheet("WSU Degree Plan") ||
      workbook.getWorksheet("Degree Plan");
    if (!worksheet) throw new Error("Degree Plan sheet not found");

    // Legacy parsing assumes the stacked per-year layout where each year has a title row,
    // two header rows, then N rows of term-aligned courses. We'll extract by scanning rows.
    const newPlan = {};
    if (years) {
      years.forEach((year) => {
        newPlan[year.id] = {
          fall: { courses: [] },
          spring: { courses: [] },
          summer: { courses: [] },
        };
      });
    }

    // We'll iterate rows and detect title rows by checking if the first cell contains a Year name.
    const yearNameToId = years ? Object.fromEntries(
      years.map((y) => [String(y.name), y.id])
    ) : {};

    let currentYearId = null;
    let inDataSection = false;
    let headerRowsSeen = 0;

    worksheet.eachRow((row, rowNumber) => {
      const first = row.getCell(1).value;
      if (first && typeof first === "string" && yearNameToId[first.trim()]) {
        // Title row
        currentYearId = yearNameToId[first.trim()];
        inDataSection = false;
        headerRowsSeen = 0;
        return;
      }

      // Detect sub-header rows (Course/Credits/Grade/Points)
      const maybeCourse = row.getCell(2).value;
      if (
        maybeCourse &&
        String(maybeCourse).toLowerCase().includes("course")
      ) {
        headerRowsSeen += 1;
        // after two header rows, next rows are data
        if (headerRowsSeen >= 1) inDataSection = true;
        return;
      }

      if (!currentYearId || !inDataSection) return;

      // Data row: columns are spacer | FallCourse | FallCredits | FallGrade | FallPoints | SpringCourse | ...
      // We'll extract each term's Course, Credits, Grade
      try {
        const getVal = (colIdx) => {
          const v = row.getCell(colIdx).value;
          if (v && v.result !== undefined && v.formula) return ""; // formula cell
          return v;
        };

        // fall columns start at 2
        const base = 2;
        const fallCourse = getVal(base);
        const fallCredits = parseFloat(getVal(base + 1)) || 0;
        const fallGrade = getVal(base + 2) || "";
        if (fallCourse)
          newPlan[currentYearId].fall.courses.push({
            id: Date.now() + Math.random(),
            name: String(fallCourse),
            credits: fallCredits,
            grade: String(fallGrade || ""),
            status: "not-taken",
          });

        const springCourse = getVal(base + 4);
        const springCredits = parseFloat(getVal(base + 5)) || 0;
        const springGrade = getVal(base + 6) || "";
        if (springCourse)
          newPlan[currentYearId].spring.courses.push({
            id: Date.now() + Math.random(),
            name: String(springCourse),
            credits: springCredits,
            grade: String(springGrade || ""),
            status: "not-taken",
          });

        const summerCourse = getVal(base + 8);
        const summerCredits = parseFloat(getVal(base + 9)) || 0;
        const summerGrade = getVal(base + 10) || "";
        if (summerCourse)
          newPlan[currentYearId].summer.courses.push({
            id: Date.now() + Math.random(),
            name: String(summerCourse),
            credits: summerCredits,
            grade: String(summerGrade || ""),
            status: "not-taken",
          });
      } catch (err) {
        // ignore row parse errors
      }
    });

    setDegreePlan(newPlan);
    toast.success("Import successful (legacy parsing).");
  } catch (error) {
    console.error("Import error:", error);
    toast.error("Error importing file. Please check format.");
  }
};
