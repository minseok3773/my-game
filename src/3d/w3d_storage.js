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
function parseStoredGame(raw) {
  const data = JSON.parse(raw);
  if (!data || typeof data.st !== 'object' || !data.st || !Array.isArray(data.unlocked)) throw new Error('Invalid saved game');
  return data;
}
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
function importSaveData(data, ask = true) {
  if (ask && !window.confirm('지금 진행을 불러온 저장으로 바꿀까요? 현재 진행은 사라집니다.')) return false;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (error) { return storageError(error); }
  const loaded = load();
  if (!loaded) return false;
  build(loaded); paused = !expeditionBusy(); document.getElementById('helpPanel').hidden = expeditionBusy();
  save(); setStorageNote('✅ 저장을 불러왔어요. 이어서 즐겨 주세요!');
  return true;
}
function importSaveText(text, ask = true) {
  let data;
  try { data = parseSaveCode(text); }
  catch (error) { setStorageNote('⚠️ 저장 코드를 읽지 못했어요. 코드 전체를 빠짐없이 붙여 넣었는지 확인해 주세요.'); return false; }
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
