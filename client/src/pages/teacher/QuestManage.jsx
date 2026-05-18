import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import iconQuest from '../../assets/images/icon-quest.png';
import QuestDetail from './QuestDetail';

const SKILL_OPTIONS = ['인성', '의사소통', '성실성', '창의성', '협동심', '자기관리'];

const SKILL_COLORS = {
  '인성':   'bg-purple-100 text-purple-700 border-purple-200',
  '의사소통': 'bg-blue-100 text-blue-700 border-blue-200',
  '성실성':  'bg-green-100 text-green-700 border-green-200',
  '창의성':  'bg-amber-100 text-amber-700 border-amber-200',
  '협동심':  'bg-indigo-100 text-indigo-700 border-indigo-200',
  '자기관리': 'bg-slate-100 text-slate-600 border-slate-200',
};

const DIFF = {
  easy:   { label: '쉬움',   cls: 'bg-emerald-100 text-emerald-700' },
  medium: { label: '보통',   cls: 'bg-amber-100 text-amber-700' },
  hard:   { label: '어려움', cls: 'bg-rose-100 text-rose-700' },
};

const RECOMMENDED = [
  { title: '아침 독서 10분',     type: 'daily',  difficulty: 'easy',   selfCheck: true,  rewards: { exp: 50,  gold: 50,  diamond: 0 }, skills: ['성실성'],             description: '아침 시간에 10분 동안 책을 읽어요.' },
  { title: '수업 집중하기',      type: 'daily',  difficulty: 'easy',   selfCheck: false, rewards: { exp: 100, gold: 100, diamond: 0 }, skills: ['성실성', '자기관리'],  description: '수업 시간 동안 스스로 집중해요.' },
  { title: '숙제 완료하기',      type: 'daily',  difficulty: 'easy',   selfCheck: true,  rewards: { exp: 80,  gold: 80,  diamond: 0 }, skills: ['성실성'],             description: '오늘의 숙제를 모두 완료해요.' },
  { title: '급식 잔반 없애기',   type: 'daily',  difficulty: 'easy',   selfCheck: true,  rewards: { exp: 50,  gold: 30,  diamond: 0 }, skills: ['인성'],              description: '음식을 남기지 않고 다 먹어요.' },
  { title: '친구 도와주기',      type: 'weekly', difficulty: 'medium', selfCheck: false, rewards: { exp: 200, gold: 200, diamond: 1 }, skills: ['인성', '협동심'],     description: '이번 주에 어려운 친구를 도와줘요.' },
  { title: '발표 1회 이상 하기', type: 'weekly', difficulty: 'medium', selfCheck: false, rewards: { exp: 150, gold: 150, diamond: 1 }, skills: ['의사소통'],          description: '이번 주 수업에서 1번 이상 발표해요.' },
  { title: '모둠 활동 참여하기', type: 'weekly', difficulty: 'medium', selfCheck: true,  rewards: { exp: 180, gold: 150, diamond: 1 }, skills: ['협동심', '의사소통'], description: '모둠 활동에 적극적으로 참여해요.' },
  { title: '독서 감상문 쓰기',   type: 'weekly', difficulty: 'hard',   selfCheck: false, rewards: { exp: 300, gold: 250, diamond: 2 }, skills: ['창의성', '성실성'],   description: '책 한 권을 읽고 감상문을 써요.' },
];

const DEFAULT_FORM = {
  title: '', description: '', type: 'daily', selfCheck: false, repeatDaily: false,
  difficulty: 'easy', rewards: { exp: 100, gold: 100, diamond: 0 }, skills: [], active: true,
};

