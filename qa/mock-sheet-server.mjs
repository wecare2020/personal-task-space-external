import { createServer } from 'node:http';

const port = Number(process.env.MOCK_SHEET_PORT || 43123);
const readDelay = Number(process.env.MOCK_SHEET_DELAY_MS || 0);
const supportedModes = new Set(['immediate', 'hold', 'fail']);
const configuredMode = String(process.env.MOCK_SHEET_MODE || 'immediate').toLowerCase();
const initialMode = supportedModes.has(configuredMode) ? configuredMode : 'immediate';

const initialTask = {
  id: 'qa-next-note',
  title: 'Sidebar date QA',
  date: '2026-09-20T00:00:00.000Z',
  completed: false,
  status: 'today',
  isTop: false,
  team: false,
  detail: '<ul><li><strong>Alpha</strong></li><li><a href="https://example.com">Beta</a></li><li>Gamma</li></ul><p>After list</p>',
  projectId: '',
  projectIds: [],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyCounters() {
  return {
    dataGets: 0,
    heldGets: 0,
    releasedGets: 0,
    failedGets: 0,
    appWrites: 0,
    externalMutations: 0,
  };
}

let task = clone(initialTask);
let failWrites=0, writeDelay=0;
const receipts=new Map();
let mode = initialMode;
let counters = emptyCounters();
const writes = [];
const heldGets = new Set();

function send(response, payload, status = 200) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function dataPayload() {
  return { ok: true, result: { tasks: [clone(task)], projects: [] } };
}

function statePayload() {
  return {
    mode,
    readDelayMs: readDelay,
    pendingGets: heldGets.size,
    counters: clone(counters),
    task: clone(task),
    writes: clone(writes),
  };
}

function releaseHeldGets() {
  const pending = [...heldGets];
  for (const entry of pending) {
    heldGets.delete(entry);
    counters.releasedGets += 1;
    send(entry.response, dataPayload());
  }
  return pending.length;
}

function cancelHeldGets() {
  const pending = [...heldGets];
  for (const entry of pending) {
    heldGets.delete(entry);
    send(entry.response, { ok: false, error: 'QA server reset while this read was held.' }, 409);
  }
}

function readBody(request, callback) {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    try {
      callback(JSON.parse(body || '{}'));
    } catch {
      callback(null);
    }
  });
}

function handleControl(pathname, payload, response) {
  const action = pathname === '/control' ? payload?.action : pathname.slice(1);

  if (action === 'reset') {
    cancelHeldGets();
    task = clone(initialTask);
    mode = initialMode;
    counters = emptyCounters();
    writes.length = 0;
    failWrites=0;writeDelay=0;receipts.clear();
    send(response, { ok: true, result: statePayload() });
    return true;
  }
  if(action==='write-mode'){failWrites=Number(payload.failWrites||0);writeDelay=Number(payload.delay||0);send(response,{ok:true});return true;}

  if (action === 'external-update' || action === 'mutate') {
    const updates = payload?.updates;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      send(response, { ok: false, error: 'Provide an updates object.' }, 400);
      return true;
    }
    task = { ...task, ...updates };
    counters.externalMutations += 1;
    send(response, { ok: true, result: { task: clone(task) } });
    return true;
  }

  if (action === 'mode') {
    const nextMode = String(payload?.mode || '').toLowerCase();
    if (!supportedModes.has(nextMode)) {
      send(response, { ok: false, error: 'Mode must be immediate, hold, or fail.' }, 400);
      return true;
    }
    mode = nextMode;
    send(response, { ok: true, result: { mode, pendingGets: heldGets.size } });
    return true;
  }

  if (action === 'release') {
    const released = releaseHeldGets();
    send(response, { ok: true, result: { released, pendingGets: heldGets.size } });
    return true;
  }

  return false;
}

createServer((request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);

  if (request.method === 'GET' && url.pathname === '/state') {
    send(response, statePayload());
    return;
  }

  if (request.method === 'GET') {
    counters.dataGets += 1;

    if (mode === 'fail') {
      counters.failedGets += 1;
      send(response, { ok: false, error: 'Forced QA read failure.' }, 503);
      return;
    }

    if (mode === 'hold') {
      counters.heldGets += 1;
      const entry = { response };
      heldGets.add(entry);
      response.on('close', () => heldGets.delete(entry));
      return;
    }

    const reply = () => send(response, dataPayload());
    if (readDelay > 0) setTimeout(reply, readDelay);
    else reply();
    return;
  }

  if (request.method !== 'POST') {
    send(response, { ok: false, error: 'Method not allowed.' }, 405);
    return;
  }

  readBody(request, (payload) => {
    if (!payload) {
      send(response, { ok: false, error: 'Invalid JSON body.' }, 400);
      return;
    }

    if (url.pathname === '/control' || ['/reset', '/external-update', '/mutate', '/mode', '/release'].includes(url.pathname)) {
      if (!handleControl(url.pathname, payload, response)) {
        send(response, { ok: false, error: 'Unsupported QA control action.' }, 400);
      }
      return;
    }

    if (payload.action !== 'update' || payload.id !== task.id) {
      send(response, { ok: false, error: 'Unsupported QA action.' });
      return;
    }
    const run=()=>{
      if(failWrites>0){failWrites--;send(response,{ok:false,error:'Forced write failure'},503);return;}
      if(payload.protocol!==2){send(response,{ok:false,code:'CLIENT_UPDATE_REQUIRED'});return;}
      const keys=Object.keys(payload.updates||{});
      const same=(key,value)=>JSON.stringify(task[key])===JSON.stringify(value);
      const conflict=keys.filter(key=>!same(key,payload.expectedValues?.[key]));
      const already=keys.every(key=>same(key,payload.updates[key]));
      if((receipts.has(payload.requestId)||conflict.length)&&!already){send(response,{ok:false,code:'CONFLICT',currentTask:clone(task),fields:conflict});return;}
      if(!already){task = { ...task, ...(payload.updates || {}) };counters.appWrites += 1;writes.push({ action: payload.action, requestId:payload.requestId,id: payload.id, updates: payload.updates || {} });receipts.set(payload.requestId,true);}
      send(response, { ok: true, result: { success: true, task: clone(task) } });
    };if(writeDelay)setTimeout(run,writeDelay);else run();
  });
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Mock Sheet API listening on http://127.0.0.1:${port} (mode: ${mode})\n`);
});
