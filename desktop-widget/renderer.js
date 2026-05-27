import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

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

const DEFAULTS = {
  classId: '',
  teacherUid: '',
  webUrl: 'https://level-up-class.vercel.app',
  alwaysOnTop: false,
};

const $ = (id) => document.getElementById(id);
const fmt = (value) => Number(value || 0).toLocaleString('ko-KR');

let settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('levelup-widget-settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(next) {
  settings = { ...settings, ...next };
  localStorage.setItem('levelup-widget-settings', JSON.stringify(settings));
}

function show(panelId) {
  ['setupPanel', 'dashboardPanel', 'errorPanel'].forEach((id) => $(id).classList.add('hidden'));
  $(panelId).classList.remove('hidden');
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function tsToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(value) {
  const date = tsToDate(value);
  return date ? date >= todayStart() : false;
}

function scopedQuery(collectionName, field, value) {
  return query(collection(db, collectionName), where(field, '==', value));
}

async function getScope() {
  const classId = settings.classId.trim();
  const teacherUid = settings.teacherUid.trim();

  if (classId) {
    const classSnap = await getDoc(doc(db, 'classes', classId));
    const data = classSnap.exists() ? { id: classSnap.id, ...classSnap.data() } : { id: classId };
    return {
      classId,
      teacherUid: data.teacherUid || teacherUid,
      className: data.name || data.className || '선택한 학급',
      schoolName: data.schoolName || '',
      grade: data.grade || '',
      classNumber: data.classNumber || data.classNum || '',
    };
  }

  if (teacherUid) {
    const classSnap = await getDocs(scopedQuery('classes', 'teacherUid', teacherUid));
    const first = classSnap.docs[0];
    const data = first ? { id: first.id, ...first.data() } : null;
    return {
      classId: data?.id || '',
      teacherUid,
      className: data?.name || data?.className || '교사 전체 학급',
      schoolName: data?.schoolName || '',
      grade: data?.grade || '',
      classNumber: data?.classNumber || data?.classNum || '',
    };
  }

  return null;
}

async function loadWidgetData() {
  const scope = await getScope();
  if (!scope) {
    showSetup();
    return;
  }

  show('dashboardPanel');
  $('className').textContent = scope.className;
  $('classMeta').textContent = [
    scope.schoolName,
    scope.grade ? `${scope.grade}학년` : '',
    scope.classNumber ? `${scope.classNumber}반` : '',
  ].filter(Boolean).join(' ') || scope.classId || scope.teacherUid;

  const studentField = scope.classId ? 'classId' : 'teacherUid';
  const studentValue = scope.classId || scope.teacherUid;

  const [studentsSnap, notesSnap, raidsSnap, questsSnap, purchasesSnap, usagesSnap] = await Promise.all([
    getDocs(scopedQuery('students', studentField, studentValue)),
    scope.teacherUid ? getDocs(scopedQuery('learningNotes', 'teacherUid', scope.teacherUid)) : Promise.resolve({ docs: [] }),
    scope.classId
      ? getDocs(scopedQuery('worldBossRaids', 'classId', scope.classId))
      : getDocs(scopedQuery('worldBossRaids', 'teacherUid', scope.teacherUid)),
    scope.teacherUid ? getDocs(scopedQuery('quests', 'teacherUid', scope.teacherUid)) : Promise.resolve({ docs: [] }),
    scope.classId
      ? getDocs(scopedQuery('shopPurchases', 'scopeKey', scope.classId))
      : getDocs(scopedQuery('shopPurchases', 'teacherUid', scope.teacherUid)),
    scope.classId
      ? getDocs(scopedQuery('shopUsages', 'scopeKey', scope.classId))
      : getDocs(scopedQuery('shopUsages', 'teacherUid', scope.teacherUid)),
  ]);

  const students = studentsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const studentIds = new Set(students.map((student) => student.id));
  const notes = notesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((note) => !studentIds.size || studentIds.has(note.studentId));
  const raids = raidsSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const quests = questsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((quest) => quest.active !== false);
  const purchases = purchasesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const usages = usagesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));

  let todayQuestDone = 0;
  await Promise.all(quests.slice(0, 12).map(async (quest) => {
    const completionSnap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
    completionSnap.docs.forEach((item) => {
      if (studentIds.size && !studentIds.has(item.id)) return;
      const data = item.data();
      if (data.checked === true && (!quest.repeatDaily || isToday(data.checkedAt))) {
        todayQuestDone += 1;
      }
    });
  }));

  const pendingNotes = notes.filter((note) => note.status === 'pending');
  const openRaids = raids.filter((raid) => raid.status === 'waiting' || raid.status === 'active');
  const resultWaiting = raids.filter((raid) =>
    (raid.status === 'cleared' || raid.status === 'failed') && !raid.rewardsPaid
  );
  const todayActivities = new Set();

  notes.forEach((note) => {
    if (isToday(note.createdAt) || isToday(note.approvedAt)) todayActivities.add(note.studentId);
  });
  purchases.forEach((purchase) => {
    if (isToday(purchase.createdAt)) todayActivities.add(purchase.studentId);
  });
  usages.forEach((usage) => {
    if (isToday(usage.createdAt) || isToday(usage.usedAt)) todayActivities.add(usage.studentId);
  });
  raids.forEach((raid) => {
    Object.entries(raid.participants || {}).forEach(([studentId, participant]) => {
      if (isToday(participant.joinedAt) || isToday(raid.startedAt)) todayActivities.add(studentId);
    });
  });

  $('studentCount').textContent = fmt(students.length);
  $('questToday').textContent = fmt(todayQuestDone);
  $('pendingNotes').textContent = fmt(pendingNotes.length);
  $('todayActivity').textContent = fmt(todayActivities.size);
  $('totalGold').textContent = `${fmt(students.reduce((sum, student) => sum + Number(student.gold || 0), 0))}G`;
  $('totalDiamonds').textContent = fmt(students.reduce((sum, student) => sum + Number(student.diamonds || 0), 0));
  $('lastUpdated').textContent = `마지막 갱신 ${new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  renderTodos({ pendingNotes, openRaids, resultWaiting, purchases, usages });
  renderRaids(openRaids);
}

function renderTodos({ pendingNotes, openRaids, resultWaiting, purchases, usages }) {
  const todayPurchases = purchases.filter((purchase) => isToday(purchase.createdAt));
  const pendingUsages = usages.filter((usage) => !usage.confirmed && !usage.used);
  const todos = [
    pendingNotes.length > 0 && {
      title: `배움노트 승인 대기 ${pendingNotes.length}건`,
      meta: pendingNotes.slice(0, 3).map((note) => note.studentName).filter(Boolean).join(', ') || '확인이 필요합니다.',
    },
    resultWaiting.length > 0 && {
      title: `레이드 결과 확인 ${resultWaiting.length}건`,
      meta: '결과 확인 또는 보상 지급 상태를 확인하세요.',
    },
    openRaids.length > 0 && {
      title: `진행 중인 보스레이드 ${openRaids.length}개`,
      meta: openRaids.map((raid) => raid.bossName || raid.title).filter(Boolean).slice(0, 2).join(', '),
    },
    todayPurchases.length > 0 && {
      title: `오늘 상점 구매 ${todayPurchases.length}건`,
      meta: '학급 상점 구매 흐름을 확인하세요.',
    },
    pendingUsages.length > 0 && {
      title: `아이템 사용 확인 필요 ${pendingUsages.length}건`,
      meta: '학생 사용 요청을 확인하세요.',
    },
  ].filter(Boolean);

  $('todoList').innerHTML = todos.length
    ? todos.map((todo) => `
      <div class="todo-item">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        <div class="todo-meta">${escapeHtml(todo.meta || '')}</div>
      </div>
    `).join('')
    : '<div class="todo-item"><div class="todo-title">지금 급한 확인 항목이 없습니다</div><div class="todo-meta">수업 중에는 이 창만 띄워두셔도 됩니다.</div></div>';
}

function renderRaids(openRaids) {
  $('raidList').innerHTML = openRaids.length
    ? openRaids.map((raid) => {
      const maxHp = Number(raid.maxHP || 0);
      const currentHp = Number(raid.currentHP ?? maxHp);
      const percent = maxHp > 0 ? Math.max(0, Math.round((currentHp / maxHp) * 100)) : 0;
      const participantCount = Object.keys(raid.participants || {}).length;
      return `
        <div class="raid-item">
          <div class="raid-title">${escapeHtml(raid.bossName || raid.title || '보스레이드')}</div>
          <div class="raid-meta">${raid.status === 'active' ? '전투 중' : '대기 중'} · ${participantCount}명 참여 · HP ${percent}%</div>
        </div>
      `;
    }).join('')
    : '<div class="raid-item"><div class="raid-title">열려 있는 레이드가 없습니다</div><div class="raid-meta">레이드를 시작하면 여기에 표시됩니다.</div></div>';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showSetup() {
  $('classIdInput').value = settings.classId || '';
  $('teacherUidInput').value = settings.teacherUid || '';
  $('webUrlInput').value = settings.webUrl || DEFAULTS.webUrl;
  show('setupPanel');
}

function showError(error) {
  $('errorMessage').textContent = error?.message || String(error || '알 수 없는 오류입니다.');
  show('errorPanel');
}

function getQuickUrl(target) {
  const base = (settings.webUrl || DEFAULTS.webUrl).replace(/\/$/, '');
  const paths = {
    dashboard: '/',
    quest: '/',
    note: '/',
  };
  return `${base}${paths[target] || '/'}`;
}

function bindEvents() {
  $('saveSettingsBtn').addEventListener('click', async () => {
    saveSettings({
      classId: $('classIdInput').value.trim(),
      teacherUid: $('teacherUidInput').value.trim(),
      webUrl: $('webUrlInput').value.trim() || DEFAULTS.webUrl,
    });
    await refresh();
  });

  $('settingsBtn').addEventListener('click', showSetup);
  $('refreshBtn').addEventListener('click', refresh);
  $('retryBtn').addEventListener('click', refresh);
  $('minBtn').addEventListener('click', () => window.levelupWidget?.minimize());
  $('closeBtn').addEventListener('click', () => window.levelupWidget?.close());
  $('pinBtn').addEventListener('click', async () => {
    saveSettings({ alwaysOnTop: !settings.alwaysOnTop });
    const enabled = await window.levelupWidget?.setAlwaysOnTop(settings.alwaysOnTop);
    $('pinBtn').classList.toggle('active', Boolean(enabled));
  });

  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => window.levelupWidget?.openExternal(getQuickUrl(button.dataset.open)));
  });
}

async function refresh() {
  try {
    await loadWidgetData();
  } catch (error) {
    showError(error);
  }
}

bindEvents();
$('pinBtn').classList.toggle('active', Boolean(settings.alwaysOnTop));
window.levelupWidget?.setAlwaysOnTop(settings.alwaysOnTop);
refresh();

setInterval(() => {
  if (!$('dashboardPanel').classList.contains('hidden')) refresh();
}, 60_000);
