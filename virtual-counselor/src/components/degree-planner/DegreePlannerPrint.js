import toast from "react-hot-toast";

export const printDegreePlan = ({
  selectedPrograms,
  selectedYear,
  gpa,
  creditsAchieved,
  creditsPlanned,
  creditsRequired,
  years,
  degreePlan,
}) => {
  // Create a print-friendly version of the degree plan
  const printContent = document.createElement("div");
  // Build the inner printable content (no footer here - we'll render a fixed footer)
  printContent.innerHTML = `
      <style>
        /* original print styles (scoped inside body) */
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #333; padding: 8px; text-align: left; font-size: 11px; }
        th { background-color: #981E32; color: white; }
        .term-header { background-color: #f0f0f0; font-weight: bold; }
        h1 { color: #981E32; margin-bottom: 10px; }
        h2 { color: #333; margin: 15px 0 10px 0; font-size: 14px; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat-box { padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .progress-bar { height: 20px; background: #e5e5e5; border-radius: 4px; margin: 10px 0; }
        .progress-fill { height: 100%; background: #10b981; border-radius: 4px; }
      </style>
      <div id="print-content">
        <h1>WSU Degree Plan</h1>
        <p><strong>Degree:</strong> ${
          selectedPrograms?.majors?.[0]?.name || "Not Selected"
        }</p>
        <p><strong>Catalog Year:</strong> ${selectedYear || "Current"}</p>
        ${
          selectedPrograms?.minors?.length
            ? `<p><strong>Minors:</strong> ${selectedPrograms.minors
                .map((m) => m.name)
                .join(", ")}</p>`
            : ""
        }
        ${
          selectedPrograms?.certificates?.length
            ? `<p><strong>Certificates:</strong> ${selectedPrograms.certificates
                .map((c) => c.name)
                .join(", ")}</p>`
            : ""
        }

        <div class="stats">
          <div class="stat-box"><strong>GPA:</strong> ${gpa}</div>
          <div class="stat-box"><strong>Credits Achieved:</strong> ${creditsAchieved}</div>
          <div class="stat-box"><strong>Credits Planned:</strong> ${creditsPlanned}</div>
          <div class="stat-box"><strong>Credits Required:</strong> ${creditsRequired}</div>
          <div class="stat-box"><strong>Progress:</strong> ${
            creditsRequired > 0
              ? Math.round((creditsAchieved / creditsRequired) * 100)
              : 0
          }%</div>
        </div>

        ${years
          .map((year) => {
            const yearData = degreePlan[year.id] || {
              fall: { courses: [] },
              spring: { courses: [] },
              summer: { courses: [] },
            };
            return `
            <h2>${year.name}</h2>
            <table>
              <tr>
                <th colspan="4">Fall</th>
                <th colspan="4">Spring</th>
                <th colspan="4">Summer</th>
              </tr>
              <tr class="term-header">
                <td>Course</td><td>Cr</td><td>Status</td><td>Grade</td>
                <td>Course</td><td>Cr</td><td>Status</td><td>Grade</td>
                <td>Course</td><td>Cr</td><td>Status</td><td>Grade</td>
              </tr>
              ${(() => {
                const maxRows = Math.max(
                  yearData.fall.courses.length,
                  yearData.spring.courses.length,
                  yearData.summer.courses.length,
                  1
                );
                let rows = "";
                for (let i = 0; i < maxRows; i++) {
                  const fall = yearData.fall.courses[i] || {};
                  const spring = yearData.spring.courses[i] || {};
                  const summer = yearData.summer.courses[i] || {};
                  rows += "<tr>";
                  rows +=
                    "<td>" +
                    (fall.name || "") +
                    "</td><td>" +
                    (fall.credits || "") +
                    "</td><td>" +
                    (fall.status || "") +
                    "</td><td>" +
                    (fall.grade || "") +
                    "</td>";
                  rows +=
                    "<td>" +
                    (spring.name || "") +
                    "</td><td>" +
                    (spring.credits || "") +
                    "</td><td>" +
                    (spring.status || "") +
                    "</td><td>" +
                    (spring.grade || "") +
                    "</td>";
                  rows +=
                    "<td>" +
                    (summer.name || "") +
                    "</td><td>" +
                    (summer.credits || "") +
                    "</td><td>" +
                    (summer.status || "") +
                    "</td><td>" +
                    (summer.grade || "") +
                    "</td>";
                  rows += "</tr>";
                }
                return rows;
              })()}
            </table>
          `;
          })
          .join("")}
      </div>
    `;

  // Build a full HTML document so the <title> is honored and we can add page-level rules
  const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>WSU Degree Plan</title>
          <style>
            
            @page { margin: 3mm 1cm; }
            @media print {
              body { margin: 0; -webkit-print-color-adjust: exact; }
              /* Keep the content visible and allow fixed footer space */
              #print-content { box-sizing: border-box; padding-bottom: 28mm; }
              #print-footer { position: fixed; left: 0; right: 0; bottom: 8mm; text-align: center; font-size: 10px; color: #333; }
              /* Re-apply table and typography styles for print */
              table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
              th, td { border: 1px solid #333; padding: 8px; text-align: left; font-size: 11px; }
              th { background-color: #981E32; color: white; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>`;

  // Open print dialog and trigger print after the document loads so <title> and layout apply
  const printWindow = window.open("", "_blank");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    try {
      printWindow.print();
    } catch (e) {
      console.warn("Print failed", e);
    }
  };
  toast.success('Print dialog opened - select "Save as PDF" to export');
};
