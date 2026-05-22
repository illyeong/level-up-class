import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  setDoc, getDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase';

// ── 통계 카드 ─────────────────────────────────────────────────
function StatCard({ icon, label, value, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    rose:   'bg-rose-50 border-rose-200 text-rose-700',
  };
  return (
    <div className={`rounded-2xl border-2 p-5 ${colors[color]}`}>
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-sm font-medium opacity-70 mt-0.5">{label}</div>
    </div>
  );
}

// ── 1. 대시보드 탭 ────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats]   = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [classSnap, studentSnap] = await Promise.all([
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'students')),
        ]);
        const classes  = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const teachers = new Set(classes.map(c => c.teacherUid)).size;

        setStats({
          teachers,
          classes:  classes.length,
          students: studentSnap.size,
        });

        const sorted = classes.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRecent(sorted.slice(0, 8));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="p-10 text-slate-400 font-bold text-center animate-pulse">불러오는 중...</div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-extrabold text-slate-800">📊 전체 현황</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="👨‍🏫" label="가입 교사" value={`${stats?.teachers || 0}명`} color="indigo" />
        <StatCard icon="🏫" label="생성 학급" value={`${stats?.classes || 0}개`} color="emerald" />
        <StatCard icon="👨‍🎓" label="전체 학생" value={`${stats?.students || 0}명`} color="amber" />
        <StatCard icon="🏆" label="학급당 평균" value={stats?.classes ? `${Math.round((stats.students || 0) / stats.classes)}명` : '-'} color="rose" />
      </div>

      <div>
        <h3 className="font-extrabold text-slate-700 text-sm mb-3">최근 생성된 학급</h3>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-slate-400">학급이 없습니다</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">학교</th>
                  <th className="px-4 py-3 text-left font-semibold">학년/반</th>
                  <th className="px-4 py-3 text-center font-semibold">학생</th>
                  <th className="px-4 py-3 text-left font-semibold">교사 UID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recent.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{c.schoolName}</td>
                    <td className="px-4 py-3 text-slate-600">{c.grade}학년 {c.classNumber}반</td>
                    <td className="px-4 py-3 text-center font-bold text-indigo-600">{c.studentCount}명</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-400 truncate max-w-[160px]">{c.teacherUid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 2. 교사 관리 탭 ───────────────────────────────────────────
