function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'data') {
    return sitesApiResponse_(e.parameter.token, function () {
      return apiGetData();
    });
  }

  return jsonOutput_({ ok: false, error: 'Not found.' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    return sitesApiResponse_(payload.token, function () {
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);

      try {
        if (payload.action === 'nativePrepare') return nativeSnapshot_(true);
        if (payload.action === 'nativeSnapshot') return nativeSnapshot_(false);
        if (payload.action === 'nativeApply') return nativeApply_(payload);
        if (payload.action === 'configureNativeRunner') return configureNativeRunner_(payload);
        if (payload.action === 'create') return apiCreateTask(payload.task || {});
        if (payload.action === 'update') return apiUpdateTask(payload.id, payload.updates || {}, payload);
        if (payload.action === 'delete') return apiDeleteTask(payload.id);
        if (payload.action === 'createProject') return apiCreateProject(payload.project || {});
        throw new Error('Unsupported action.');
      } finally {
        lock.releaseLock();
      }
    });
  } catch (error) {
    return jsonOutput_({ ok: false, code: error.code, currentTask: error.currentTask, fields: error.fields, error: error && error.message ? error.message : String(error) });
  }
}

function sitesApiResponse_(token, callback) {
  if (!token || token !== SITES_API_TOKEN) {
    return jsonOutput_({ ok: false, error: 'Unauthorized.' });
  }

  try {
    return jsonOutput_({ ok: true, result: callback() });
  } catch (error) {
    return jsonOutput_({ ok: false, code: error.code, currentTask: error.currentTask, fields: error.fields, error: error && error.message ? error.message : String(error) });
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
