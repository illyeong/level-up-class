import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc,
  serverTimestamp, query, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import iconQuest from '../../assets/images/icon-quest.png';
import QuestDetail from './QuestDetail';
import { applyExpDelta } from '../../utils/leveling';

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

// 보상 기준: easy → gold 50 / exp 50 / diamond 25
//            medium → gold 100 / exp 80 / diamond 50
//            hard   → gold 200 / exp 150 / diamond 100  (diamond = gold/2)
const RECOMMENDED = [
  {
    title: '지각하지 않고 등교하기',
    type: 'daily', difficulty: 'easy', selfCheck: true,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['성실성'],
    description: '제 시간에 등교해요.',
  },
  {
    title: '아침시간에 조용히 하기',
    type: 'daily', difficulty: 'easy', selfCheck: true,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['자기관리'],
    description: '아침 자습 시간에 조용히 준비해요.',
  },
  {
    title: '내 책상 위와 서랍 안 정리정돈하기',
    type: 'daily', difficulty: 'easy', selfCheck: false,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['자기관리', '성실성'],
    description: '책상 위와 서랍 안을 깔끔하게 정리해요.',
  },
  {
    title: '수업 시간에 자신감 있게 손들고 발표 1회 하기',
    type: 'daily', difficulty: 'medium', selfCheck: true,
    rewards: { exp: 80, gold: 100, diamond: 50 },
    skills: ['의사소통'],
    description: '수업 중 자신 있게 손을 들고 한 번 이상 발표해요.',
  },
  {
    title: '하루종일 비속어 쓰지 않고 고운말 사용하기',
    type: 'daily', difficulty: 'easy', selfCheck: true,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['인성'],
    description: '하루 동안 친구와 선생님께 바른말 고운말을 사용해요.',
  },
  {
    title: '싸우지 않기 (말싸움 포함)',
    type: 'daily', difficulty: 'easy', selfCheck: true,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['인성', '협동심'],
    description: '친구와 말다툼이나 몸싸움 없이 하루를 보내요.',
  },
  {
    title: '금지어 말하지 않기',
    type: 'daily', difficulty: 'easy', selfCheck: true,
    rewards: { exp: 50, gold: 50, diamond: 25 },
    skills: ['인성'],
    description: '「제가 안 했는데요」「쟤가 먼저 했는데요」「왜 저만 혼내요」「왜 저한테만 그래요」「꼭 해야 해요?」 같은 말을 하지 않아요.',
  },
  {
    title: '일주일 동안 선생님 잔소리 듣지 않기',
    type: 'weekly', difficulty: 'hard', selfCheck: false,
    rewards: { exp: 150, gold: 200, diamond: 100 },
    skills: ['자기관리', '성실성'],
    description: '이번 주 내내 선생님의 잔소리를 듣지 않도록 스스로 행동을 조절해요.',
  },
];

const DEFAULT_FORM = {
  title: '', description: '', type: 'daily', selfCheck: false,
  repeatDaily: true, repeatWeekly: true,
  difficulty: 'easy', rewards: { exp: 100, gold: 100, diamond: 0 }, skills: [], active: true,
  shareToCommunity: false, importedFromShared: false, sharedSourceId: null,
};

const buildQuestPayload = (form) => ({
  title: String(form.title || '').trim(),
  description: form.description || '',
  type: form.type === 'weekly' ? 'weekly' : 'daily',
  selfCheck: !!form.selfCheck,
  repeatDaily: form.type === 'daily' ? !!form.repeatDaily : false,
  repeatWeekly: form.type === 'weekly' ? !!form.repeatWeekly : false,
  difficulty: form.difficulty || 'easy',
  rewards: {
    exp: Number(form?.rewards?.exp) || 0,
    gold: Number(form?.rewards?.gold) || 0,
    diamond: Number(form?.rewards?.diamond) || 0,
  },
  skills: Array.isArray(form.skills) ? form.skills : [],
  active: form.active !== false,
  importedFromShared: !!form.importedFromShared,
  sharedSourceId: form.sharedSourceId || null,
  shareToCommunity: form.importedFromShared ? false : !!form.shareToCommunity,
});

const buildSharedQuestPayload = (questPayload, options = {}) => ({
  ...questPayload,
  sourceQuestId: options.sourceQuestId || null,
  sourceTeacherUid: options.sourceTeacherUid || null,
  sourceClassId: options.sourceClassId || null,
  sourceLabel: options.sourceLabel || '',
  sharedAt: options.sharedAt || serverTimestamp(),
  updatedAt: serverTimestamp(),
});

