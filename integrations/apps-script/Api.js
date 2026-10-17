function apiGetData() {
  const rows = getTaskRows_();
  const tasks = rows
    .map((row, index) => rowToTask_(row, index))
    .filter(Boolean);
  const projectNames = getProjectNames_().concat(tasks.flatMap((task) => task.projectIds || normalizeProjectNames_(task.projectId)));

  return {
    writeProtocol: 2,
    tasks,
    projects: buildProjects_(projectNames),
  };
}

function apiCreateTask(task) {
  const sheet = getTaskSheet_();
  const rows = getTaskRows_();
  const rowNumber = Math.max(sheet.getLastRow() + 1, rows.length + 2);
  const newTask = task || {};
  const taskId = newTask.id || `task-${Date.now()}`;
  // doPost holds the ScriptLock for both this lookup and the append. A retry
  // after a timeout or reload must return the original task, not add a row.
  const existingIndex = rows.findIndex((row) => String(row[7] || '') === String(taskId));
  if (existingIndex !== -1) {
    return { success: true, task: rowToTask_(rows[existingIndex], existingIndex) };
  }
  const sheetRow = buildTaskSheetRow_(rowNumber, [], {
    ...newTask,
    id: taskId,
    title: newTask.title || 'Untitled Task',
    completed: newTask.completed === true,
    date: newTask.date || new Date().toISOString(),
    detail: newTask.detail || '',
    status: newTask.status || 'today',
    isTop: newTask.isTop === true,
    team: newTask.team === true,
    projectId: newTask.projectId || '',
  });

  sheet.getRange(rowNumber, 1, 1, sheetRow.length).setValues([sheetRow]);
  SpreadsheetApp.flush();

  return {
    success: true,
    task: rowToTask_(sheetRow, rowNumber - 2),
  };
}

function apiTaskError_(code, message, task, fields) {
  const error = new Error(message);
  error.code = code;
  error.currentTask = task;
  error.fields = fields || [];
  return error;
}

function apiComparableField_(key, value) {
  if (key === 'date') return String(value || '').slice(0, 10);
  if (key === 'projectIds' || key === 'projectId') return JSON.stringify(normalizeProjectNames_(value).slice().sort());
  return JSON.stringify(value);
}

