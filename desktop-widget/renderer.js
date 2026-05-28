import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  collection, doc, getDoc, getDocs, getFirestore,
  increment, query, serverTimestamp, updateDoc, where,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCpOf86UP1nA2-MzvMxjglomdMG8y6xS9I',
  authDomain: 'level-up-class.firebaseapp.com',
  projectId: 'level-up-class',
  storageBucket: 'level-up-class.firebasestorage.app',
  messagingSenderId: '1095450799104',
  appId: '1:1095450799104:web:650aea6a8afd352d257ce5',
  measurementId: 'G-E5VF05T6NE',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const DEFAULTS = {
  classId: '',
  teacherUid: '',
  webUrl: 'https://level-up-class.vercel.app',
  alwaysOnTop: false,
};

const $ = (id) => document.getElementById(id);
const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');

let settings = loadSettings();
let authUser = null;

// 앱 재시작 시 Firebase Auth 상태 복원
onAuthStateChanged(auth, (user) => { authUser = user; });

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('levelup-widget-settings') || '{}') };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings(next) {
  settings = { ...settings, ...next };
  localStorage.setItem('levelup-widget-settings', JSON.stringify(settings));
}

const ALL_PANELS = ['setupPanel', 'dashboardPanel', 'errorPanel', 'questPanel', 'notesPanel', 'settingsPanel'];

function show(panelId) {
  ALL_PANELS.forEach(id => $(id)?.classList.add('hidden'));
  $(panelId)?.classList.remove('hidden');
}

// ── 설정 패널 상태 (login / loading / pick / error) ──
function setupState(state, payload) {
  ['stateLogin', 'stateLoading', 'statePick', 'stateError'].forEach(id =>
    $(id).classList.add('hidden'),
  );
  $('state' + state.charAt(0).toUpperCase() + state.slice(1)).classList.remove('hidden');
  show('setupPanel');

  const hasConn = !!(settings.classId || settings.teacherUid);
  $('disconnectArea').classList.toggle('hidden', !hasConn);

  if (state === 'pick' && Array.isArray(payload)) {
    $('classPickList').innerHTML = payload.map(cls => {
      const d = cls.data();
      const name = d.name || d.className || cls.id;
      const meta = [d.schoolName, d.grade && `${d.grade}학년`, d.classNumber && `${d.classNumber}반`]
        .filter(Boolean).join(' ');
      return `<button class="class-pick-btn" data-cid="${cls.id}" data-uid="${d.teacherUid || ''}">
        <span class="pick-name">${escapeHtml(name)}</span>
        ${meta ? `<span class="pick-meta">${escapeHtml(meta)}</span>` : ''}
      </button>`;
    }).join('');
    $('classPickList').querySelectorAll('.class-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        saveSettings({ classId: btn.dataset.cid, teacherUid: btn.dataset.uid || authUser?.uid || '' });
        refresh();
      });
    });
  }
  if (state === 'error') $('setupErrMsg').textContent = payload || '오류가 발생했습니다.';
}

async function connectUser(uid) {
  setupState('loading');
  try {
    const snap = await getDocs(query(collection(db, 'classes'), where('teacherUid', '==', uid)));
    if (snap.empty) {
      setupState('error', '이 계정에 연결된 학급이 없습니다.\n웹앱에서 학급을 먼저 생성해 주세요.');
      return;
    }
    if (snap.docs.length === 1) {
      saveSettings({ classId: snap.docs[0].id, teacherUid: uid });
      await refresh();
    } else {
      setupState('pick', snap.docs);
    }
  } catch (err) { setupState('error', err.message); }
}

// ── 날짜 유틸 ──
function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function tsToDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  const d = new Date(v); return isNaN(d) ? null : d;
}
function isToday(v) { const d = tsToDate(v); return d ? d >= todayStart() : false; }
function scopedQuery(col, field, val) { return query(collection(db, col), where(field, '==', val)); }

async function getScope() {
  const classId = settings.classId.trim();
  const teacherUid = settings.teacherUid.trim();

  if (classId) {
    const snap = await getDoc(doc(db, 'classes', classId));
    const data = snap.exists() ? { id: snap.id, ...snap.data() } : { id: classId };
    return {
      classId, teacherUid: data.teacherUid || teacherUid,
      className: data.name || data.className || '선택한 학급',
      schoolName: data.schoolName || '', grade: data.grade || '',
      classNumber: data.classNumber || data.classNum || '',
    };
  }
  if (teacherUid) {
    const snap = await getDocs(scopedQuery('classes', 'teacherUid', teacherUid));
    const first = snap.docs[0];
    const data = first ? { id: first.id, ...first.data() } : null;
    return {
      classId: data?.id || '', teacherUid,
      className: data?.name || data?.className || '교사 전체 학급',
      schoolName: data?.schoolName || '', grade: data?.grade || '',
      classNumber: data?.classNumber || data?.classNum || '',
    };
  }
  return null;
}

