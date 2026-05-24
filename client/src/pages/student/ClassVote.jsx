import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const BAR_COLORS = ['bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500'];

export default function ClassVote({ studentCode }) {
  const [myInfo, setMyInfo] = useState(null);
  const [votes, setVotes]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
      if (!snap.empty) setMyInfo({ docId: snap.docs[0].id, ...snap.docs[0].data() });
    })();
  }, [studentCode]);

  useEffect(() => {
    if (!myInfo?.teacherUid) return;
    const q = query(
      collection(db, 'classVotes'),
      where('teacherUid', '==', myInfo.teacherUid),
      where('active', '==', true)
    );
    const unsub = onSnapshot(q, snap => {
      setVotes(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      setLoading(false);
    });
    return unsub;
  }, [myInfo?.teacherUid]);

  const handleVote = async (vote, optionIdx) => {
    if (!studentCode) return;
    const alreadyVoted = vote.options.some(o => o.voterIds?.includes(studentCode));
    if (alreadyVoted) return;
    const newOptions = vote.options.map((o, i) =>
      i === optionIdx ? { ...o, voterIds: [...(o.voterIds || []), studentCode] } : o
    );
    await updateDoc(doc(db, 'classVotes', vote.id), { options: newOptions });
  };

  const getTotal   = (vote) => vote.options.reduce((sum, o) => sum + (o.voterIds?.length || 0), 0);
  const hasVoted   = (vote) => vote.options.some(o => o.voterIds?.includes(studentCode));
  const myVoteIdx  = (vote) => vote.options.findIndex(o => o.voterIds?.includes(studentCode));

  if (loading) return (
    <div className="flex items-center justify-center h-full text-slate-400">불러오는 중...</div>
  );

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-extrabold text-slate-800 mb-6">📊 학급 투표</h1>

      {votes.length === 0 ? (
        <div className="text-center py-24 text-slate-400">
          <div className="text-5xl mb-4">🗳️</div>
          <div className="font-bold text-lg">진행 중인 투표가 없어요</div>
          <div className="text-sm mt-1">선생님이 투표를 만들면 여기에 표시됩니다</div>
        </div>
      ) : (
        <div className="space-y-5">
          {votes.map(vote => {
            const total  = getTotal(vote);
            const voted  = hasVoted(vote);
            const myIdx  = myVoteIdx(vote);

            return (
              <div key={vote.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <h3 className="font-extrabold text-slate-800 text-lg mb-4">{vote.title}</h3>

                <div className="space-y-3">
                  {vote.options.map((opt, i) => {
                    const count  = opt.voterIds?.length || 0;
                    const pct    = total > 0 ? Math.round(count / total * 100) : 0;
                    const isMyVote = myIdx === i;

                    return (
                      <div key={i}>
                        {!voted ? (
                          <button
                            onClick={() => handleVote(vote, i)}
                            className="w-full text-left px-4 py-3 rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all font-medium text-slate-700 active:scale-[0.98]"
                          >
                            {opt.text}
                          </button>
                        ) : (
                          <div className={`rounded-xl overflow-hidden border-2 ${isMyVote ? 'border-indigo-400' : 'border-slate-100'}`}>
                            <div className="relative px-4 py-3">
                              <div
                                className={`absolute inset-y-0 left-0 ${BAR_COLORS[i % BAR_COLORS.length]} opacity-[0.12] transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                              />
                              <div className="relative flex items-center justify-between">
                                <span className={`font-bold ${isMyVote ? 'text-indigo-700' : 'text-slate-700'}`}>
                                  {isMyVote && <span className="mr-1 text-indigo-500">✓</span>}
                                  {opt.text}
                                </span>
                                <span className={`font-extrabold text-sm ${isMyVote ? 'text-indigo-600' : 'text-slate-500'}`}>
                                  {pct}% ({count}명)
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 text-xs text-slate-400 text-right">
                  {voted ? `총 ${total}명 참여` : '선택지를 눌러 투표하세요'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
