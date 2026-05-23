import React, { useState, useEffect } from 'react';
import DungeonMapEditor from './DungeonMapEditor';
import EquipmentManage from './EquipmentManage';
import {
  collection, getDocs, doc, addDoc, updateDoc, deleteDoc,
  setDoc, getDoc, query, orderBy, serverTimestamp, writeBatch,
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
const CATEGORY_LABEL = {
  bug:         '🐛 버그',
  feature:     '✨ 기능요청',
  improvement: '💡 개선',
  other:       '💬 기타',
};

function FeedbacksTab() {
  const [feedbacks, setFeedbacks]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [replyInputs, setReplyInputs] = useState({});
  const [replying, setReplying]     = useState(null);

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

  const sendReply = async (id) => {
    const replyText = replyInputs[id]?.trim();
    if (!replyText) return;
    setReplying(id);
    try {
      await updateDoc(doc(db, 'feedbacks', id), {
        reply: replyText,
        repliedAt: serverTimestamp(),
        status: 'done',
      });
      setFeedbacks(prev => prev.map(f =>
        f.id === id ? { ...f, reply: replyText, status: 'done', repliedAt: { toDate: () => new Date() } } : f
      ));
      setReplyInputs(prev => ({ ...prev, [id]: '' }));
    } catch (e) { alert('답변 저장 실패'); }
    finally { setReplying(null); }
  };

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date();
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filtered = filter === 'all' ? feedbacks : feedbacks.filter(f => f.status === filter);
  const newCount = feedbacks.filter(f => f.status === 'new').length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
          💬 건의/문의
          {newCount > 0 && (
            <span className="bg-rose-500 text-white text-xs font-extrabold px-2.5 py-1 rounded-full">
              {newCount}개 미답변
            </span>
          )}
        </h2>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs font-bold">
          {[['all','전체'],['new','신규'],['read','확인'],['done','완료']].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-3 py-2 transition-colors
                ${filter === val ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {label}
              {val === 'new' && newCount > 0 && <span className="ml-1 text-rose-400">({newCount})</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400 font-bold text-center py-10 animate-pulse">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">건의/문의가 없습니다</div>
      ) : (
        <div className="space-y-4">
          {filtered.map(f => (
            <div key={f.id} className={`bg-white rounded-2xl border-2 overflow-hidden
              ${f.status === 'new' ? 'border-rose-300 shadow-sm' : f.status === 'done' ? 'border-slate-200 opacity-80' : 'border-amber-200'}`}>

              {/* 메타 헤더 */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full
                    ${f.status === 'new' ? 'bg-rose-100 text-rose-700'
                    : f.status === 'read' ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'}`}>
                    {f.status === 'new' ? '🔴 미답변' : f.status === 'read' ? '🟡 확인중' : '✅ 완료'}
                  </span>
                  {f.category && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                      {CATEGORY_LABEL[f.category] || '💬 기타'}
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-700">{f.teacherEmail || f.teacherUid}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-400">{fmtDate(f.createdAt)}</span>
                  {f.status === 'new' && (
                    <button onClick={() => setStatus(f.id, 'read')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                      확인 표시
                    </button>
                  )}
                </div>
              </div>

              {/* 본문 */}
              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{f.message}</p>

                {/* 기존 답변 표시 */}
                {f.reply && (
                  <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs font-extrabold text-indigo-700">🛡️ 관리자 답변</span>
                      {f.repliedAt && <span className="text-[10px] text-indigo-400 ml-auto">{fmtDate(f.repliedAt)}</span>}
                    </div>
                    <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-wrap">{f.reply}</p>
                    {/* 답변 수정 */}
                    <button
                      onClick={() => setReplyInputs(prev => ({ ...prev, [f.id]: f.reply }))}
                      className="mt-2 text-[11px] text-indigo-500 hover:text-indigo-700 font-bold underline">
                      답변 수정
                    </button>
                  </div>
                )}

                {/* 답변 입력 폼 */}
                {(f.status !== 'done' || replyInputs[f.id] !== undefined) && (
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <label className="text-xs font-bold text-slate-500">
                      {f.reply ? '✏️ 답변 수정' : '✏️ 답변 작성'}
                    </label>
                    <textarea
                      value={replyInputs[f.id] ?? ''}
                      onChange={e => setReplyInputs(prev => ({ ...prev, [f.id]: e.target.value }))}
                      placeholder="답변 내용을 입력하세요..."
                      className="w-full border-2 border-slate-200 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-sm resize-none h-24 focus:outline-none transition-colors"
                    />
                    <div className="flex justify-end gap-2">
                      {replyInputs[f.id] !== undefined && (
                        <button
                          onClick={() => setReplyInputs(prev => { const n = {...prev}; delete n[f.id]; return n; })}
                          className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-500 font-bold text-sm hover:bg-slate-50">
                          취소
                        </button>
                      )}
                      <button
                        onClick={() => sendReply(f.id)}
                        disabled={replying === f.id || !(replyInputs[f.id]?.trim())}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-40 transition-colors shadow-sm">
                        {replying === f.id ? '전송 중...' : '답변 전송 →'}
                      </button>
                    </div>
                  </div>
                )}

                {f.status === 'done' && !f.reply && replyInputs[f.id] === undefined && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-emerald-600 font-bold">✅ 처리 완료</span>
                    <button
                      onClick={() => setReplyInputs(prev => ({ ...prev, [f.id]: '' }))}
                      className="text-[11px] text-slate-400 hover:text-indigo-500 font-bold ml-auto underline">
                      답변 남기기
                    </button>
                  </div>
                )}
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

      {/* 테스트 데이터 초기화 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 mt-2">
        <div className="font-bold text-slate-700 text-sm">🧪 테스트 데이터 관리</div>
        <button
          onClick={async () => {
            if (!window.confirm('SINSEOK-5-15가 포함된 모든 전적을 삭제할까요?')) return;
            try {
              const snap = await getDocs(collection(db, 'arenaLogs'));
              const b = writeBatch(db);
              let cnt = 0;
              snap.docs.forEach(d => {
                const { studentCode, opponentCode } = d.data();
                if (studentCode === 'SINSEOK-5-15' || opponentCode === 'SINSEOK-5-15') {
                  b.delete(doc(db, 'arenaLogs', d.id));
                  cnt++;
                }
              });
              await b.commit();
              alert(`✅ SINSEOK-5-15 전적 ${cnt}건 삭제 완료`);
            } catch (e) { alert('삭제 실패: ' + e.message); }
          }}
          className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm border border-rose-200 transition-colors">
          🗑️ SINSEOK-5-15 전적 초기화
        </button>
      </div>
    </div>
  );
}

// ── 던전 최신 데이터 (이름/설명 기준) ────────────────────────
const ADMIN_DUNGEON_DEFAULTS = [
  { id:  0, name:'슬라임 동굴',    desc:'풀숲 입구 동굴에 슬라임들이 가득하다. 모험의 시작.',       level: 1,  pos:{x:10,y:63}, reward:'🪙 50G · ⭐ 30EXP' },
  { id:  1, name:'푸른 숲 길',     desc:'나뭇잎 사이로 고블린들이 숨어 기습을 노린다.',            level: 3,  pos:{x:14,y:51}, reward:'🪙 80G · ⭐ 50EXP' },
  { id:  2, name:'독버섯 지대',    desc:'독성 포자를 뿜는 버섯들과 독충들의 서식지.',              level: 5,  pos:{x:13,y:40}, reward:'🪙 110G · ⭐ 70EXP' },
  { id:  3, name:'고목 신전',      desc:'수백 년 된 거목 아래 봉인된 고대 신전. 나무 정령이 지킨다.',level: 7, pos:{x:24,y:77}, reward:'🪙 140G · ⭐ 90EXP' },
  { id:  4, name:'어둠의 숲 심부', desc:'빛이 닿지 않는 숲 깊은 곳. 타락한 정령왕이 기다린다.',   level: 9,  pos:{x:27,y:69}, reward:'🪙 170G · ⭐ 110EXP' },
  { id:  5, name:'눈보라 입구',    desc:'갑자기 시작된 폭설. 길을 잃은 얼음 괴물들이 돌아다닌다.', level:11, pos:{x:30,y:63}, reward:'🪙 200G · ⭐ 130EXP' },
  { id:  6, name:'서리 협곡',      desc:'뼈를 에는 칼바람이 부는 협곡. 냉기 정령이 지킨다.',      level:13, pos:{x:32,y:55}, reward:'🪙 230G · ⭐ 150EXP' },
  { id:  7, name:'빙하 요새',      desc:'거대한 빙하 위에 세워진 요새. 얼음 기사단이 주둔한다.',   level:15, pos:{x:34,y:47}, reward:'🪙 260G · ⭐ 170EXP' },
  { id:  8, name:'안개 늪',        desc:'짙은 안개로 가득한 늪. 독개구리와 늪 정령이 출몰한다.',   level:17, pos:{x:35,y:39}, reward:'🪙 300G · ⭐ 190EXP' },
  { id:  9, name:'독늪 지대',      desc:'독성 늪물이 흐르는 위험 지역. 발을 잘못 디디면 끝이다.',  level:19, pos:{x:38,y:30}, reward:'🪙 340G · 💎 1 · ⭐ 210EXP' },
  { id: 10, name:'늪의 신전',      desc:'늪 한가운데 솟아오른 고대 신전. 저주받은 사제가 봉인됐다.',level:21, pos:{x:41,y:22}, reward:'🪙 380G · 💎 2 · ⭐ 230EXP' },
  { id: 11, name:'수렁 지하 통로', desc:'지하로 이어지는 늪의 통로. 거대 진흙 골렘이 지킨다.',     level:23, pos:{x:44,y:15}, reward:'🪙 420G · 💎 2 · ⭐ 250EXP' },
  { id: 12, name:'독늪 왕의 영지', desc:'늪지대를 지배하는 거대 개구리 왕의 본거지.',              level:25, pos:{x:53,y:68}, reward:'🪙 460G · 💎 3 · ⭐ 280EXP' },
  { id: 13, name:'어둠의 늪 심부', desc:'빛이 없는 늪의 가장 깊은 곳. 최강의 늪 괴물이 기다린다.',level:27, pos:{x:57,y:60}, reward:'🪙 500G · 💎 3 · ⭐ 310EXP' },
  { id: 14, name:'뜨거운 모래밭',  desc:'뜨거운 열기가 가득한 사막 입구. 모래 도마뱀이 도사린다.', level:29, pos:{x:60,y:52}, reward:'🪙 540G · 💎 4 · ⭐ 340EXP' },
  { id: 15, name:'모래 폭풍 지대', desc:'쉼없이 몰아치는 모래 폭풍. 방향 감각을 잃으면 끝이다.',   level:31, pos:{x:63,y:44}, reward:'🪙 580G · 💎 4 · ⭐ 370EXP' },
  { id: 16, name:'선인장 미로',    desc:'독침을 쏘는 선인장 몬스터들의 미로 지대.',                level:33, pos:{x:67,y:37}, reward:'🪙 620G · 💎 5 · ⭐ 400EXP' },
  { id: 17, name:'파라오 무덤',    desc:'저주받은 파라오가 영원히 잠든 거대 무덤.',                level:35, pos:{x:67,y:28}, reward:'🪙 660G · 💎 5 · ⭐ 430EXP' },
  { id: 18, name:'사막 신전',      desc:'모래 속에 묻힌 고대 신전. 미라 군단이 봉인을 지킨다.',    level:37, pos:{x:71,y:53}, reward:'🪙 700G · 💎 6 · ⭐ 460EXP' },
  { id: 19, name:'사막 왕의 능',   desc:'사막을 지배했던 왕의 거대한 능. 최강의 미라 왕이 기다린다.',level:39,pos:{x:75,y:46}, reward:'🪙 740G · 💎 6 · ⭐ 490EXP' },
  { id: 20, name:'불꽃 협곡',      desc:'화염이 치솟는 협곡. 불꽃 도마뱀 군단이 지킨다.',          level:41, pos:{x:77,y:40}, reward:'🪙 780G · 💎 7 · ⭐ 520EXP' },
  { id: 21, name:'용암 동굴',      desc:'마그마가 흐르는 화산 내부. 용암 골렘들이 순찰한다.',       level:43, pos:{x:80,y:34}, reward:'🪙 820G · 💎 7 · ⭐ 550EXP' },
  { id: 22, name:'화산 사원',      desc:'불의 신에게 바쳐진 고대 사원. 불꽃 사제들이 지킨다.',      level:45, pos:{x:78,y:28}, reward:'🪙 860G · 💎 8 · ⭐ 580EXP' },
  { id: 23, name:'용의 둥지',      desc:'화산 정상에 둥지를 튼 고룡. 전설의 용이 기다린다.',        level:48, pos:{x:84,y:24}, reward:'🪙 920G · 💎 9 · ⭐ 620EXP' },
  { id: 24, name:'마왕 성채',      desc:'세계를 지배하려는 마왕의 최후 요새. 모든 용사의 종착지.',   level:52, pos:{x:85,y:17}, reward:'🪙 1200G · 💎 15 · ⭐ 800EXP' },
];

// ── 6. 콘텐츠 관리 탭 ────────────────────────────────────────
const DEFAULT_QUEST_TEMPLATES = [
  { title:'지각하지 않고 등교하기',  type:'daily',  difficulty:'easy',   selfCheck:true,  rewards:{exp:50,gold:50,diamond:25},   description:'제 시간에 등교해요.' },
  { title:'아침시간에 조용히 하기',  type:'daily',  difficulty:'easy',   selfCheck:true,  rewards:{exp:50,gold:50,diamond:25},   description:'아침 자습 시간에 조용히 준비해요.' },
  { title:'내 책상 위와 서랍 안 정리정돈하기', type:'daily', difficulty:'easy', selfCheck:false, rewards:{exp:50,gold:50,diamond:25}, description:'책상 위와 서랍 안을 깔끔하게 정리해요.' },
  { title:'수업 시간에 자신감 있게 손들고 발표 1회 하기', type:'daily', difficulty:'medium', selfCheck:true, rewards:{exp:80,gold:100,diamond:50}, description:'수업 중 자신 있게 손을 들고 한 번 이상 발표해요.' },
  { title:'하루종일 비속어 쓰지 않고 고운말 사용하기', type:'daily', difficulty:'easy', selfCheck:true, rewards:{exp:50,gold:50,diamond:25}, description:'하루 동안 친구와 선생님께 바른말 고운말을 사용해요.' },
  { title:'싸우지 않기 (말싸움 포함)', type:'daily', difficulty:'easy', selfCheck:true, rewards:{exp:50,gold:50,diamond:25}, description:'친구와 말다툼이나 몸싸움 없이 하루를 보내요.' },
  { title:'금지어 말하지 않기', type:'daily', difficulty:'easy', selfCheck:true, rewards:{exp:50,gold:50,diamond:25}, description:'「제가 안 했는데요」「쟤가 먼저 했는데요」 같은 말을 하지 않아요.' },
  { title:'일주일 동안 선생님 잔소리 듣지 않기', type:'weekly', difficulty:'hard', selfCheck:false, rewards:{exp:150,gold:200,diamond:100}, description:'이번 주 내내 선생님의 잔소리를 듣지 않도록 스스로 행동을 조절해요.' },
];

function ContentTab() {
  const [subTab, setSubTab]     = useState('quests'); // 'quests' | 'dungeons'
  const [quests, setQuests]     = useState([]);
  const [dungeons, setDungeons] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editingQ, setEditingQ] = useState(null); // index or null
  const [editingD, setEditingD] = useState(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const qSnap = await getDoc(doc(db, 'systemConfig', 'questTemplates'));
        setQuests(qSnap.exists() ? qSnap.data().templates : DEFAULT_QUEST_TEMPLATES);
        const dSnap = await getDoc(doc(db, 'systemConfig', 'dungeons'));
        if (dSnap.exists() && dSnap.data().list?.length > 0) {
          const saved = dSnap.data().list;
          // 첫 던전 이름이 구버전이면 이름·설명만 새 데이터로 교체 (위치·active·이미지 유지)
          if (saved[0]?.name === '고블린 동굴') {
            const merged = ADMIN_DUNGEON_DEFAULTS.map(d => {
              const s = saved.find(x => x.id === d.id);
              return s ? { ...d, pos: s.pos, active: s.active, monsterImages: s.monsterImages||[], monsters: s.monsters } : d;
            });
            await setDoc(doc(db, 'systemConfig', 'dungeons'), { list: merged });
            setDungeons(merged);
          } else {
            setDungeons(saved);
          }
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // 이미지 압축 (몬스터 이미지용)
  const compressImg = (file) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 300;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else        { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

  const saveQuests = async (list) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'questTemplates'), { templates: list });
      setQuests(list); setEditingQ(null);
    } catch (e) { alert('저장 실패'); }
    finally { setSaving(false); }
  };

  const saveDungeons = async (list) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'dungeons'), { list });
      setDungeons(list); setEditingD(null);
    } catch (e) { alert('저장 실패'); }
    finally { setSaving(false); }
  };

  const DIFF_LABEL = { easy:'🟢 쉬움', medium:'🟡 보통', hard:'🔴 어려움' };

  if (loading) return <div className="p-10 text-slate-400 font-bold text-center animate-pulse">불러오는 중...</div>;

  return (
    <div className="p-6">
      <h2 className="text-xl font-extrabold text-slate-800 mb-4">🎮 콘텐츠 관리</h2>

      {/* 서브탭 */}
      <div className="flex gap-2 mb-6">
        {[['quests','📜 추천 퀘스트'],['dungeons','🗺️ 탐험 던전']].map(([id,label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
              ${subTab===id ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 추천 퀘스트 ── */}
      {subTab === 'quests' && (
        <div className="space-y-3">
          {quests.map((q, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {editingQ === i ? (
                <div className="p-4 space-y-3">
                  <input value={q.title} onChange={e => setQuests(prev => prev.map((x,j)=>j===i?{...x,title:e.target.value}:x))}
                    className="w-full border-2 border-indigo-300 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none" placeholder="퀘스트 이름" />
                  <textarea value={q.description||''} onChange={e => setQuests(prev => prev.map((x,j)=>j===i?{...x,description:e.target.value}:x))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none h-16 focus:outline-none" placeholder="설명" />
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500">타입</label>
                      <select value={q.type} onChange={e => setQuests(prev => prev.map((x,j)=>j===i?{...x,type:e.target.value}:x))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm mt-1">
                        <option value="daily">일일</option><option value="weekly">주간</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">난이도</label>
                      <select value={q.difficulty} onChange={e => setQuests(prev => prev.map((x,j)=>j===i?{...x,difficulty:e.target.value}:x))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm mt-1">
                        <option value="easy">쉬움</option><option value="medium">보통</option><option value="hard">어려움</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">자체체크</label>
                      <select value={q.selfCheck?'true':'false'} onChange={e => setQuests(prev => prev.map((x,j)=>j===i?{...x,selfCheck:e.target.value==='true'}:x))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm mt-1">
                        <option value="true">자체체크</option><option value="false">교사확인</option>
                      </select>
                    </div>
                  </div>

                  {/* 반복 설정 */}
                  {q.type === 'daily' && (
                    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border border-orange-200">
                      <div>
                        <div className="text-sm font-bold text-orange-800">매일 반복</div>
                        <div className="text-xs text-orange-500">매일 자정 초기화</div>
                      </div>
                      <button onClick={() => setQuests(prev => prev.map((x,j)=>j===i?{...x,repeatDaily:!x.repeatDaily}:x))}
                        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${q.repeatDaily!==false?'bg-orange-500':'bg-slate-300'}`}>
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${q.repeatDaily!==false?'left-6':'left-1'}`} />
                      </button>
                    </div>
                  )}
                  {q.type === 'weekly' && (
                    <div className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-200">
                      <div>
                        <div className="text-sm font-bold text-violet-800">매주 반복</div>
                        <div className="text-xs text-violet-500">매주 월요일 초기화</div>
                      </div>
                      <button onClick={() => setQuests(prev => prev.map((x,j)=>j===i?{...x,repeatWeekly:!x.repeatWeekly}:x))}
                        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${q.repeatWeekly!==false?'bg-violet-500':'bg-slate-300'}`}>
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${q.repeatWeekly!==false?'left-6':'left-1'}`} />
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    {[['exp','⭐ EXP'],['gold','🪙 골드'],['diamond','💎 다이아']].map(([k,label]) => (
                      <div key={k}>
                        <label className="text-xs font-bold text-slate-500">{label}</label>
                        <input type="number" value={q.rewards?.[k]||0}
                          onChange={e => setQuests(prev => prev.map((x,j)=>j===i?{...x,rewards:{...x.rewards,[k]:Number(e.target.value)}}:x))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm mt-1 text-center" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingQ(null)} className="px-4 py-2 text-slate-500 border border-slate-200 rounded-xl text-sm font-bold">취소</button>
                    <button onClick={() => saveQuests(quests)} disabled={saving}
                      className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">저장</button>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${q.type==='daily'?'bg-sky-100 text-sky-700':'bg-violet-100 text-violet-700'}`}>
                        {q.type==='daily'?'일일':'주간'}
                      </span>
                      <span className="text-[10px] text-slate-400">{DIFF_LABEL[q.difficulty]}</span>
                      <span className="text-[10px] text-slate-400">{q.selfCheck?'자체체크':'교사확인'}</span>
                      {q.type==='daily'  && q.repeatDaily!==false  && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">매일반복</span>}
                      {q.type==='weekly' && q.repeatWeekly!==false && <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold">매주반복</span>}
                    </div>
                    <div className="font-bold text-slate-800 text-sm truncate">{q.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      ⭐{q.rewards?.exp} · 🪙{q.rewards?.gold} · 💎{q.rewards?.diamond}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditingQ(i)}
                      className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 rounded-lg font-bold">수정</button>
                    <button onClick={() => saveQuests(quests.filter((_,j)=>j!==i))}
                      className="text-xs px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg font-bold">삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => {
            const newQ = {title:'새 퀘스트',type:'daily',difficulty:'easy',selfCheck:true,rewards:{exp:50,gold:50,diamond:25},description:''};
            const next = [...quests, newQ];
            setQuests(next); setEditingQ(next.length-1);
          }}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 text-slate-400 hover:text-indigo-600 font-bold text-sm transition-colors">
            + 추천 퀘스트 추가
          </button>
        </div>
      )}

      {/* ── 탐험 던전 ── */}
      {subTab === 'dungeons' && (
        <div className="space-y-4">
          {/* 맵 에디터 */}
          <DungeonMapEditor />
          <div className="border-t border-slate-200 pt-4">
            <h4 className="font-extrabold text-slate-700 text-sm mb-3">📋 던전 정보 편집</h4>
          </div>
          {dungeons.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
              ⚠️ Firebase에 던전 데이터 없음. 탐험던전 페이지 접속 시 자동 저장됩니다.
            </div>
          )}
          {dungeons.map((d, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {editingD === i ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500">던전 이름</label>
                      <input value={d.name} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                        className="w-full border-2 border-indigo-300 rounded-xl px-3 py-2 text-sm font-bold mt-1 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">권장 레벨</label>
                      <input type="number" value={d.level} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,level:Number(e.target.value)}:x))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 text-center focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">설명</label>
                    <textarea value={d.desc} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,desc:e.target.value}:x))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none h-16 mt-1 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">보상 텍스트</label>
                    <input value={d.reward} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,reward:e.target.value}:x))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none" placeholder="🪙 50G · ⭐ 30EXP" />
                  </div>

                  {/* 출현 몬스터 */}
                  <div>
                    <label className="text-xs font-bold text-slate-500">출현 몬스터 이름</label>
                    <input value={d.monsters||''} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,monsters:e.target.value}:x))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none" placeholder="예: 고블린, 오크 전사" />
                  </div>

                  {/* 몬스터 이미지 (최대 5개) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-500">출현 몬스터 이미지 (최대 5개)</label>
                      <span className="text-[10px] text-slate-400">{(d.monsterImages||[]).length}/5</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(d.monsterImages||[]).map((img, mi) => (
                        <div key={mi} className="relative">
                          <img src={img} alt="" className="w-16 h-16 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                          <button onClick={() => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,monsterImages:(x.monsterImages||[]).filter((_,k)=>k!==mi)}:x))}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] flex items-center justify-center">✕</button>
                        </div>
                      ))}
                      {(d.monsterImages||[]).length < 5 && (
                        <label className="w-16 h-16 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600 cursor-pointer border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-400 transition-colors">
                          🖼️<span>추가</span>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const b64 = await compressImg(file);
                              setDungeons(prev=>prev.map((x,j)=>j===i?{...x,monsterImages:[...(x.monsterImages||[]),b64]}:x));
                              e.target.value = '';
                            }} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* 활성화 토글 */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div>
                      <div className="text-sm font-bold text-slate-700">던전 활성화 (구현 여부)</div>
                      <div className="text-xs text-slate-400">비활성화 시 학생이 입장 불가 (정보는 볼 수 있음)</div>
                    </div>
                    <button onClick={() => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,active:x.active===false}:x))}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0
                        ${d.active !== false ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                        ${d.active !== false ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500">위치 X (%)</label>
                      <input type="number" value={d.pos?.x||0} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,pos:{...x.pos,x:Number(e.target.value)}}:x))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 text-center focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">위치 Y (%)</label>
                      <input type="number" value={d.pos?.y||0} onChange={e => setDungeons(prev=>prev.map((x,j)=>j===i?{...x,pos:{...x.pos,y:Number(e.target.value)}}:x))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 text-center focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingD(null)} className="px-4 py-2 text-slate-500 border border-slate-200 rounded-xl text-sm font-bold">취소</button>
                    <button onClick={() => saveDungeons(dungeons)} disabled={saving}
                      className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">저장</button>
                  </div>
                </div>
              ) : (
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">{d.name}</span>
                      <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Lv.{d.level}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold
                        ${d.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {d.active !== false ? '✅ 구현됨' : '🔒 미구현'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">{d.desc}</div>
                    <div className="text-xs text-amber-600 font-medium mt-0.5">{d.reward}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 구현됨/미구현 토글 */}
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-bold text-slate-400">
                        {d.active !== false ? '구현됨' : '미구현'}
                      </span>
                      <button
                        onClick={() => {
                          const next = dungeons.map((x,j) => j===i ? {...x, active: x.active===false} : x);
                          saveDungeons(next);
                        }}
                        className={`w-10 h-5 rounded-full transition-colors relative
                          ${d.active !== false ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
                          ${d.active !== false ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <button onClick={() => setEditingD(i)}
                      className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 rounded-lg font-bold">수정</button>
                    <button onClick={() => saveDungeons(dungeons.filter((_,j)=>j!==i))}
                      className="text-xs px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg font-bold">삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 배틀씬 레이아웃 에디터 ────────────────────────────────────
const QUIZ_DEFAULTS = {
  sceneHeightVh:      55,
  playerLeftPct:       8,
  playerBottomPx:      4,
  playerCharHeightPx: 130,
  playerScale:        2.6,
  monsterRightPct:     8,
  monsterBottomPx:     4,
  monsterCharHeightPx:230,
  monsterScaleMult:   1.7,
};

function BattleLayoutTab() {
  const [cfg, setCfg]       = useState(QUIZ_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'siteConfig', 'battleLayout')).then(snap => {
      if (snap.exists()) setCfg({ ...QUIZ_DEFAULTS, ...snap.data().quiz });
    }).catch(() => {});
  }, []);

  const Slider = ({ label, field, min, max, step = 1 }) => (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-xs w-44 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step}
        value={cfg[field]}
        onChange={e => setCfg(p => ({ ...p, [field]: parseFloat(e.target.value) }))}
        className="flex-1 accent-indigo-500" />
      <span className="text-white font-extrabold text-sm w-12 text-right">{cfg[field]}</span>
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'siteConfig', 'battleLayout'), { quiz: cfg }, { merge: true });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert('저장 실패: ' + e.message); }
    finally { setSaving(false); }
  };

  const reset = () => setCfg(QUIZ_DEFAULTS);

  /* ── 미니 프리뷰 ── */
  const previewScale = 0.35;
  const previewW = 390 * previewScale;
  const previewH = (cfg.sceneHeightVh / 100 * 700) * previewScale;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="font-extrabold text-slate-800 text-lg mb-1">🎮 퀴즈던전 배틀씬 레이아웃</h2>
        <p className="text-slate-500 text-sm">슬라이더로 조정하고 저장하면 바로 반영됩니다.</p>
      </div>

      {/* 미니 프리뷰 */}
      <div className="bg-slate-800 rounded-2xl p-4">
        <div className="text-xs text-slate-400 mb-2 font-bold">미리보기 (35% 축소)</div>
        <div className="relative bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-800 rounded-xl overflow-hidden"
          style={{ width: previewW, height: previewH }}>
          {/* 바닥 라인 */}
          <div className="absolute inset-x-0 h-px bg-indigo-500/30"
            style={{ bottom: (14 + cfg.playerCharHeightPx + 30) * previewScale }} />
          {/* 플레이어 */}
          <div className="absolute bg-indigo-500/60 rounded"
            style={{
              left:   `${cfg.playerLeftPct}%`,
              bottom: cfg.playerBottomPx * previewScale,
              width:  cfg.playerCharHeightPx * previewScale,
              height: cfg.playerCharHeightPx * previewScale,
            }} />
          {/* 몬스터 */}
          <div className="absolute bg-rose-500/60 rounded"
            style={{
              right:  `${cfg.monsterRightPct}%`,
              bottom: cfg.monsterBottomPx * previewScale,
              width:  cfg.monsterCharHeightPx * 0.8 * previewScale,
              height: cfg.monsterCharHeightPx * previewScale,
            }} />
          {/* VS */}
          <div className="absolute left-1/2 -translate-x-1/2 text-slate-500/60 font-extrabold"
            style={{ bottom: previewH * 0.45, fontSize: 8 }}>VS</div>
        </div>
      </div>

      {/* 슬라이더 그룹 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="font-bold text-slate-700 text-sm border-b border-slate-100 pb-2">씬 전체</div>
        <Slider label="씬 높이 (vh)"              field="sceneHeightVh"      min={40} max={80} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="font-bold text-indigo-600 text-sm border-b border-slate-100 pb-2">🟦 플레이어 (좌)</div>
        <Slider label="좌측 위치 (%)"              field="playerLeftPct"       min={0}  max={40} />
        <Slider label="하단 여백 (px)"             field="playerBottomPx"      min={0}  max={60} />
        <Slider label="캐릭터 컨테이너 높이 (px)"  field="playerCharHeightPx"  min={60} max={250} step={5} />
        <Slider label="캐릭터 scale 배율"          field="playerScale"          min={1}  max={5}  step={0.1} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="font-bold text-rose-600 text-sm border-b border-slate-100 pb-2">🟥 몬스터 (우)</div>
        <Slider label="우측 위치 (%)"              field="monsterRightPct"      min={0}  max={40} />
        <Slider label="하단 여백 (px)"             field="monsterBottomPx"      min={0}  max={60} />
        <Slider label="몬스터 컨테이너 높이 (px)"  field="monsterCharHeightPx"  min={80} max={350} step={5} />
        <Slider label="몬스터 scale 배율"          field="monsterScaleMult"     min={0.5} max={4} step={0.1} />
      </div>

      <div className="flex gap-3">
        <button onClick={reset}
          className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-500 border border-slate-300 hover:bg-slate-50 transition-colors">
          기본값으로
        </button>
        <button onClick={save} disabled={saving}
          className={`flex-1 py-2.5 rounded-xl font-extrabold text-sm text-white transition-all
            ${saved ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:opacity-50`}>
          {saved ? '✅ 저장됨!' : saving ? '저장 중...' : '💾 저장 (즉시 반영)'}
        </button>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',    icon: '📊', label: '대시보드' },
  { id: 'teachers',     icon: '👨‍🏫', label: '교사 관리' },
  { id: 'notices',      icon: '📢', label: '공지사항' },
  { id: 'feedbacks',    icon: '💬', label: '건의/문의' },
  { id: 'settings',     icon: '⚙️', label: '시스템 설정' },
  { id: 'content',      icon: '🎮', label: '콘텐츠 관리' },
  { id: 'equipment',    icon: '⚔️', label: '장비 관리' },
  { id: 'battleLayout', icon: '🖼️', label: '배틀씬 에디터' },
];

export default function AdminPage({ adminUser, onLogout }) {
  const [tab, setTab]           = useState('dashboard');
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'feedbacks')).then(snap => {
      setNewFeedbackCount(snap.docs.filter(d => d.data().status === 'new').length);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-slate-950">
      {/* 사이드바 */}
      <div className="w-56 bg-slate-900 flex flex-col shrink-0 border-r border-slate-800">
        {/* 로고/프로필 */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shrink-0">
              🛡️
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-white text-sm">관리자</div>
              <div className="text-slate-500 text-[11px] truncate">{adminUser?.email}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-3
                ${tab === t.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <span className="text-base shrink-0">{t.icon}</span>
              <span className="flex-1">{t.label}</span>
              {t.id === 'feedbacks' && newFeedbackCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                  {newFeedbackCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button onClick={onLogout}
            className="w-full py-2.5 text-slate-500 hover:text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
            <span>🚪</span> 로그아웃
          </button>
        </div>
      </div>

      {/* 본문 */}
      <main className="flex-1 overflow-auto bg-slate-100">
        {/* 탭 상단 헤더 바 */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
          <span className="text-xl">{TABS.find(t => t.id === tab)?.icon}</span>
          <h1 className="font-extrabold text-slate-800 text-base">{TABS.find(t => t.id === tab)?.label}</h1>
        </div>
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'teachers'  && <TeachersTab />}
        {tab === 'notices'   && <NoticesTab />}
        {tab === 'feedbacks' && <FeedbacksTab />}
        {tab === 'settings'  && <SettingsTab />}
        {tab === 'content'      && <ContentTab />}
        {tab === 'equipment'    && <EquipmentManage />}
        {tab === 'battleLayout' && <BattleLayoutTab />}
      </main>
    </div>
  );
}