// ── 대시보드 ──
async function loadWidgetData() {
  const scope = await getScope();
  if (!scope) { setupState('login'); return; }

  show('dashboardPanel');
  $('className').textContent = scope.className;
  $('classMeta').textContent =
    [scope.schoolName, scope.grade && `${scope.grade}학년`, scope.classNumber && `${scope.classNumber}반`]
      .filter(Boolean).join(' ') || scope.classId || scope.teacherUid;

  const sf = scope.classId ? 'classId' : 'teacherUid';
  const sv = scope.classId || scope.teacherUid;

  const [studentsSnap, notesSnap, raidsSnap, questsSnap, purchasesSnap, usagesSnap] =
    await Promise.all([
      getDocs(scopedQuery('students', sf, sv)),
      scope.teacherUid ? getDocs(scopedQuery('learningNotes', 'teacherUid', scope.teacherUid)) : Promise.resolve({ docs: [] }),
      scope.classId ? getDocs(scopedQuery('worldBossRaids', 'classId', scope.classId)) : getDocs(scopedQuery('worldBossRaids', 'teacherUid', scope.teacherUid)),
      scope.teacherUid ? getDocs(scopedQuery('quests', 'teacherUid', scope.teacherUid)) : Promise.resolve({ docs: [] }),
      scope.classId ? getDocs(scopedQuery('shopPurchases', 'scopeKey', scope.classId)) : getDocs(scopedQuery('shopPurchases', 'teacherUid', scope.teacherUid)),
      scope.classId ? getDocs(scopedQuery('shopUsages', 'scopeKey', scope.classId)) : getDocs(scopedQuery('shopUsages', 'teacherUid', scope.teacherUid)),
    ]);

  const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const studentIds = new Set(students.map(s => s.id));
  const notes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => !studentIds.size || studentIds.has(n.studentId));
  const raids = raidsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const quests = questsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.active !== false);
  const purchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const usages = usagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let todayQuestDone = 0;
  await Promise.all(quests.slice(0, 12).map(async quest => {
    const snap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
    snap.docs.forEach(d => {
      if (studentIds.size && !studentIds.has(d.id)) return;
      const data = d.data();
      if (data.checked && (!quest.repeatDaily || isToday(data.checkedAt))) todayQuestDone++;
    });
  }));

  const pendingNotesList = notes.filter(n => n.status === 'pending');
  const openRaids = raids.filter(r => r.status === 'waiting' || r.status === 'active');
  const resultWaiting = raids.filter(r => (r.status === 'cleared' || r.status === 'failed') && !r.rewardsPaid);
  const todayActs = new Set();
  notes.forEach(n => { if (isToday(n.createdAt) || isToday(n.approvedAt)) todayActs.add(n.studentId); });
  purchases.forEach(p => { if (isToday(p.createdAt)) todayActs.add(p.studentId); });
  usages.forEach(u => { if (isToday(u.createdAt) || isToday(u.usedAt)) todayActs.add(u.studentId); });
  raids.forEach(r => {
    Object.entries(r.participants || {}).forEach(([sid, p]) => {
      if (isToday(p.joinedAt) || isToday(r.startedAt)) todayActs.add(sid);
    });
  });

  $('studentCount').textContent = fmt(students.length);
  $('questToday').textContent = fmt(todayQuestDone);
  $('pendingNotes').textContent = fmt(pendingNotesList.length);
  $('todayActivity').textContent = fmt(todayActs.size);
  $('totalGold').textContent = `${fmt(students.reduce((s, x) => s + Number(x.gold || 0), 0))}G`;
  $('totalDiamonds').textContent = fmt(students.reduce((s, x) => s + Number(x.diamonds || 0), 0));
  $('lastUpdated').textContent = `마지막 갱신 ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;

  renderTodos({ pendingNotes: pendingNotesList, openRaids, resultWaiting, purchases, usages });
  renderRaids(openRaids);
}

function renderTodos({ pendingNotes, openRaids, resultWaiting, purchases, usages }) {
  const todayPurchases = purchases.filter(p => isToday(p.createdAt));
  const pendingUsages = usages.filter(u => !u.confirmed && !u.used);
  const todos = [
    pendingNotes.length > 0 && { title: `배움노트 승인 대기 ${pendingNotes.length}건`, meta: pendingNotes.slice(0, 3).map(n => n.studentName).filter(Boolean).join(', ') || '확인이 필요합니다.' },
    resultWaiting.length > 0 && { title: `레이드 결과 확인 ${resultWaiting.length}건`, meta: '결과 확인 또는 보상 지급 상태를 확인하세요.' },
    openRaids.length > 0 && { title: `진행 중인 보스레이드 ${openRaids.length}개`, meta: openRaids.map(r => r.bossName || r.title).filter(Boolean).slice(0, 2).join(', ') },
    todayPurchases.length > 0 && { title: `오늘 상점 구매 ${todayPurchases.length}건`, meta: '학급 상점 구매 흐름을 확인하세요.' },
    pendingUsages.length > 0 && { title: `아이템 사용 확인 필요 ${pendingUsages.length}건`, meta: '학생 사용 요청을 확인하세요.' },
  ].filter(Boolean);
  $('todoList').innerHTML = todos.length
    ? todos.map(t => `<div class="todo-item"><div class="todo-title">${escapeHtml(t.title)}</div><div class="todo-meta">${escapeHtml(t.meta || '')}</div></div>`).join('')
    : '<div class="todo-item"><div class="todo-title">지금 급한 확인 항목이 없습니다</div><div class="todo-meta">수업 중에는 이 창만 띄워두셔도 됩니다.</div></div>';
}

function renderRaids(openRaids) {
  $('raidList').innerHTML = openRaids.length
    ? openRaids.map(r => {
        const max = Number(r.maxHP || 0), cur = Number(r.currentHP ?? max);
        const pct = max > 0 ? Math.max(0, Math.round(cur / max * 100)) : 0;
        return `<div class="raid-item"><div class="raid-title">${escapeHtml(r.bossName || r.title || '보스레이드')}</div><div class="raid-meta">${r.status === 'active' ? '전투 중' : '대기 중'} · ${Object.keys(r.participants || {}).length}명 참여 · HP ${pct}%</div></div>`;
      }).join('')
    : '<div class="raid-item"><div class="raid-title">열려 있는 레이드가 없습니다</div><div class="raid-meta">레이드를 시작하면 여기에 표시됩니다.</div></div>';
}

// ── 퀘스트 패널 ──
async function loadQuestPanel() {
  show('questPanel');
  $('questContent').innerHTML = '<p class="sub-loading">불러오는 중...</p>';
  const scope = await getScope();
  if (!scope) { show('dashboardPanel'); return; }
  try {
    const snap = await getDocs(query(collection(db, 'quests'), where('teacherUid', '==', scope.teacherUid)));
    const quests = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.active !== false);
    if (!quests.length) { $('questContent').innerHTML = '<p class="empty-state">진행 중인 퀘스트가 없습니다.</p>'; return; }

    const questsWithPending = await Promise.all(quests.map(async quest => {
      const compSnap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
      const pending = compSnap.docs
        .filter(d => d.data().checked && !d.data().rewarded)
        .map(d => ({ studentId: d.id, ...d.data() }));
      return { ...quest, pending };
    }));

    $('questContent').innerHTML = questsWithPending.map(quest => {
      const cnt = quest.pending.length;
      const rewardStr = [
        quest.rewards?.gold && `💰${quest.rewards.gold}G`,
        quest.rewards?.exp && `⭐${quest.rewards.exp}XP`,
        quest.rewards?.diamond && `💎${quest.rewards.diamond}`,
      ].filter(Boolean).join(' ');

      const completionsHtml = cnt > 0
        ? quest.pending.map(c => `
            <div class="completion-row">
              <span class="completion-name">${escapeHtml(c.studentName || c.studentCode || c.studentId)}</span>
              <button class="approve-btn"
                data-qid="${quest.id}" data-sid="${c.studentId}"
                data-gold="${quest.rewards?.gold || 0}"
                data-exp="${quest.rewards?.exp || 0}"
                data-diamond="${quest.rewards?.diamond || 0}">
                보상 지급
              </button>
            </div>`).join('')
        : '<p class="empty-state small">대기 중인 보상 없음</p>';

      return `<div class="info-card ${cnt > 0 ? 'has-action' : ''}">
        <div class="info-card-header">
          <span class="info-card-title">${escapeHtml(quest.title || '퀘스트')}</span>
          ${cnt > 0 ? `<span class="action-badge">${cnt}명</span>` : ''}
        </div>
        ${rewardStr ? `<div class="reward-text">${rewardStr}</div>` : ''}
        <div class="completions-list">${completionsHtml}</div>
      </div>`;
    }).join('');

    $('questContent').querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.completion-row');
        const name = row.querySelector('.completion-name').textContent;
        btn.disabled = true; btn.textContent = '처리 중...';
        try {
          await approveQuestCompletion(btn.dataset.qid, btn.dataset.sid,
            Number(btn.dataset.gold), Number(btn.dataset.exp), Number(btn.dataset.diamond));
          row.innerHTML = `<span class="done-label">✓ ${escapeHtml(name)} 보상 지급 완료</span>`;
        } catch (err) { btn.textContent = '실패'; btn.disabled = false; }
      });
    });
  } catch (err) {
    $('questContent').innerHTML = `<p class="error-text" style="padding:12px">${escapeHtml(err.message)}</p>`;
  }
}

async function approveQuestCompletion(questId, studentId, gold, exp, diamond) {
  await updateDoc(doc(db, 'quests', questId, 'completions', studentId), {
    rewarded: true, rewardedAt: serverTimestamp(), rewardedBy: auth.currentUser?.uid || 'widget',
  });
  const updates = {};
  if (gold > 0) updates.gold = increment(gold);
  if (exp > 0) updates.exp = increment(exp);
  if (diamond > 0) updates.diamonds = increment(diamond);
  if (Object.keys(updates).length) await updateDoc(doc(db, 'students', studentId), updates);
}

// ── 배움노트 패널 ──
async function loadNotesPanel() {
  show('notesPanel');
  $('notesContent').innerHTML = '<p class="sub-loading">불러오는 중...</p>';
  const scope = await getScope();
  if (!scope) { show('dashboardPanel'); return; }
  try {
    const snap = await getDocs(query(collection(db, 'learningNotes'), where('teacherUid', '==', scope.teacherUid)));
    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(n => n.status === 'pending')
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (!pending.length) { $('notesContent').innerHTML = '<p class="empty-state">승인 대기 중인 배움노트가 없습니다.</p>'; return; }

    $('notesContent').innerHTML = pending.map(note => {
      const date = tsToDate(note.createdAt);
      const dateStr = date ? date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '';
      return `<div class="info-card" id="note-${note.id}">
        <div class="info-card-header">
          <span class="info-card-title">${escapeHtml(note.studentName || note.studentId)}</span>
          <span class="info-card-meta">${dateStr}</span>
        </div>
        ${note.content ? `<p class="note-content">${escapeHtml(note.content.slice(0, 120))}${note.content.length > 120 ? '…' : ''}</p>` : ''}
        <div class="note-actions">
          <button class="note-approve-btn" data-nid="${note.id}">✓ 승인</button>
          <button class="note-reject-btn" data-nid="${note.id}">✗ 거절</button>
        </div>
      </div>`;
    }).join('');

    $('notesContent').querySelectorAll('.note-approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateNoteStatus(btn.dataset.nid, 'approved');
        const card = document.getElementById(`note-${btn.dataset.nid}`);
        if (card) { card.style.opacity = '0.4'; card.querySelector('.note-actions').innerHTML = '<span class="done-label">✓ 승인됨</span>'; }
      });
    });
    $('notesContent').querySelectorAll('.note-reject-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateNoteStatus(btn.dataset.nid, 'rejected');
        const card = document.getElementById(`note-${btn.dataset.nid}`);
        if (card) { card.style.opacity = '0.4'; card.querySelector('.note-actions').innerHTML = '<span class="done-label">✗ 거절됨</span>'; }
      });
    });
  } catch (err) {
    $('notesContent').innerHTML = `<p class="error-text" style="padding:12px">${escapeHtml(err.message)}</p>`;
  }
}

async function updateNoteStatus(noteId, status) {
  const updates = { status, [`${status}At`]: serverTimestamp(), [`${status}By`]: auth.currentUser?.uid || 'widget' };
  await updateDoc(doc(db, 'learningNotes', noteId), updates);
}

// ── 설정 패널 ──
function showSettingsPanel() {
  $('settingsClassCard').innerHTML = `
    <div class="panel-title">${escapeHtml($('className').textContent || '학급')}</div>
    <div class="class-meta">${escapeHtml($('classMeta').textContent || '')}</div>
    ${authUser?.email ? `<div style="margin-top:5px;font-size:11px;color:#475569">${escapeHtml(authUser.email)}</div>` : ''}
  `;
  $('pinToggleSetting').textContent = settings.alwaysOnTop ? 'ON' : 'OFF';
  $('pinToggleSetting').classList.toggle('active', settings.alwaysOnTop);
  show('settingsPanel');
}

// ── 공통 유틸 ──
function escapeHtml(v) {
  return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function getQuickUrl(target) {
  const base = (settings.webUrl || DEFAULTS.webUrl).replace(/\/$/, '');
  return `${base}/`;
}

function showError(err) {
  $('errorMessage').textContent = err?.message || String(err || '알 수 없는 오류입니다.');
  show('errorPanel');
}

// ── 이벤트 바인딩 ──
function bindEvents() {
  // 구글 로그인
  $('googleSignInBtn').addEventListener('click', async () => {
    setupState('loading');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      authUser = result.user;
      await connectUser(authUser.uid);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') setupState('login');
      else setupState('error', err.message);
    }
  });

  $('disconnectBtn').addEventListener('click', () => {
    saveSettings({ classId: '', teacherUid: '' });
    signOut(auth).catch(() => {});
    authUser = null;
    setupState('login');
  });

  $('retryLoginBtn').addEventListener('click', () => setupState('login'));

  // 대시보드 버튼
  $('settingsBtn').addEventListener('click', showSettingsPanel);
  $('refreshBtn').addEventListener('click', refresh);
  $('retryBtn').addEventListener('click', refresh);

  // 퀵 버튼
  $('quickQuestBtn').addEventListener('click', loadQuestPanel);
  $('quickNotesBtn').addEventListener('click', loadNotesPanel);

  // 퀘스트/노트 새로고침
  $('questRefreshBtn').addEventListener('click', loadQuestPanel);
  $('notesRefreshBtn').addEventListener('click', loadNotesPanel);

  // 뒤로가기 버튼 (data-target 속성 사용)
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target || 'dashboardPanel';
      if (target === 'dashboardPanel') refresh();
      else show(target);
    });
  });

  // 설정 패널 버튼
  $('pinToggleSetting').addEventListener('click', async () => {
    saveSettings({ alwaysOnTop: !settings.alwaysOnTop });
    const enabled = await window.levelupWidget?.setAlwaysOnTop(settings.alwaysOnTop);
    $('pinToggleSetting').textContent = settings.alwaysOnTop ? 'ON' : 'OFF';
    $('pinToggleSetting').classList.toggle('active', settings.alwaysOnTop);
    $('pinBtn').classList.toggle('active', Boolean(enabled));
  });

  $('openWebDashBtn').addEventListener('click', () => {
    window.levelupWidget?.openExternal(settings.webUrl || DEFAULTS.webUrl);
  });

  $('changeClassBtn').addEventListener('click', () => setupState('login'));

  $('logoutBtn').addEventListener('click', () => {
    saveSettings({ classId: '', teacherUid: '' });
    signOut(auth).catch(() => {});
    authUser = null;
    setupState('login');
  });

  // 창 컨트롤
  $('minBtn').addEventListener('click', () => window.levelupWidget?.minimize());
  $('closeBtn').addEventListener('click', () => window.levelupWidget?.close());
  $('pinBtn').addEventListener('click', async () => {
    saveSettings({ alwaysOnTop: !settings.alwaysOnTop });
    const enabled = await window.levelupWidget?.setAlwaysOnTop(settings.alwaysOnTop);
    $('pinBtn').classList.toggle('active', Boolean(enabled));
  });

  // 웹 대시보드 열기
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => window.levelupWidget?.openExternal(getQuickUrl(btn.dataset.open)));
  });
}

async function refresh() {
  try { await loadWidgetData(); }
  catch (err) { showError(err); }
}

bindEvents();
$('pinBtn').classList.toggle('active', Boolean(settings.alwaysOnTop));
window.levelupWidget?.setAlwaysOnTop(settings.alwaysOnTop);
refresh();

setInterval(() => {
  if (!$('dashboardPanel').classList.contains('hidden')) refresh();
}, 60_000);
