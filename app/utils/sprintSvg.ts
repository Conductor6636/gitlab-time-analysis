type SprintSvgColumn = {
  id: string;
  title: string;
};

type SprintSvgRow = {
  name: string;
  seconds: number[];
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function createSprintOverviewSvg(
  title: string,
  columns: SprintSvgColumn[],
  rows: SprintSvgRow[],
) {
  const memberWidth = 220;
  const categoryWidth = 180;
  const totalWidth = 120;
  const headerHeight = 48;
  const rowHeight = 40;
  const totalHeight = 44;
  const width = memberWidth + categoryWidth * columns.length + totalWidth;
  const height = headerHeight + rowHeight * rows.length + totalHeight;
  const totals = columns.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.seconds[index] || 0), 0),
  );
  const overallTotal = totals.reduce((sum, value) => sum + value, 0);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<rect width="${width}" height="${headerHeight}" fill="#f3f4f6"/>`,
    `<text x="14" y="30" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#111827">Member</text>`,
  ];

  columns.forEach((column, index) => {
    const x = memberWidth + categoryWidth * index;
    parts.push(
      `<text x="${x + categoryWidth / 2}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${escapeXml(column.title)}</text>`,
    );
  });
  parts.push(
    `<text x="${width - totalWidth / 2}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">Sum (hrs)</text>`,
  );

  rows.forEach((row, rowIndex) => {
    const y = headerHeight + rowHeight * rowIndex;
    const rowTotal = row.seconds.reduce((sum, value) => sum + value, 0);
    if (rowIndex % 2 === 1) {
      parts.push(
        `<rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="#f9fafb"/>`,
      );
    }
    parts.push(
      `<text x="14" y="${y + 25}" font-family="Arial, sans-serif" font-size="13" fill="#111827">${escapeXml(row.name)}</text>`,
    );
    columns.forEach((_, columnIndex) => {
      const x = memberWidth + categoryWidth * (columnIndex + 1) - 12;
      parts.push(
        `<text x="${x}" y="${y + 25}" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="#111827">${((row.seconds[columnIndex] || 0) / 3600).toFixed(2)}</text>`,
      );
    });
    parts.push(
      `<text x="${width - 12}" y="${y + 25}" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#111827">${(rowTotal / 3600).toFixed(2)}</text>`,
      `<line x1="0" y1="${y + rowHeight}" x2="${width}" y2="${y + rowHeight}" stroke="#e5e7eb"/>`,
    );
  });

  const totalY = headerHeight + rowHeight * rows.length;
  parts.push(
    `<rect x="0" y="${totalY}" width="${width}" height="${totalHeight}" fill="#f3f4f6"/>`,
    `<text x="14" y="${totalY + 27}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">Total</text>`,
  );
  columns.forEach((_, index) => {
    const x = memberWidth + categoryWidth * (index + 1) - 12;
    parts.push(
      `<text x="${x}" y="${totalY + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${(totals[index] / 3600).toFixed(2)}</text>`,
    );
  });
  parts.push(
    `<text x="${width - 12}" y="${totalY + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111827">${(overallTotal / 3600).toFixed(2)}</text>`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#d1d5db"/>`,
    "</svg>",
  );
  return parts.join("");
}
