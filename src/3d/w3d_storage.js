/* ---------- 자동 저장 상태·실패 복구·파일 백업 ---------- */
const STORAGE_BACKUP_KEY = KEY + ':backup';
const storageState = { failed: false, error: '', lastSavedAt: 0, lastGood: '', loadBlocked: false, recovered: false, pokerBaseline: undefined, conflict: false };
const storagePanel = document.createElement('section');
storagePanel.id = 'storagePanel';
storagePanel.setAttribute('aria-label', '진행 상황 저장');
storagePanel.innerHTML = '<p id="storageStatus" role="status" aria-live="polite">진행 상황은 이 기기에 자동 저장됩니다.</p><p id="storageTime"></p><div class="row"><button type="button" id="storageRetry">저장 다시 시도</button><button type="button" id="storageExport">현재 진행 백업</button><button type="button" id="storageReload" hidden>최신 저장 불러오기</button></div>';
document.getElementById('resetRow').before(storagePanel);
const storageStyle = document.createElement('style');
storageStyle.textContent = '#storagePanel{border-top:2px dashed #ddcda9;padding-top:8px;margin-top:14px}#storagePanel p{font-size:14px;line-height:1.45;margin:5px 0}#storagePanel[data-failed=true] #storageStatus{color:#9a302b;font-weight:bold}#storagePanel .row{display:flex;flex-wrap:wrap;gap:8px}#storagePanel button{flex:1;min-height:44px;font-size:15px;padding:8px;touch-action:manipulation}#storageTime{color:#657565;font-size:12px!important}#menuBtn[data-storage-failed=true]{border-color:#a43b34;background:#ffe5bf}#menuBtn[data-storage-failed=true]::after{content:"!";position:absolute;right:-5px;top:-7px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#ac342e;color:#fff;font:bold 16px sans-serif}';
document.head.appendChild(storageStyle);
const storageMenuLabel = document.getElementById('menuBtn').getAttribute('aria-label');
function storageWarningMessage() {
  return storageState.failed ? '저장하지 못했습니다 · 메뉴에서 재시도하거나 백업하세요' : '';
}
function storageFailureMessage() { return storageWarningMessage(); }
function updateStorageStatus() {
  const status = document.getElementById('storageStatus');
  const text = storageState.failed ? storageState.error : storageState.recovered
    ? '이전 백업에서 진행 상황을 복구했습니다. 저장을 다시 확인해 주세요.'
    : storageState.lastSavedAt ? '진행 상황이 이 기기에 저장되었습니다.' : '진행 상황은 이 기기에 자동 저장됩니다.';
  if (status.textContent !== text) status.textContent = text;
  storagePanel.dataset.failed = String(storageState.failed);
  document.getElementById('storageReload').hidden = !storageState.conflict;
  const menu = document.getElementById('menuBtn');
  menu.dataset.storageFailed = String(storageState.failed);
  menu.setAttribute('aria-label', storageState.failed ? '저장 실패 · 메뉴에서 재시도하거나 백업하기' : storageMenuLabel);
  document.getElementById('storageTime').textContent = storageState.lastSavedAt
    ? '최근 저장: ' + new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(storageState.lastSavedAt) : '';
}
function storageError(error, loading = false) {
  storageState.failed = true;
  storageState.error = loading
    ? '저장된 진행 상황을 읽지 못했습니다. 원본은 덮어쓰지 않았습니다. 접근을 허용한 뒤 다시 시도해 주세요.'
    : error?.name === 'QuotaExceededError'
      ? '저장 공간이 부족해 저장하지 못했습니다. 현재 진행을 파일로 백업한 뒤 공간을 확보하고 다시 시도해 주세요.'
      : '이 브라우저에서 저장하지 못했습니다. 저장 권한을 확인하고 다시 시도하거나 현재 진행을 파일로 백업해 주세요.';
  updateStorageStatus();
  return false;
}
// 공용 파서: 파일/저장 코드뿐 아니라 기본 저장·이전 백업도 같은 기준으로 확인합니다.
function validateStoredGame(data) {
  const fail = field => { throw new Error('Invalid saved game: ' + field); };
  const object = (v, field) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(field); return v; };
  const number = (v, field, min = -Infinity, integer = false) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (integer && !Number.isInteger(v))) fail(field);
  };
  const array = (v, field) => { if (!Array.isArray(v)) fail(field); return v; };
  const finiteTree = (v, path = '$', depth = 0) => {
    if (depth > 60) fail(path);
    if (typeof v === 'number' && !Number.isFinite(v) && !path.startsWith('$.tavern')) fail(path);
    if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      if (['__proto__','prototype','constructor'].includes(key)) fail(path + '.' + key);
      finiteTree(child, path + '.' + key, depth + 1);
    }
  };
  const numericFields = (v, fields, path, min = 0) => {
    for (const key of fields) if (Object.hasOwn(v, key)) number(v[key], path + '.' + key, min);
  };
  const facility = id => typeof id === 'string' && Object.hasOwn(DEFS, id);
  const numericMap = (key, validKey = null) => {
    if (data[key] == null) return;
    const map = object(data[key], key);
    for (const [id, value] of Object.entries(map)) {
      if (validKey && !validKey(id)) fail(key + '.' + id);
      number(value, key + '.' + id, 0);
    }
  };
  const cargo = (v, path) => { array(v, path); if (v.some(item => typeof item !== 'string' || !Object.hasOwn(ITEMS, item))) fail(path); };
  const roster = (v, path, requireTent = false) => {
    array(v, path).forEach((record, i) => {
      object(record, path + i); numericFields(record, ['x','y','hp','ph','bob','vx','vy','timer'], path + i, -Infinity);
      if (requireTent && (!facility(record.tent) || DEFS[record.tent].type !== 'tent')) fail(path + i + '.tent');
      if (record.carry != null) cargo(record.carry, path + i + '.carry');
      if (record.look != null) object(record.look, path + i + '.look');
    });
  };
  object(data, '$'); finiteTree(data);
  object(data.st, 'st'); array(data.unlocked, 'unlocked');
  if (data.unlocked.some(id => !facility(id)) || new Set(data.unlocked).size !== data.unlocked.length) fail('unlocked');
  number(data.money, 'money', 0);
  // 초기 버전에 없을 수 있는 선택 필드만 보완하고 기존 값은 덮어쓰지 않습니다.
  for (const [key, value] of Object.entries({px:4, py:3, t:0, level:1, xp:0, paid:{}, stack:[]})) {
    if (!Object.hasOwn(data, key)) data[key] = value;
  }
  numericFields(data, ['px','py'], '$', -Infinity);
  numericFields(data, ['money','t','xp','wave','raidT','hp','soldiers','qi','skillCd','stallT','raidHeroDowns','crewGrowthFloor','allyGrowthVersion'], '$');
  number(data.level, 'level', 1); cargo(data.stack, 'stack');
  for (const key of ['raidEvent','lastRaidEvent']) {
    if (data[key] != null && !['storm','kraken'].includes(data[key])) fail(key);
  }
  if (data.cardOffer != null) {
    array(data.cardOffer,'cardOffer');
    if (data.cardOffer.some(id=>typeof id!=='string')) fail('cardOffer');
  }
  for (const id of Object.keys(data.st)) {
    if (!facility(id) || !['producer','converter','shop','base'].includes(DEFS[id].type)) fail('st.' + id);
    object(data.st[id], 'st.' + id); numericFields(data.st[id], ['pile','inPile','outPile','stock','cash','food','saleElapsed'], 'st.' + id);
  }
  for (const id of STATION_IDS) {
    if (!Object.hasOwn(data.st, id)) {
      if (data.unlocked.includes(id)) fail('st.' + id);
      data.st[id] = {pile:0,inPile:0,outPile:0,stock:0,cash:0};
    }
    for (const key of ['pile','inPile','outPile','stock','cash']) if (!Object.hasOwn(data.st[id], key)) data.st[id][key] = 0;
  }
  numericMap('paid', id => facility(id) || (id.startsWith('up:') && (facility(id.slice(3)) || Object.hasOwn(UPG,id.slice(3)))));
  numericMap('slv', id => facility(id) || Object.hasOwn(UPG,id));
  numericMap('workerAssignments', facility); numericMap('cards'); numericMap('trainPaid');
  for (const key of ['stats','qBase','training','hero','recruitment','broken','bhp','repairWork','recruitPadPositions']) {
    if (data[key] != null) object(data[key], key);
  }
  if (data.hero) numericFields(data.hero, ['level','xp','hp','downT','kills','engagedWave','rewardedWave','legacyAttackBonus','legacyHpBonus'], 'hero');
  if (data.training) numericFields(data.training, ['hero','crew'], 'training');
  if (data.crewRoster != null) roster(data.crewRoster, 'crewRoster', true);
  if (data.navyRoster != null) roster(data.navyRoster, 'navyRoster');
  if (data.respawn != null) array(data.respawn, 'respawn').forEach((v,i)=>object(v,'respawn'+i));
  if (data.recruitment) for (const [id, job] of Object.entries(data.recruitment)) {
    if (!facility(id) || DEFS[id].type !== 'tent') fail('recruitment.' + id);
    object(job, 'recruitment.' + id); numericFields(job,['remaining','duration','paid'],'recruitment.' + id);
  }
  if (data.combat != null) {
    object(data.combat, 'combat');
    if (data.combat.raidOn != null && typeof data.combat.raidOn !== 'boolean') fail('combat.raidOn');
    if (data.combat.enemies != null || data.combat.raidOn) array(data.combat.enemies, 'combat.enemies').forEach((v,i)=>{
      object(v,'combat.enemies'+i); numericFields(v,['x','y','hp','max','level','atkT','sinkT','retreatT','boardT','vx','vy'],'combat.enemies'+i,-Infinity);
    });
  }
  if (data.expedition != null) {
    const e=object(data.expedition,'expedition');
    if (e.phase != null && !['idle','exploring','result'].includes(e.phase)) fail('expedition.phase');
    if (e.rewards != null) object(e.rewards,'expedition.rewards');
    if (e.draft != null) { object(e.draft,'expedition.draft'); numericFields(e.draft,['food','water','crew'],'expedition.draft'); }
    numericFields(e,['completed','specialty','production','tier','pearls','island','sequence'],'expedition');
    if (['exploring','result'].includes(e.phase)) {
      const r=object(e.run,'expedition.run');
      for (const key of ['x','y','hp','maxHp','time']) number(r[key],'expedition.run.'+key, key==='x'||key==='y'||key==='time' ? -Infinity : 0);
      roster(r.party,'expedition.run.party',true);
      for (const key of ['rescued','collected']) array(r[key],'expedition.run.'+key).forEach(v=>number(v,'expedition.run.'+key,0,true));
      array(r.hazards,'expedition.run.hazards').forEach((h,i)=>{ object(h,'hazard'+i); numericFields(h,['x','y','radius','t','width','innerRadius'],'hazard'+i,-Infinity); });
      if (e.phase==='result') {
        object(e.result,'expedition.result');
        if (!['success','retreat','failure'].includes(e.result.outcome)) fail('expedition.result.outcome');
      }
    }
  }
  return data;
}
function parseStoredGame(raw) { return validateStoredGame(JSON.parse(raw)); }
// 포커 기록이 바뀐 다른 탭의 저장은 오래된 자동 저장으로 되돌리지 않습니다.
function storagePokerStamp(raw) {
  if (!raw) return '[null,0,null]';
  try { const t=JSON.parse(raw).tavern; return JSON.stringify([t?.round || null,t?.played || 0,t?.damagedRound || null]); }
  catch (error) { return 'invalid:' + raw; }
}
function storageConflict() {
  storageState.failed = true; storageState.conflict = true;
  storageState.error = '다른 탭에서 선술집 카드 대결 진행이 변경됐습니다. 이 탭의 저장을 멈췄습니다. 현재 진행을 백업하거나 최신 저장을 불러오세요.';
  updateStorageStatus(); return false;
}
function reloadLatestStorage() {
  const data = load();
  if (!data || storageState.loadBlocked) return false;
  build(data); paused = !expeditionBusy(); document.getElementById('helpPanel').hidden = expeditionBusy();
  return true;
}
function save() {
  if (storageState.loadBlocked) return false; // 읽지 못한 기존 저장을 새 게임으로 덮어쓰지 않습니다.
  try {
    const primary = localStorage.getItem(KEY);
    if (storageState.pokerBaseline !== undefined && storagePokerStamp(primary) !== storageState.pokerBaseline) return storageConflict();
    const data = JSON.stringify(serialize()), previous = storageState.lastGood;
    localStorage.setItem(KEY, data);
    storageState.lastGood = data; storageState.pokerBaseline = storagePokerStamp(data); storageState.conflict = false;
    storageState.lastSavedAt = Date.now();
    storageState.failed = false; storageState.error = ''; storageState.recovered = false;
    // 백업 용량 부족은 이미 성공한 기본 저장을 실패로 바꾸지 않습니다.
    if (previous && previous !== data) {
      try { localStorage.setItem(STORAGE_BACKUP_KEY, previous); } catch (error) { /* 기본 저장은 유지됩니다. */ }
    }
    updateStorageStatus();
    return true;
  } catch (error) { return storageError(error); }
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    storageState.pokerBaseline = storagePokerStamp(raw); storageState.conflict = false;
    if (!raw) {
      storageState.loadBlocked = false;
      storageState.failed = false; storageState.error = ''; updateStorageStatus();
      return null;
    }
    const data = parseStoredGame(raw);
    storageState.lastGood = raw;
    storageState.loadBlocked = false;
    storageState.failed = false; storageState.error = ''; updateStorageStatus();
    return data;
  } catch (error) {
    try {
      const raw = localStorage.getItem(STORAGE_BACKUP_KEY), data = parseStoredGame(raw);
      storageState.lastGood = raw;
      storageState.loadBlocked = false; storageState.failed = false; storageState.error = ''; storageState.recovered = true;
      updateStorageStatus();
      return data;
    } catch (backupError) {
      storageState.loadBlocked = true;
      storageError(error, true);
      return null;
    }
  }
}
function retryStorage() {
  if (storageState.conflict) return false; // 새 저장을 불러오기 전에는 오래된 상태를 다시 쓰지 않습니다.
  if (storageState.loadBlocked) {
    const recovered = load();
    if (storageState.loadBlocked) return false;
    if (recovered) {
      build(recovered); paused = !expeditionBusy(); document.getElementById('helpPanel').hidden = expeditionBusy();
    }
  }
  return save();
}
// 기존의 두 번 확인하는 초기화 동작에서만 호출합니다.
function resetStorageState() {
  try { storageState.pokerBaseline = storagePokerStamp(localStorage.getItem(KEY)); } catch (error) { storageState.pokerBaseline = undefined; }
  storageState.conflict = false;
  storageState.loadBlocked = false;
  storageState.lastGood = ''; storageState.lastSavedAt = 0;
  storageState.failed = false; storageState.error = ''; storageState.recovered = false;
  try { localStorage.removeItem(STORAGE_BACKUP_KEY); } catch (error) { /* 이후 기본 저장에서 실패를 표시합니다. */ }
  updateStorageStatus();
}
function exportSave() {
  try {
    const data = serialize();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'raft-village-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    storageState.failed = true;
    storageState.error = '백업 파일을 만들지 못했습니다. 페이지를 닫지 말고 다시 시도해 주세요.';
    updateStorageStatus();
    return false;
  }
}
document.getElementById('storageRetry').onclick = retryStorage;
document.getElementById('storageExport').onclick = exportSave;