function TeachersTab() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [classSnap, studentSnap] = await Promise.all([
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'students')),
        ]);
        const classes  = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const students = studentSnap.docs.map(d => d.data());

        // teacherUid 기준으로 그룹핑
        const map = {};
        classes.forEach(c => {
          if (!map[c.teacherUid]) map[c.teacherUid] = {
            teacherUid:   c.teacherUid,
            teacherEmail: c.teacherEmail || '',
            classes: [],
            studentCount: 0,
          };
          map[c.teacherUid].classes.push(c);
        });
        students.forEach(s => {
          if (s.teacherUid && map[s.teacherUid])
            map[s.teacherUid].studentCount++;
        });

        setTeachers(Object.values(map).sort((a, b) => b.classes.length - a.classes.length));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="p-10 text-slate-400 font-bold text-center animate-pulse">불러오는 중...</div>;

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-extrabold text-slate-800">👨‍🏫 교사 목록 ({teachers.length}명)</h2>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {teachers.length === 0 ? (
          <div className="p-8 text-center text-slate-400">등록된 교사가 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">이메일</th>
                <th className="px-4 py-3 text-center font-semibold">학급</th>
                <th className="px-4 py-3 text-center font-semibold">학생</th>
                <th className="px-4 py-3 text-left font-semibold">학급 목록</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map(t => (
                <tr key={t.teacherUid} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-800">{t.teacherEmail || t.teacherUid}</td>
                  <td className="px-4 py-3 text-center font-extrabold text-indigo-600">{t.classes.length}개</td>
                  <td className="px-4 py-3 text-center font-extrabold text-emerald-600">{t.studentCount}명</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {t.classes.map(c => (
                        <span key={c.id} className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                          {c.schoolName} {c.grade}-{c.classNumber}반
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── 3. 공지사항 탭 ────────────────────────────────────────────
function NoticesTab() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle]   = useState('');
  const [content, setContent] = useState('');
  const [type, setType]     = useState('all');
  const [saving, setSaving] = useState(false);

  const fetchNotices = async () => {
    const snap = await getDocs(query(collection(db, 'notices'), orderBy('createdAt', 'desc')));
    setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { fetchNotices(); }, []);

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'notices'), {
        title: title.trim(), content: content.trim(),
        type, active: true, createdAt: serverTimestamp(),
      });
      setTitle(''); setContent(''); setShowForm(false);
      fetchNotices();
    } catch (e) { alert('저장 실패'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (notice) => {
    await updateDoc(doc(db, 'notices', notice.id), { active: !notice.active });
    setNotices(prev => prev.map(n => n.id === notice.id ? { ...n, active: !n.active } : n));
  };

  const remove = async (id) => {
    if (!window.confirm('삭제할까요?')) return;
    await deleteDoc(doc(db, 'notices', id));
    setNotices(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-slate-800">📢 공지사항</h2>
        <button onClick={() => setShowForm(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm">
          + 공지 작성
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5 space-y-3">
          <div className="flex gap-3">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목"
              className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            <select value={type} onChange={e => setType(e.target.value)}
              className="border-2 border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="all">일반 공지</option>
              <option value="urgent">긴급 공지</option>
              <option value="update">업데이트</option>
            </select>
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="내용"
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm resize-none h-24 focus:outline-none focus:border-indigo-500" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm">취소</button>
            <button onClick={submit} disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50">
              {saving ? '저장 중...' : '발행하기'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loading ? <div className="text-slate-400 font-bold text-center py-10 animate-pulse">불러오는 중...</div>
        : notices.length === 0 ? <div className="text-center py-10 text-slate-400">공지사항이 없습니다</div>
        : notices.map(n => (
          <div key={n.id} className={`bg-white rounded-2xl border-2 p-4 transition-all
            ${n.active ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                    ${n.type === 'urgent' ? 'bg-rose-100 text-rose-700'
                    : n.type === 'update' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-indigo-100 text-indigo-700'}`}>
                    {n.type === 'urgent' ? '🚨 긴급' : n.type === 'update' ? '🆕 업데이트' : '📢 공지'}
                  </span>
                  <span className="font-extrabold text-slate-800 text-sm">{n.title}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{n.content}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleActive(n)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors
                    ${n.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                  {n.active ? '공개 중' : '숨김'}
                </button>
                <button onClick={() => remove(n.id)}
                  className="text-xs font-bold px-2 py-1.5 rounded-lg bg-rose-50 text-rose-500 border border-rose-200">
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. 건의/문의 탭 ───────────────────────────────────────────
function FeedbacksTab() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all'); // all | new | done

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc')));
        setFeedbacks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const setStatus = async (id, status) => {
    await updateDoc(doc(db, 'feedbacks', id), { status });
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status } : f));
  };

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date();
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filtered = filter === 'all' ? feedbacks : feedbacks.filter(f => f.status === filter);
  const newCount = feedbacks.filter(f => f.status === 'new').length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-slate-800">
          💬 건의/문의
          {newCount > 0 && <span className="ml-2 bg-rose-500 text-white text-xs font-extrabold px-2 py-0.5 rounded-full">{newCount}개 신규</span>}
        </h2>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs">
          {[['all','전체'],['new','신규'],['read','확인'],['done','완료']].map(([val,label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-1.5 font-bold transition-colors
                ${filter === val ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-slate-400 font-bold text-center py-10 animate-pulse">불러오는 중...</div>
      : filtered.length === 0 ? <div className="text-center py-10 text-slate-400">건의/문의가 없습니다</div>
      : (
        <div className="space-y-3">
          {filtered.map(f => (
            <div key={f.id} className={`bg-white rounded-2xl border-2 p-4
              ${f.status === 'new' ? 'border-rose-200' : f.status === 'done' ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                      ${f.status === 'new' ? 'bg-rose-100 text-rose-700'
                      : f.status === 'read' ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500'}`}>
                      {f.status === 'new' ? '🔴 신규' : f.status === 'read' ? '🟡 확인중' : '✅ 완료'}
                    </span>
                    <span className="text-xs text-slate-500">{f.teacherEmail || f.teacherUid}</span>
                    <span className="text-xs text-slate-400 ml-auto">{fmtDate(f.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{f.message}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {f.status === 'new' && (
                    <button onClick={() => setStatus(f.id, 'read')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">확인</button>
                  )}
                  {f.status !== 'done' && (
                    <button onClick={() => setStatus(f.id, 'done')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">완료</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 5. 시스템 설정 탭 ─────────────────────────────────────────
function SettingsTab() {
  const [config, setConfig]   = useState({ maxClassPerTeacher: 2, maxStudentsPerClass: 32, maintenanceMode: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'global'));
        if (snap.exists()) setConfig(prev => ({ ...prev, ...snap.data() }));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'global'), config);
      alert('✅ 설정이 저장되었습니다.');
    } catch (e) { alert('저장 실패'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-10 text-slate-400 font-bold text-center animate-pulse">불러오는 중...</div>;

  return (
    <div className="p-6 max-w-lg space-y-6">
      <h2 className="text-xl font-extrabold text-slate-800">⚙️ 시스템 설정</h2>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">교사당 최대 학급 수</label>
          <input type="number" min="1" max="10" value={config.maxClassPerTeacher}
            onChange={e => setConfig(p => ({ ...p, maxClassPerTeacher: Number(e.target.value) }))}
            className="w-32 border-2 border-slate-200 rounded-xl px-4 py-2 text-lg font-bold text-center focus:outline-none focus:border-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">학급당 최대 학생 수</label>
          <input type="number" min="1" max="100" value={config.maxStudentsPerClass}
            onChange={e => setConfig(p => ({ ...p, maxStudentsPerClass: Number(e.target.value) }))}
            className="w-32 border-2 border-slate-200 rounded-xl px-4 py-2 text-lg font-bold text-center focus:outline-none focus:border-indigo-500" />
        </div>

        <div className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-200">
          <div>
            <div className="font-bold text-rose-700 text-sm">점검 모드</div>
            <div className="text-xs text-rose-500 mt-0.5">활성화 시 교사/학생 로그인 불가</div>
          </div>
          <button onClick={() => setConfig(p => ({ ...p, maintenanceMode: !p.maintenanceMode }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${config.maintenanceMode ? 'bg-rose-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
              ${config.maintenanceMode ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-colors disabled:opacity-50">
        {saving ? '저장 중...' : '💾 설정 저장'}
      </button>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', label: '📊 대시보드' },
  { id: 'teachers',  label: '👨‍🏫 교사 관리' },
  { id: 'notices',   label: '📢 공지사항' },
  { id: 'feedbacks', label: '💬 건의/문의' },
  { id: 'settings',  label: '⚙️ 시스템 설정' },
];

export default function AdminPage({ adminUser, onLogout }) {
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="flex h-screen bg-slate-900">
      {/* 사이드바 */}
      <div className="w-52 bg-slate-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-700">
          <div className="font-extrabold text-white text-sm">🛡️ 관리자</div>
          <div className="text-slate-400 text-[11px] mt-0.5 truncate">{adminUser?.email}</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full text-left px-4 py-2.5 rounded-xl font-bold text-sm transition-colors
                ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <button onClick={onLogout}
            className="w-full py-2 text-slate-400 hover:text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-colors">
            🚪 로그아웃
          </button>
        </div>
      </div>

      {/* 본문 */}
      <main className="flex-1 overflow-auto bg-slate-100">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'teachers'  && <TeachersTab />}
        {tab === 'notices'   && <NoticesTab />}
        {tab === 'feedbacks' && <FeedbacksTab />}
        {tab === 'settings'  && <SettingsTab />}
      </main>
    </div>
  );
}
