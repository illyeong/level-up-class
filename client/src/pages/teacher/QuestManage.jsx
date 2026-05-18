import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
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
  { title: '아침 독서 10분',    type: 'daily',  difficulty: 'easy',   selfCheck: true,  rewards: { exp: 50,  gold: 50,  diamond: 0 }, skills: ['성실성'],             description: '아침 시간에 10분 동안 책을 읽어요.' },
  { title: '수업 집중하기',     type: 'daily',  difficulty: 'easy',   selfCheck: false, rewards: { exp: 100, gold: 100, diamond: 0 }, skills: ['성실성', '자기관리'],  description: '수업 시간 동안 스스로 집중해요.' },
  { title: '숙제 완료하기',     type: 'daily',  difficulty: 'easy',   selfCheck: true,  rewards: { exp: 80,  gold: 80,  diamond: 0 }, skills: ['성실성'],             description: '오늘의 숙제를 모두 완료해요.' },
  { title: '급식 잔반 없애기',  type: 'daily',  difficulty: 'easy',   selfCheck: true,  rewards: { exp: 50,  gold: 30,  diamond: 0 }, skills: ['인성'],              description: '음식을 남기지 않고 다 먹어요.' },
  { title: '친구 도와주기',     type: 'weekly', difficulty: 'medium', selfCheck: false, rewards: { exp: 200, gold: 200, diamond: 1 }, skills: ['인성', '협동심'],     description: '이번 주에 어려운 친구를 도와줘요.' },
  { title: '발표 1회 이상 하기', type: 'weekly', difficulty: 'medium', selfCheck: false, rewards: { exp: 150, gold: 150, diamond: 1 }, skills: ['의사소통'],          description: '이번 주 수업에서 1번 이상 발표해요.' },
  { title: '모둠 활동 참여하기', type: 'weekly', difficulty: 'medium', selfCheck: true,  rewards: { exp: 180, gold: 150, diamond: 1 }, skills: ['협동심', '의사소통'], description: '모둠 활동에 적극적으로 참여해요.' },
  { title: '독서 감상문 쓰기',   type: 'weekly', difficulty: 'hard',   selfCheck: false, rewards: { exp: 300, gold: 250, diamond: 2 }, skills: ['창의성', '성실성'],   description: '책 한 권을 읽고 감상문을 써요.' },
];

const DEFAULT_FORM = {
  title: '', description: '', type: 'daily', selfCheck: false,
  difficulty: 'easy', rewards: { exp: 100, gold: 100, diamond: 0 }, skills: [], active: true,
};