document.getElementById('storageReload').onclick = reloadLatestStorage;

// ---------- 저장 코드: 휴대폰을 바꾸거나 브라우저 데이터를 지워도 이어서 하기 ----------
const SAVE_CODE_PREFIX = 'RAFT1:';
const storageMoveRow = document.createElement('div');
storageMoveRow.className = 'row'; storageMoveRow.id = 'storageMoveRow';
storageMoveRow.innerHTML = '<button type="button" id="storageCopyCode">저장 코드 복사</button><button type="button" id="storagePasteCode">저장 코드 붙여넣기</button><button type="button" id="storageImportFile">백업 파일 불러오기</button><input type="file" id="storageFile" accept=".json,.txt,application/json,text/plain" hidden>';
const storageNote = document.createElement('p');
storageNote.id = 'storageNote'; storageNote.setAttribute('role', 'status');
storageNote.textContent = '저장 코드를 카카오톡 "나와의 채팅"이나 메모장에 보관해 두면, 휴대폰을 바꿔도 이어서 할 수 있어요.';
storagePanel.append(storageMoveRow, storageNote);
function setStorageNote(text) { storageNote.textContent = text; }
function saveCode() {
  const bytes = new TextEncoder().encode(JSON.stringify(serialize()));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return SAVE_CODE_PREFIX + btoa(bin);
}
function parseSaveCode(text) {
  text = String(text || '').trim();
  if (text.startsWith('{')) return parseStoredGame(text); // 백업 파일(JSON)
  const body = (text.startsWith(SAVE_CODE_PREFIX) ? text.slice(SAVE_CODE_PREFIX.length) : text).replace(/\s+/g, '');
  const bin = atob(body);
  return parseStoredGame(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}
async function copySaveCode() {
  const code = saveCode();
  try { await navigator.clipboard.writeText(code); setStorageNote('✅ 저장 코드를 복사했어요. 카카오톡 "나와의 채팅"이나 메모장에 붙여 넣어 보관하세요.'); }
  catch (error) { window.prompt('아래 저장 코드를 전부 복사해 보관하세요.', code); setStorageNote('저장 코드를 보관해 두세요.'); }
  return code;
}
// build()는 전역 실행 상태를 바꾸므로, 실패 시 저장뿐 아니라 진행 중 작업도 되돌립니다.
function snapshotImportRuntime() {
  return {G,unlocked,tiles,cap,workers,runtime,player,cam,restoringCrewRoster,fallenCrew,raftC,edges,
    soldiers,enemies,shots,booms,raidOn,looted,trainT,paused,tower:{...towerSt},
    activeTrainingKind,trainingContact,trainingPanelSignature,trainingButtonSignature,
    ui:{help:document.getElementById('helpPanel').hidden,strategy:strategyPanel.hidden,
      recruit:recruitPanel.hidden,training:trainingPanel.hidden,expedition:expeditionPanel.hidden,tavern:tavernPanel.hidden}};
}
function restoreImportRuntime(old) {
  ({G,unlocked,tiles,cap,workers,runtime,player,cam,restoringCrewRoster,fallenCrew,raftC,edges,
    soldiers,enemies,shots,booms,raidOn,looted,trainT,paused,
    activeTrainingKind,trainingContact,trainingPanelSignature,trainingButtonSignature}=old);
  for (const key of Object.keys(towerSt)) delete towerSt[key]; Object.assign(towerSt,old.tower);
  expeditionRestore(); if (!old.ui.expedition) expeditionOpen();
  tavernRestore(); if (!old.ui.tavern) tavernOpen();
  document.getElementById('helpPanel').hidden=old.ui.help;
  strategyPanel.hidden=old.ui.strategy; recruitPanel.hidden=old.ui.recruit; trainingPanel.hidden=old.ui.training;
  paused=old.paused; clearMovementInput();
}
function importSaveData(data, ask = true) {
  let candidate;
  try { candidate=parseStoredGame(JSON.stringify(data)); }
  catch (error) { setStorageNote('⚠️ 저장 형식이 잘못됐거나 이 버전과 호환되지 않습니다. 현재 진행은 변경하지 않았어요.'); return false; }
  if (ask && !window.confirm('지금 진행을 불러온 저장으로 바꿀까요? 현재 진행은 이전 백업에 보관됩니다.')) return false;
  let primary,backup,old,current;
  const metadata={...storageState};
  try {
    primary=localStorage.getItem(KEY); backup=localStorage.getItem(STORAGE_BACKUP_KEY);
    current=JSON.stringify(serialize()); old=snapshotImportRuntime();
  } catch (error) { storageError(error); setStorageNote('⚠️ 현재 진행을 보관하지 못해 불러오기를 취소했어요.'); return false; }
  try {
    // 유효한 마을로 실제 복원되는 것을 먼저 확인합니다. 여기까지 저장소에는 쓰지 않습니다.
    build(candidate);
    if (localStorage.getItem(KEY)!==primary) throw new Error('Save changed during import');
    storageState.loadBlocked=false; storageState.conflict=false;
    storageState.pokerBaseline=storagePokerStamp(primary); storageState.lastGood=current;
    if (!save()) throw new Error('Import persistence failed');
    paused=!expeditionBusy(); document.getElementById('helpPanel').hidden=expeditionBusy();
    setStorageNote('✅ 저장을 불러왔어요. 이전 진행은 백업에 보관했습니다. 이어서 즐겨 주세요!');
    return true;
  } catch (error) {
    let restored=true;
    // 쓰기가 실패하기 전의 값을 그대로 보존합니다. 변하지 않은 키에는 다시 쓰지 않습니다.
    for (const [key,value] of [[KEY,primary],[STORAGE_BACKUP_KEY,backup]]) {
      try { if (localStorage.getItem(key)!==value) { if (value===null) localStorage.removeItem(key); else localStorage.setItem(key,value); } }
      catch (restoreError) { restored=false; }
    }
    restoreImportRuntime(old); Object.assign(storageState,metadata); updateStorageStatus();
    if (!restored) {
      storageState.failed=true; storageState.loadBlocked=true;
      storageState.error='불러오기 저장과 원본 복구에 실패했습니다. 현재 진행을 파일로 백업하고 저장 권한을 확인해 주세요.';
      updateStorageStatus();
    }
    setStorageNote(restored?'⚠️ 저장을 불러오지 못해 이전 진행으로 돌아왔어요. 원래 저장과 백업은 유지됩니다.':'⚠️ 현재 진행은 화면에 유지됩니다. 페이지를 닫기 전에 현재 진행을 백업하세요.');
    return false;
  }
}
function importSaveText(text, ask = true) {
  let data;
  try { data = parseSaveCode(text); }
  catch (error) { setStorageNote('⚠️ 저장 코드를 읽지 못했거나 이 버전과 호환되지 않습니다. 현재 진행은 변경하지 않았어요.'); return false; }
  return importSaveData(data, ask);
}
document.getElementById('storageCopyCode').onclick = copySaveCode;
document.getElementById('storagePasteCode').onclick = () => { const text = window.prompt('보관해 둔 저장 코드를 붙여 넣으세요.'); if (text) importSaveText(text); };
document.getElementById('storageImportFile').onclick = () => document.getElementById('storageFile').click();
document.getElementById('storageFile').onchange = ev => {
  const file = ev.target.files?.[0]; ev.target.value = '';
  if (!file) return;
  file.text().then(text => importSaveText(text)).catch(() => setStorageNote('⚠️ 백업 파일을 열지 못했어요.'));
};
