function getTaskSheet_() {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(TASK_SHEET);

  if (!sheet) {
    throw new Error(`Missing sheet named "${TASK_SHEET}".`);
  }

  return sheet;
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getProjectSheet_() {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(PROJECT_SHEET) || spreadsheet.insertSheet(PROJECT_SHEET);

  if (!String(sheet.getRange(1, 1).getValue() || '').trim()) {
    sheet.getRange(1, 1).setValue('Project');
  }

  return sheet;
}

function getTaskRows_() {
  const sheet = getTaskSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, 9).getValues();
}

function getProjectNames_() {
  const sheet = getProjectSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map((row) => normalizeProjectName_(row[0]))
    .filter(Boolean);
}

function buildProjects_(names) {
  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-teal-500', 'bg-rose-500'];
  const seen = {};

  return (names || [])
    .map(normalizeProjectName_)
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen[key]) return false;
      seen[key] = true;
      return true;
    })
    .map((name, index) => ({
      id: name,
      name,
      color: colors[index % colors.length],
    }));
}

function rowToTask_(row, index) {
  const rowNumber = index + 2;
  const title = String(row[0] || '').trim();

  if (!title) {
    return null;
  }

  const rawStatus = String(row[3] || '').trim();

  return {
    id: taskIdForRow_(row, rowNumber),
    title,
    date: valueToIso_(row[2]),
    completed: booleanValue_(row[1]) || rawStatus.toLowerCase() === 'done',
    status: mapSheetStatus_(rawStatus),
    isTop: isTopOfMind_(rawStatus),
    team: booleanValue_(row[5]),
    detail: String(row[6] || ''),
    projectId: joinProjectNames_(row[8]),
    projectIds: normalizeProjectNames_(row[8]),
  };
}

function buildTaskSheetRow_(rowNumber, currentRow, updates) {
  const update = updates || {};
  let title = update.title !== undefined ? update.title : currentRow[0];
  let completed = update.completed !== undefined ? update.completed === true : booleanValue_(currentRow[1]);
  let taskDate = update.date !== undefined ? isoToDate_(update.date) : valueToDate_(currentRow[2]);
  let topOfMind = isTopOfMind_(currentRow[3]);
  let status = mapSheetStatus_(currentRow[3]);
  let team = update.team !== undefined ? update.team === true : booleanValue_(currentRow[5]);
  let detail = update.detail !== undefined ? update.detail : currentRow[6];
  const appId = currentRow[7] || update.id || '';
  const projectId = update.projectIds !== undefined
    ? joinProjectNames_(update.projectIds)
    : update.projectId !== undefined
      ? joinProjectNames_(update.projectId)
      : joinProjectNames_(currentRow[8]);

  if (update.status) {
    status = update.status;
    topOfMind = false;
  }

  if (update.isTop !== undefined) {
    topOfMind = update.isTop === true;
  }

  return [
    title || '',
    completed,
    taskDate || '',
    topOfMind ? 'Top of mind' : statusToSheetValue_(status),
    '',
    team,
    detail || '',
    appId,
    projectId,
  ];
}

function resolveRowNumber_(id, rows) {
  // Persisted IDs are opaque, including legacy strings such as "row-17".
  const stableIndex = rows.findIndex((row) => String(row[7] || '') === id);
  if (stableIndex !== -1) return stableIndex + 2;
  if (PropertiesService.getScriptProperties().getProperty('native:backup')) return undefined;
  const directMatch = /^row-(\d+)$/.exec(String(id || ''));

  if (directMatch) {
    return Number(directMatch[1]);
  }

  if (id === 'top-of-mind-id') {
    const topIndex = rows.findIndex((row) => isTopOfMind_(row[3]));
    return topIndex === -1 ? undefined : topIndex + 2;
  }

  const appIdIndex = rows.findIndex((row) => String(row[7] || '') === id);
  return appIdIndex === -1 ? undefined : appIdIndex + 2;
}

function taskIdForRow_(row, rowNumber) {
  const appId = String(row[7] || '').trim();

  if (isTopOfMind_(row[3]) && !appId) {
    return 'top-of-mind-id';
  }

  return appId || `row-${rowNumber}`;
}

function booleanValue_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}

function isTopOfMind_(value) {
  return String(value || '').trim().toLowerCase() === 'top of mind';
}

function mapSheetStatus_(value) {
  const status = String(value || '').trim().toLowerCase();

  if (status === 'upcoming') return 'upcoming';
  if (status === 'coming') return 'upcoming';
  if (status === 'later') return 'later';

  return 'today';
}

function statusToSheetValue_(status) {
  if (status === 'upcoming') return 'Upcoming';
  if (status === 'later') return 'Later';
  return 'Today';
}

function valueToIso_(value) {
  const date = valueToDate_(value);
  return date ? date.toISOString() : '';
}

function valueToDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * MS_PER_DAY);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function isoToDate_(value) {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeProjectName_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeProjectNames_(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,\n]+/);
  const seen = {};

  return values
    .map(normalizeProjectName_)
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function joinProjectNames_(value) {
  return normalizeProjectNames_(value).join(', ');
}