// ─────────────────────── QuestCard ───────────────────────────
function QuestCard({ quest, onDetail, onEdit, onDuplicate, onDelete, onToggleActive }) {
  const diff = DIFF[quest.difficulty] || DIFF.easy;
  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 transition-all hover:shadow-md overflow-hidden
      ${quest.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-extrabold text-slate-800 text-base leading-tight">{quest.title}</h3>
          <button
            onClick={onToggleActive}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative
              ${quest.active ? 'bg-indigo-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
              ${quest.active ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full
            ${quest.type === 'daily' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
            {quest.type === 'daily' ? '일일퀘스트' : '주간퀘스트'}
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${diff.cls}`}>{diff.label}</span>
          {quest.selfCheck && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-100 text-teal-700">자체체크</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm font-bold text-slate-600 mb-3">
          {quest.rewards?.exp  > 0 && <span>⭐ +{quest.rewards.exp} EXP</span>}
          {quest.rewards?.gold > 0 && <span>🪙 +{quest.rewards.gold} G</span>}
          {quest.rewards?.diamond > 0 && <span>💎 +{quest.rewards.diamond}</span>}
        </div>

        {quest.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {quest.skills.map(skill => (
              <span key={skill}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border
                  ${SKILL_COLORS[skill] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {skill} +1
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-4 flex gap-2">
        <button onClick={onDetail}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl font-bold text-xs transition-colors">
          상세보기
        </button>
        <button onClick={onEdit}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors">
          수정
        </button>
        <button onClick={onDuplicate}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors">
          복제
        </button>
        <button onClick={onDelete}
          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl font-bold text-xs transition-colors">
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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">퀘스트 이름 *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              placeholder="예: 아침 독서 10분" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">설명 (선택)</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none h-16"
              placeholder="퀘스트 내용을 간단히 설명해주세요" />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
                    className={`flex-1 py-2 text-[11px] font-bold transition-colors
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

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">보상</label>
            <div className="grid grid-cols-3 gap-3">
              {[['exp', '⭐ EXP'], ['gold', '🪙 골드'], ['diamond', '💎 다이아']].map(([key, label]) => (
                <div key={key}>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">{label}</div>
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

        <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0">
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

// ─────────────────────── TemplateModal ───────────────────────
function TemplateModal({ templates, onSelect, onClose }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const filtered = templates.filter(t => typeFilter === 'all' || t.type === typeFilter);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-5 bg-violet-600 text-white font-bold text-lg flex justify-between items-center shrink-0">
          <span>✨ 추천 퀘스트 선택</span>
          <button onClick={onClose} className="text-violet-200 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-4 border-b border-slate-100 flex gap-2 shrink-0">
          {[['all', '전체'], ['daily', '일일퀘스트'], ['weekly', '주간퀘스트']].map(([val, label]) => (
            <button key={val} onClick={() => setTypeFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
                ${typeFilter === val ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((t, i) => {
            const diff = DIFF[t.difficulty] || DIFF.easy;
            return (
              <button key={i} onClick={() => onSelect(t)}
                className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all group">
                <div className="font-bold text-slate-800 text-sm mb-2 group-hover:text-violet-700">{t.title}</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full
                    ${t.type === 'daily' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                    {t.type === 'daily' ? '일일' : '주간'}
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${diff.cls}`}>{diff.label}</span>
                  {t.selfCheck && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">자체체크</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mb-2">{t.description}</div>
                <div className="flex gap-2 text-xs font-bold text-slate-600">
                  {t.rewards.exp     > 0 && <span>⭐+{t.rewards.exp}</span>}
                  {t.rewards.gold    > 0 && <span>🪙+{t.rewards.gold}</span>}
                  {t.rewards.diamond > 0 && <span>💎+{t.rewards.diamond}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Main ─────────────────────────────────
function QuestManage() {
  const [quests, setQuests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedQuestId, setSelectedQuestId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [editingQuestId, setEditingQuestId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const fetchQuests = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'quests'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setQuests(list);
    } catch (err) {
      console.error('퀘스트 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchQuests(); }, []);

  const openCreate = () => {
    setEditingQuestId(null);
    setForm(DEFAULT_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (quest) => {
    setEditingQuestId(quest.id);
    setForm({
      title: quest.title,
      description: quest.description || '',
      type: quest.type,
      selfCheck: quest.selfCheck,
      difficulty: quest.difficulty,
      rewards: { ...quest.rewards },
      skills: quest.skills || [],
      active: quest.active,
    });
    setIsFormOpen(true);
  };

  const openFromTemplate = (template) => {
    setEditingQuestId(null);
    setForm({ ...DEFAULT_FORM, ...template });
    setIsTemplateOpen(false);
    setIsFormOpen(true);
  };

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
      fetchQuests();
    } catch (err) {
      console.error('퀘스트 저장 에러:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleActive = async (quest) => {
    try {
      await updateDoc(doc(db, 'quests', quest.id), { active: !quest.active });
      setQuests(prev => prev.map(q => q.id === quest.id ? { ...q, active: !q.active } : q));
    } catch (err) {
      console.error('활성화 토글 에러:', err);
    }
  };

  const duplicateQuest = async (quest) => {
    try {
      const { id, createdAt, updatedAt, ...data } = quest;
      await addDoc(collection(db, 'quests'), {
        ...data, title: `${data.title} (복사)`, createdAt: serverTimestamp(),
      });
      fetchQuests();
    } catch (err) {
      console.error('복제 에러:', err);
    }
  };

  const deleteQuest = async (questId) => {
    if (!window.confirm('이 퀘스트를 삭제할까요?')) return;
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

  if (selectedQuestId) {
    return <QuestDetail questId={selectedQuestId} onBack={() => setSelectedQuestId(null)} />;
  }

  const filtered = quests.filter(q => filter === 'all' || q.type === filter);

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800">⚔️ 퀘스트 관리소</h1>
          <p className="text-slate-500 mt-1 text-sm">학생들에게 줄 퀘스트를 만들고 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsTemplateOpen(true)}
            className="bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors">
            ✨ 추천 퀘스트
          </button>
          <button onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
            + 새 퀘스트 만들기
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5 items-center">
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

      {/* Quest grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <div className="text-5xl mb-3">⚔️</div>
          <p className="font-bold text-lg text-slate-600">퀘스트가 없습니다</p>
          <p className="text-sm mt-1">새 퀘스트를 만들거나 추천 퀘스트를 불러와보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(quest => (
            <QuestCard
              key={quest.id}
              quest={quest}
              onDetail={() => setSelectedQuestId(quest.id)}
              onEdit={() => openEdit(quest)}
              onDuplicate={() => duplicateQuest(quest)}
              onDelete={() => deleteQuest(quest.id)}
              onToggleActive={() => toggleActive(quest)}
            />
          ))}
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

      {isTemplateOpen && (
        <TemplateModal
          templates={RECOMMENDED}
          onSelect={openFromTemplate}
          onClose={() => setIsTemplateOpen(false)}
        />
      )}
    </div>
  );
}

export default QuestManage;