function apiUpdateTask(id, updates, options) {
  const allowed = ['title', 'detail', 'date', 'completed', 'status', 'isTop', 'team', 'projectId', 'projectIds'];
  const keys = Object.keys(updates || {});
  if (!options || options.protocol !== 2 || !options.requestId || !options.expectedValues) {
    throw apiTaskError_('CLIENT_UPDATE_REQUIRED', 'Reload the app before saving.');
  }
  if (!keys.length || keys.some((key) => allowed.indexOf(key) === -1)) throw new Error('Invalid task update.');
  if (typeof options.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(options.requestId) || typeof options.expectedValues !== 'object' || Array.isArray(options.expectedValues)) throw new Error('Invalid write precondition.');
  if (String(updates.detail || '').length > 1000000 || String(updates.title || '').length > 2000) throw new Error('Task content is too large.');
  const sheet = getTaskSheet_();
  const rows = getTaskRows_();
  const rowNumber = resolveRowNumber_(id, rows);

  if (!rowNumber) {
    throw new Error('Task not found.');
  }

  const currentRow = rows[rowNumber - 2] || [];
  const current = rowToTask_(currentRow, rowNumber - 2);
  // Older editor tabs must not flatten special blocks they cannot render.
  const noteFormats = String(current.detail || '') + String(updates.detail || '');
  if (keys.includes('detail') && ((![3, 4, 5, 6].includes(options.editorSchema) && /<(?:details|figure|hr)\b/i.test(noteFormats)) || (![4, 5, 6].includes(options.editorSchema) && /\bdata-editor-(?:callout|columns|column)\s*=/i.test(noteFormats)) || (![5, 6].includes(options.editorSchema) && /\bdata-editor-todo\s*=/i.test(noteFormats)) || (options.editorSchema !== 6 && /<table\b|\bdata-editor-table\s*=/i.test(noteFormats)))) {
    throw apiTaskError_('CLIENT_UPDATE_REQUIRED', 'Reload this tab to edit the new note formats safely.');
  }
  const updatedRow = buildTaskSheetRow_(rowNumber, currentRow, updates || {});
  const desired = rowToTask_(updatedRow, rowNumber - 2);
  const compareKeys = keys.slice();
  if (keys.includes('status') || keys.includes('isTop')) compareKeys.push('status', 'isTop');
  if (keys.includes('projectId') || keys.includes('projectIds')) compareKeys.push('projectIds');
  const fields = Array.from(new Set(compareKeys));
  const matches = (task, values, field) => Object.prototype.hasOwnProperty.call(values, field) && apiComparableField_(field, task[field]) === apiComparableField_(field, values[field]);
  const fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([id, keys.slice().sort().map((key) => [key, updates[key]])])));
  const receipts = PropertiesService.getScriptProperties();
  const receiptKey = 'sites:update:v2:' + String(options.requestId);
  const receipt = receipts.getProperty(receiptKey);
  if (receipt && JSON.parse(receipt).fingerprint !== fingerprint) throw new Error('Request ID already used for another update.');
  const conflicts = fields.filter((key) => !matches(current, options.expectedValues, key));
  const alreadyApplied = fields.every((key) => matches(current, desired, key));
  if ((receipt || conflicts.length) && !alreadyApplied) throw apiTaskError_('CONFLICT', 'This task changed in another tab or device.', current, conflicts.length ? conflicts : keys);
  if (alreadyApplied) return { success: true, task: current, replayed: true };

  sheet.getRange(rowNumber, 1, 1, updatedRow.length).setValues([updatedRow]);
  SpreadsheetApp.flush();
  // Store only a digest, never note content. The ScriptLock covers CAS + write.
  receipts.setProperty(receiptKey, JSON.stringify({ fingerprint, at: Date.now() }));
  const entries = Object.entries(receipts.getProperties()).filter(([key]) => key.indexOf('sites:update:v2:') === 0);
  if (entries.length > 256) entries.sort((a, b) => JSON.parse(a[1]).at - JSON.parse(b[1]).at).slice(0, entries.length - 256).forEach(([key]) => receipts.deleteProperty(key));

  return {
    success: true,
    task: rowToTask_(updatedRow, rowNumber - 2),
  };
}

function apiCreateProject(project) {
  const projectName = normalizeProjectName_(project && (project.name || project.id));

  if (!projectName) {
    throw new Error('Project name is required.');
  }

  const sheet = getProjectSheet_();
  const existingNames = getProjectNames_();
  const existingIndex = existingNames.findIndex((name) => name.toLowerCase() === projectName.toLowerCase());

  if (existingIndex === -1) {
    sheet.getRange(sheet.getLastRow() + 1, 1).setValue(projectName);
    SpreadsheetApp.flush();
  }

  const projects = buildProjects_(existingIndex === -1 ? existingNames.concat(projectName) : existingNames);
  const savedProject = projects.find((item) => item.id.toLowerCase() === projectName.toLowerCase()) || {
    id: projectName,
    name: projectName,
    color: project && project.color ? project.color : 'bg-blue-500',
  };

  return {
    success: true,
    project: savedProject,
  };
}

function apiDeleteTask(id) {
  const sheet = getTaskSheet_();
  const rows = getTaskRows_();
  const rowNumber = resolveRowNumber_(id, rows);

  if (!rowNumber) {
    throw new Error('Task not found.');
  }

  const deletedTask = rowToTask_(rows[rowNumber - 2], rowNumber - 2);
  sheet.deleteRow(rowNumber);
  SpreadsheetApp.flush();

  return {
    success: true,
    task: deletedTask,
  };
}