// ─────────────────────── ActiveQuestCard ─────────────────────
function ActiveQuestCard({ quest, studentCount, onDetail, onEdit, onDuplicate, onEnd }) {
  const diff = DIFF[quest.difficulty] || DIFF.easy;
  const isDaily = quest.type === 'daily';
  const checked = quest.checkedCount || 0;
  const pct = studentCount > 0 ? Math.round((checked / studentCount) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 hover:shadow-md transition-all overflow-hidden">
      <div className="p-4 pb-3">
        {/* 제목 */}
        <h3 className="font-extrabold text-slate-800 text-sm leading-tight mb-2">{quest.title}</h3>

        {/* 배지 */}
        <div className="flex flex-wrap gap-1 mb-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${isDaily ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
            {isDaily ? '일일퀘스트' : '주간퀘스트'}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${diff.cls}`}>{diff.label}</span>
          {quest.selfCheck   && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">자체체크</span>}
          {quest.repeatDaily && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">매일반복</span>}
        </div>

        {/* 보상 */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-3">
          {quest.rewards?.exp     > 0 && <span>⭐+{quest.rewards.exp}</span>}
          {quest.rewards?.gold    > 0 && <span>🪙+{quest.rewards.gold}</span>}
          {quest.rewards?.diamond > 0 && <span>💎+{quest.rewards.diamond}</span>}
        </div>

        {/* 능력치 */}
        {quest.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {quest.skills.map(skill => (
              <span key={skill}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border
                  ${SKILL_COLORS[skill] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {skill}+1
              </span>
            ))}
          </div>
        )}

        {/* 진행률 */}
        <div>
          <div className="flex justify-between text-[11px] font-bold mb-1">
            <span className={isDaily ? 'text-sky-600' : 'text-violet-600'}>
              {checked}명 / {studentCount}명
            </span>
            <span className="text-slate-500">{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500
                ${isDaily ? 'bg-sky-500' : 'bg-violet-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="px-4 pb-4 flex gap-1.5">
        <button onClick={onDetail}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-lg font-bold text-[11px] transition-colors">
          상세보기
        </button>
        <button onClick={onEdit}
          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px] transition-colors">
          수정
        </button>
        <button onClick={onDuplicate}
          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px] transition-colors">
          복제
        </button>
        <button onClick={onEnd}
          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-bold text-[11px] transition-colors border border-rose-200">
          종료
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── EndedQuestCard ──────────────────────
function EndedQuestCard({ quest, onReactivate, onDelete }) {
  const diff = DIFF[quest.difficulty] || DIFF.easy;
  const isDaily = quest.type === 'daily';
  const endedDate = quest.endedAt
    ? new Date(quest.endedAt.toDate()).toLocaleDateString('ko-KR')
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-100 opacity-75 overflow-hidden">
      {/* 종료 띠 */}
      <div className="px-4 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500">🔒 종료된 퀘스트</span>
        {endedDate && <span className="text-[10px] text-slate-400">{endedDate} 종료</span>}
      </div>

      <div className="p-4 pb-3">
        <h3 className="font-extrabold text-slate-600 text-sm leading-tight mb-2">{quest.title}</h3>

        <div className="flex flex-wrap gap-1 mb-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${isDaily ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
            {isDaily ? '일일퀘스트' : '주간퀘스트'}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${diff.cls}`}>{diff.label}</span>
          {quest.selfCheck && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-600">자체체크</span>}
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2">
          {quest.rewards?.exp     > 0 && <span>⭐+{quest.rewards.exp}</span>}
          {quest.rewards?.gold    > 0 && <span>🪙+{quest.rewards.gold}</span>}
          {quest.rewards?.diamond > 0 && <span>💎+{quest.rewards.diamond}</span>}
        </div>

        {quest.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {quest.skills.map(skill => (
              <span key={skill}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border opacity-70
                  ${SKILL_COLORS[skill] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {skill}+1
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-4 flex gap-2">
        <button onClick={onReactivate}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl font-bold text-xs transition-colors">
          ↺ 다시 활성화하기
        </button>
        <button onClick={onDelete}
          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl font-bold text-xs transition-colors border border-rose-200">
          삭제
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── QuestFormModal ──────────────────────
function QuestFormModal({ form, setForm, isEditing, onSubmit, onClose, onToggleSkill }) {
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const setReward = (key, val) => setForm(prev => ({
    ...prev, rewards: { ...prev.rewards, [key]: Number(val) || 0 },
  }));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 bg-indigo-600 text-white font-bold text-lg flex justify-between items-center shrink-0">
          <span>{isEditing ? '✏️ 퀘스트 수정' : '✨ 새 퀘스트 만들기'}</span>
          <button onClick={onClose} className="text-indigo-200 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">퀘스트 이름 *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="예: 아침 독서 10분" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">설명 (선택)</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none h-14"
              placeholder="퀘스트 내용을 간단히 설명해주세요" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">퀘스트 종류</label>
              <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                {[['daily', '일일'], ['weekly', '주간']].map(([val, label]) => (
                  <button key={val} onClick={() => set('type', val)}
                    className={`flex-1 py-2 text-xs font-bold transition-colors
                      ${form.type === val ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">난이도</label>
              <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
                {[['easy', '쉬움'], ['medium', '보통'], ['hard', '어려움']].map(([val, label]) => (
                  <button key={val} onClick={() => set('difficulty', val)}
                    className={`flex-1 py-2 text-[10px] font-bold transition-colors
                      ${form.difficulty === val ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="text-sm font-bold text-slate-700">학생 자체 체크</div>
              <div className="text-xs text-slate-500 mt-0.5">학생이 스스로 완료 체크를 할 수 있어요</div>
            </div>
            <button onClick={() => set('selfCheck', !form.selfCheck)}
              className={`w-12 h-6 rounded-full transition-colors relative
                ${form.selfCheck ? 'bg-teal-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                ${form.selfCheck ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {form.type === 'daily' && (
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border border-orange-200">
              <div>
                <div className="text-sm font-bold text-orange-800">매일 반복</div>
                <div className="text-xs text-orange-600 mt-0.5">자정에 초기화되고 다음 날 다시 활성화돼요</div>
              </div>
              <button onClick={() => set('repeatDaily', !form.repeatDaily)}
                className={`w-12 h-6 rounded-full transition-colors relative
                  ${form.repeatDaily ? 'bg-orange-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                  ${form.repeatDaily ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">보상</label>
            <div className="grid grid-cols-3 gap-2">
              {[['exp', '⭐ EXP'], ['gold', '🪙 골드'], ['diamond', '💎 다이아']].map(([key, label]) => (
                <div key={key}>
                  <div className="text-[10px] text-slate-500 font-semibold mb-1">{label}</div>
                  <input type="number" min="0" value={form.rewards[key]}
                    onChange={e => setReward(key, e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none focus:border-indigo-500" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">능력치 태그 (선택)</label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map(skill => (
                <button key={skill} onClick={() => onToggleSkill(skill)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                    ${form.skills.includes(skill)
                      ? (SKILL_COLORS[skill] || 'bg-slate-100 text-slate-600 border-slate-200')
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-400'}`}>
                  {skill} +1
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">
            취소
          </button>
          <button onClick={onSubmit}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">
            {isEditing ? '수정 완료' : '퀘스트 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── RecommendedSidebar ──────────────────
function RecommendedSidebar({ onSelect }) {
  return (
    <aside className="w-52 shrink-0 flex flex-col gap-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
          <h2 className="text-sm font-extrabold text-violet-700">✨ 추천 퀘스트</h2>
          <p className="text-[10px] text-violet-500 mt-0.5">추가하기로 바로 생성</p>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3 space-y-2.5">
          {RECOMMENDED.map((t, i) => {
            const diff = DIFF[t.difficulty] || DIFF.easy;
            return (
              <div key={i}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 transition-all">
                <div className="font-bold text-xs text-slate-800 mb-1.5 leading-tight">{t.title}</div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                    ${t.type === 'daily' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                    {t.type === 'daily' ? '일일' : '주간'}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${diff.cls}`}>{diff.label}</span>
                  {t.selfCheck && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700">자체체크</span>
                  )}
                </div>
                <div className="flex gap-1.5 text-[10px] font-bold text-slate-500 mb-2">
                  {t.rewards.exp     > 0 && <span>⭐{t.rewards.exp}</span>}
                  {t.rewards.gold    > 0 && <span>🪙{t.rewards.gold}</span>}
                  {t.rewards.diamond > 0 && <span>💎{t.rewards.diamond}</span>}
                </div>
                <button onClick={() => onSelect(t)}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors">
                  + 추가하기
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function QuestManage() {
  const [quests, setQuests]       = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mainTab, setMainTab]     = useState('active'); // 'active' | 'ended'
  const [filter, setFilter]       = useState('all');
  const [selectedQuestId, setSelectedQuestId] = useState(null);
  const [isFormOpen, setIsFormOpen]   = useState(false);
  const [editingQuestId, setEditingQuestId] = useState(null);
  const [form, setForm]           = useState(DEFAULT_FORM);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [studentsSnap, questsSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'quests')),
      ]);

      setStudentCount(studentsSnap.size);

      const list = questsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 각 퀘스트의 체크 완료 인원 가져오기
      const listWithStats = await Promise.all(
        list.map(async quest => {
          try {
            const snap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
            const checkedCount = snap.docs.filter(d => d.data().checked === true).length;
            return { ...quest, checkedCount };
          } catch {
            return { ...quest, checkedCount: 0 };
          }
        })
      );

      listWithStats.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setQuests(listWithStats);
    } catch (err) {
      console.error('데이터 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // 퀘스트 분류
  const activeQuests = quests.filter(q => q.active !== false);
  const endedQuests  = quests.filter(q => q.active === false);

  // ── 폼 열기 ──
  const openCreate = () => {
    setEditingQuestId(null);
    setForm(DEFAULT_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (quest) => {
    setEditingQuestId(quest.id);
    setForm({
      title:       quest.title,
      description: quest.description || '',
      type:        quest.type,
      selfCheck:   quest.selfCheck   || false,
      repeatDaily: quest.repeatDaily || false,
      difficulty:  quest.difficulty,
      rewards:     { ...quest.rewards },
      skills:      quest.skills || [],
      active:      quest.active,
    });
    setIsFormOpen(true);
  };

  const openFromTemplate = (template) => {
    setEditingQuestId(null);
    setForm({ ...DEFAULT_FORM, ...template, repeatDaily: false });
    setIsFormOpen(true);
  };

  // 종료된 퀘스트를 같은 내용으로 새로 생성
  const openReactivate = (quest) => {
    setEditingQuestId(null);
    setForm({
      title:       quest.title,
      description: quest.description || '',
      type:        quest.type,
      selfCheck:   quest.selfCheck   || false,
      repeatDaily: quest.repeatDaily || false,
      difficulty:  quest.difficulty  || 'easy',
      rewards:     { ...quest.rewards },
      skills:      quest.skills || [],
      active:      true,
    });
    setIsFormOpen(true);
  };

  // ── CRUD ──
  const submitForm = async () => {
    if (!form.title.trim()) return alert('퀘스트 이름을 입력해주세요.');
    setIsLoading(true);
    try {
      if (editingQuestId) {
        await updateDoc(doc(db, 'quests', editingQuestId), { ...form, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'quests'), { ...form, createdAt: serverTimestamp() });
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err) {
      console.error('저장 에러:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const endQuest = async (questId) => {
    if (!window.confirm('이 퀘스트를 종료할까요?\n종료된 퀘스트는 "종료된 퀘스트 보기"에서 다시 활성화할 수 있습니다.')) return;
    try {
      await updateDoc(doc(db, 'quests', questId), { active: false, endedAt: serverTimestamp() });
      setQuests(prev => prev.map(q => q.id === questId ? { ...q, active: false } : q));
    } catch (err) {
      console.error('종료 에러:', err);
    }
  };

  const duplicateQuest = async (quest) => {
    try {
      const { id, createdAt, updatedAt, endedAt, checkedCount, ...data } = quest;
      await addDoc(collection(db, 'quests'), {
        ...data, title: `${data.title} (복사)`, active: true, createdAt: serverTimestamp(),
      });
      fetchData();
    } catch (err) {
      console.error('복제 에러:', err);
    }
  };

  const deleteQuest = async (questId) => {
    if (!window.confirm('이 퀘스트를 완전히 삭제할까요? 복구할 수 없습니다.')) return;
    try {
      await deleteDoc(doc(db, 'quests', questId));
      setQuests(prev => prev.filter(q => q.id !== questId));
    } catch (err) {
      console.error('삭제 에러:', err);
    }
  };

  const toggleSkill = (skill) => {
    setForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  // 상세 페이지
  if (selectedQuestId) {
    return <QuestDetail questId={selectedQuestId} onBack={() => setSelectedQuestId(null)} />;
  }

  const filtered = activeQuests.filter(q => filter === 'all' || q.type === filter);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* 헤더 */}
      <div className="p-6 pb-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <img src={iconQuest} alt="퀘스트" className="w-12 h-12 object-contain drop-shadow-sm" />
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800">퀘스트 관리소</h1>
              <p className="text-slate-500 text-sm">학생들에게 줄 퀘스트를 만들고 관리합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 탭 전환 */}
            <div className="flex rounded-xl border-2 border-slate-200 overflow-hidden">
              <button
                onClick={() => setMainTab('active')}
                className={`px-4 py-2 text-sm font-bold transition-colors
                  ${mainTab === 'active' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                활성 퀘스트 ({activeQuests.length})
              </button>
              <button
                onClick={() => setMainTab('ended')}
                className={`px-4 py-2 text-sm font-bold transition-colors
                  ${mainTab === 'ended' ? 'bg-slate-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                종료된 퀘스트 ({endedQuests.length})
              </button>
            </div>
            <button onClick={openCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
              + 새 퀘스트 만들기
            </button>
          </div>
        </div>
      </div>

      {/* ── 활성 퀘스트 탭 ── */}
      {mainTab === 'active' && (
        <div className="flex gap-4 px-6 pb-6 flex-1">
          {/* 좌측: 추천 퀘스트 */}
          <RecommendedSidebar onSelect={openFromTemplate} />

          {/* 우측: 활성 퀘스트 목록 */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-2 mb-4 items-center">
              {[['all', '전체'], ['daily', '일일퀘스트'], ['weekly', '주간퀘스트']].map(([val, label]) => (
                <button key={val} onClick={() => setFilter(val)}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors
                    ${filter === val
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-white text-slate-600 hover:bg-indigo-50 border border-slate-200'}`}>
                  {label}
                </button>
              ))}
              <span className="ml-auto text-sm text-slate-400 font-medium">{filtered.length}개</span>
            </div>

            {isLoading ? (
              <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <div className="text-5xl mb-3">⚔️</div>
                <p className="font-bold text-lg text-slate-600">활성 퀘스트가 없습니다</p>
                <p className="text-sm mt-1">왼쪽 추천 퀘스트를 추가하거나 새 퀘스트를 만들어보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map(quest => (
                  <ActiveQuestCard
                    key={quest.id}
                    quest={quest}
                    studentCount={studentCount}
                    onDetail={() => setSelectedQuestId(quest.id)}
                    onEdit={() => openEdit(quest)}
                    onDuplicate={() => duplicateQuest(quest)}
                    onEnd={() => endQuest(quest.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 종료된 퀘스트 탭 ── */}
      {mainTab === 'ended' && (
        <div className="px-6 pb-6">
          {isLoading ? (
            <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
          ) : endedQuests.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <div className="text-5xl mb-3">🔒</div>
              <p className="font-bold text-lg text-slate-600">종료된 퀘스트가 없습니다</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-4 font-medium">
                종료된 퀘스트 {endedQuests.length}개 — "다시 활성화하기"를 누르면 같은 내용으로 새 퀘스트를 만들 수 있습니다.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {endedQuests.map(quest => (
                  <EndedQuestCard
                    key={quest.id}
                    quest={quest}
                    onReactivate={() => openReactivate(quest)}
                    onDelete={() => deleteQuest(quest.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {isFormOpen && (
        <QuestFormModal
          form={form}
          setForm={setForm}
          isEditing={!!editingQuestId}
          onSubmit={submitForm}
          onClose={() => setIsFormOpen(false)}
          onToggleSkill={toggleSkill}
        />
      )}
    </div>
  );
}

export default QuestManage;