// ─────────────────────── ActiveQuestCard ─────────────────────
function ActiveQuestCard({ quest, studentCount, onDetail, onEdit, onDuplicate, onEnd, onBulkApprove }) {
  const diff = DIFF[quest.difficulty] || DIFF.easy;
  const isDaily = quest.type === 'daily';
  const checked = quest.checkedCount || 0;
  const pct = studentCount > 0 ? Math.round((checked / studentCount) * 100) : 0;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 hover:shadow-md transition-all overflow-hidden
      ${isDaily ? 'border-sky-300' : 'border-violet-300'}`}>
      {/* 상단 컬러 띠 */}
      <div className={`px-4 py-1.5 text-white text-[11px] font-extrabold
        ${isDaily ? 'bg-sky-500' : 'bg-violet-500'}`}>
        {isDaily ? '📅 일일퀘스트' : '📆 주간퀘스트'}
      </div>
      <div className="p-4 pb-3">
        {/* 제목 */}
        <h3 className="font-extrabold text-slate-800 text-sm leading-tight mb-2">{quest.title}</h3>

        {/* 배지 */}
        <div className="flex flex-wrap gap-1 mb-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${diff.cls}`}>{diff.label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${diff.cls}`}>{diff.label}</span>
          {quest.selfCheck    && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">자체체크</span>}
          {quest.repeatDaily  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">매일반복</span>}
          {quest.repeatWeekly && quest.type === 'weekly' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">매주반복</span>}
        </div>

        {/* 보상 */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-3">
          {quest.rewards?.exp     > 0 && <span>⭐+{quest.rewards.exp}</span>}
          {quest.rewards?.gold    > 0 && <span>🪙+{quest.rewards.gold}</span>}
          {quest.rewards?.diamond > 0 && <span>💎+{quest.rewards.diamond}</span>}
        </div>

        {quest.skills?.length > 0 && false && (
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
      <div className="px-4 pb-4 space-y-1.5">
        {!quest.selfCheck && (
          <button onClick={onBulkApprove}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg font-bold text-[11px] transition-colors">
            ✅ 일괄 승인 (전체 보상 지급)
          </button>
        )}
        <div className="flex gap-1.5">
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

          {form.type === 'weekly' && (
            <div className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-200">
              <div>
                <div className="text-sm font-bold text-violet-800">매주 반복</div>
                <div className="text-xs text-violet-600 mt-0.5">매주 월요일 자동 초기화되고 다시 활성화돼요</div>
              </div>
              <button onClick={() => set('repeatWeekly', !form.repeatWeekly)}
                className={`w-12 h-6 rounded-full transition-colors relative
                  ${form.repeatWeekly ? 'bg-violet-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                  ${form.repeatWeekly ? 'left-7' : 'left-1'}`} />
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
function RecommendedSidebar({ onSelect, templates }) {
  return (
    <aside className="w-52 shrink-0 flex flex-col gap-3">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
          <h2 className="text-sm font-extrabold text-violet-700">✨ 추천 퀘스트</h2>
          <p className="text-[10px] text-violet-500 mt-0.5">추가하기로 바로 생성</p>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-3 space-y-2.5">
          {(templates || RECOMMENDED).map((t, i) => {
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
function QuestManage({ selectedClass }) {
  const [quests, setQuests]       = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mainTab, setMainTab]     = useState('active');
  const [recommended, setRecommended] = useState(RECOMMENDED);
  const [filter, setFilter]       = useState('all');
  const [selectedQuestId, setSelectedQuestId] = useState(null);
  const [isFormOpen, setIsFormOpen]   = useState(false);
  const [editingQuestId, setEditingQuestId] = useState(null);
  const [form, setForm]           = useState(DEFAULT_FORM);
  const [toast, setToast]         = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showConfirm = (message, onConfirm) => setConfirmState({ message, onConfirm });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [studentsSnap, questsSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'quests')),
      ]);

      // teacherUid로 필터링 (없으면 전체, admin_master_001은 null 퀘스트 포함)
      const tid = selectedClass?.teacherUid;
      const allStudentDocs = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const classStudents  = tid ? allStudentDocs.filter(s => s.teacherUid === tid) : allStudentDocs;
      setStudentCount(classStudents.length);
      let list = questsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (tid) {
        list = list.filter(q => q.teacherUid === tid || (!q.teacherUid && tid === 'admin_master_001'));
      }

      // 각 퀘스트의 체크 완료 인원 가져오기
      const listWithStats = await Promise.all(
        list.map(async quest => {
          try {
            const snap = await getDocs(collection(db, 'quests', quest.id, 'completions'));
            const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
            const checkedCount = snap.docs.filter(d => {
              const data = d.data();
              if (data.checked !== true) return false;
              if (!quest.repeatDaily) return true; // 반복 아닌 퀘스트는 날짜 무관
              const ts = data.checkedAt;
              const checkedAt = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
              return !checkedAt || checkedAt >= todayMidnight; // 오늘 체크한 것만 카운트
            }).length;
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

  useEffect(() => {
    fetchData();
    // Firebase에서 추천 퀘스트 로드
    getDoc(doc(db, 'systemConfig', 'questTemplates'))
      .then(snap => { if (snap.exists()) setRecommended(snap.data().templates); })
      .catch(() => {});
  }, []);

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
    setForm({
      ...DEFAULT_FORM,
      ...template,
      repeatDaily:  template.type === 'daily'  ? true : false,
      repeatWeekly: template.type === 'weekly' ? true : false,
    });
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
    if (!form.title.trim()) return showToast('퀘스트 이름을 입력해주세요.', 'error');
    setIsLoading(true);
    try {
      if (editingQuestId) {
        await updateDoc(doc(db, 'quests', editingQuestId), { ...form, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'quests'), {
          ...form,
          teacherUid: selectedClass?.teacherUid || null,
          classId:    selectedClass?.id          || null,
          createdAt:  serverTimestamp(),
        });
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err) {
      console.error('저장 에러:', err);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const endQuest = (questId) => {
    showConfirm('이 퀘스트를 종료할까요?\n종료된 퀘스트는 "종료된 퀘스트 보기"에서 다시 활성화할 수 있습니다.', async () => {
      try {
        await updateDoc(doc(db, 'quests', questId), { active: false, endedAt: serverTimestamp() });
        setQuests(prev => prev.map(q => q.id === questId ? { ...q, active: false } : q));
      } catch (err) {
        console.error('종료 에러:', err);
      }
    });
  };

  const duplicateQuest = async (quest) => {
    try {
      const { id, createdAt, updatedAt, endedAt, checkedCount, ...data } = quest;
      await addDoc(collection(db, 'quests'), {
        ...data, title: `${data.title} (복사)`, active: true,
        teacherUid: selectedClass?.teacherUid || data.teacherUid || null,
        classId:    selectedClass?.id          || data.classId    || null,
        createdAt:  serverTimestamp(),
      });
      fetchData();
    } catch (err) {
      console.error('복제 에러:', err);
    }
  };

  const deleteQuest = (questId) => {
    showConfirm('이 퀘스트를 완전히 삭제할까요? 복구할 수 없습니다.', async () => {
      try {
        await deleteDoc(doc(db, 'quests', questId));
        setQuests(prev => prev.filter(q => q.id !== questId));
      } catch (err) {
        console.error('삭제 에러:', err);
      }
    });
  };

  // 일괄 승인: 교사 승인 퀘스트(selfCheck=false)의 미보상 학생 전체에게 즉시 보상 지급
  const bulkApproveQuest = (quest) => {
    showConfirm(`"${quest.title}"\n보상을 아직 받지 못한 학생 전체에게 지급할까요?`, async () => {
      try {
        const [studentsSnap, completionsSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'quests', quest.id, 'completions')),
        ]);
        const allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const questTid = selectedClass?.teacherUid;
        const students = questTid ? allStudents.filter(s => s.teacherUid === questTid) : allStudents;
        const rewardedIds = new Set(
          completionsSnap.docs.filter(d => d.data().rewarded).map(d => d.id)
        );
        const targets = students.filter(s => !rewardedIds.has(s.id));

        if (targets.length === 0) return showToast('이미 모든 학생에게 보상을 지급했습니다.', 'error');

        const batch = writeBatch(db);
        targets.forEach(student => {
          const nextProgress = applyExpDelta(student.level ?? 1, student.exp ?? 0, quest.rewards?.exp || 0);
          batch.update(doc(db, 'students', student.id), {
            gold:     (student.gold     || 0) + (quest.rewards?.gold    || 0),
            diamonds: (student.diamonds || 0) + (quest.rewards?.diamond || 0),
            level:    nextProgress.level,
            exp:      nextProgress.exp,
            maxExp:   nextProgress.maxExp,
          });
          batch.set(doc(db, 'quests', quest.id, 'completions', student.id), {
            checked:    true,
            checkedAt:  serverTimestamp(),
            rewarded:   true,
            rewardedAt: serverTimestamp(),
            rewardedBy: 'teacher_bulk',
          }, { merge: true });
        });
        await batch.commit();
        showToast(`${targets.length}명에게 보상 지급 완료!`);
        fetchData();
      } catch (err) {
        console.error('일괄 승인 에러:', err);
        showToast('일괄 승인 중 오류가 발생했습니다.', 'error');
      }
    });
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
          <RecommendedSidebar onSelect={openFromTemplate} templates={recommended} />

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
              <div className="flex items-center justify-center gap-2.5 py-20">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
              </div>
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
                    onBulkApprove={() => bulkApproveQuest(quest)}
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
            <div className="flex items-center justify-center gap-2.5 py-20">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-400 font-medium">불러오는 중...</span>
            </div>
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

      {/* 퀘스트 상세 팝업 모달 */}
      {selectedQuestId && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setSelectedQuestId(null); }}
        >
          <div className="bg-slate-100 rounded-2xl w-full max-w-6xl h-[90vh] overflow-y-auto relative shadow-2xl">
            {/* 닫기 버튼 */}
            <button
              onClick={() => setSelectedQuestId(null)}
              className="sticky top-4 float-right mr-4 z-10 bg-white hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-full w-9 h-9 flex items-center justify-center shadow-md font-bold text-lg transition-colors border border-slate-200">
              ✕
            </button>
            <QuestDetail
              questId={selectedQuestId}
              onBack={() => setSelectedQuestId(null)}
              isModal
            />
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl font-bold text-sm shadow-2xl pointer-events-none
          ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
          style={{ whiteSpace: 'nowrap' }}>
          {toast.message}
        </div>
      )}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmState(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="text-slate-700 font-bold text-sm mb-5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmState(null)}
                className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-sm hover:bg-slate-50">취소</button>
              <button onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestManage;
