import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const DEFAULT_DUNGEONS = [
  { id:  0, name: '슬라임 동굴',    desc: '풀숲 입구 동굴에 슬라임들이 가득하다. 모험의 시작.',       level:  1, pos:{ x:10, y:63 }, reward:'🪙 50G · ⭐ 30EXP' },
  { id:  1, name: '푸른 숲 길',     desc: '나뭇잎 사이로 고블린들이 숨어 기습을 노린다.',            level:  3, pos:{ x:14, y:51 }, reward:'🪙 80G · ⭐ 50EXP' },
  { id:  2, name: '독버섯 지대',    desc: '독성 포자를 뿜는 버섯들과 독충들의 서식지.',              level:  5, pos:{ x:13, y:40 }, reward:'🪙 110G · ⭐ 70EXP' },
  { id:  3, name: '고목 신전',      desc: '수백 년 된 거목 아래 봉인된 고대 신전. 나무 정령이 지킨다.',level:  7, pos:{ x:24, y:77 }, reward:'🪙 140G · ⭐ 90EXP' },
  { id:  4, name: '어둠의 숲 심부', desc: '빛이 닿지 않는 숲 깊은 곳. 타락한 정령왕이 기다린다.',   level:  9, pos:{ x:27, y:69 }, reward:'🪙 170G · ⭐ 110EXP' },
  { id:  5, name: '눈보라 입구',    desc: '갑자기 시작된 폭설. 길을 잃은 얼음 괴물들이 돌아다닌다.', level: 11, pos:{ x:30, y:63 }, reward:'🪙 200G · ⭐ 130EXP' },
  { id:  6, name: '서리 협곡',      desc: '뼈를 에는 칼바람이 부는 협곡. 냉기 정령이 지킨다.',      level: 13, pos:{ x:32, y:55 }, reward:'🪙 230G · ⭐ 150EXP' },
  { id:  7, name: '빙하 요새',      desc: '거대한 빙하 위에 세워진 요새. 얼음 기사단이 주둔한다.',   level: 15, pos:{ x:34, y:47 }, reward:'🪙 260G · ⭐ 170EXP' },
  { id:  8, name: '안개 늪',        desc: '짙은 안개로 가득한 늪. 독개구리와 늪 정령이 출몰한다.',   level: 17, pos:{ x:35, y:39 }, reward:'🪙 300G · ⭐ 190EXP' },
  { id:  9, name: '독늪 지대',      desc: '독성 늪물이 흐르는 위험 지역. 발을 잘못 디디면 끝이다.',  level: 19, pos:{ x:38, y:30 }, reward:'🪙 340G · 💎 1 · ⭐ 210EXP' },
  { id: 10, name: '늪의 신전',      desc: '늪 한가운데 솟아오른 고대 신전. 저주받은 사제가 봉인됐다.', level: 21, pos:{ x:41, y:22 }, reward:'🪙 380G · 💎 2 · ⭐ 230EXP' },
  { id: 11, name: '수렁 지하 통로', desc: '지하로 이어지는 늪의 통로. 거대 진흙 골렘이 지킨다.',     level: 23, pos:{ x:44, y:15 }, reward:'🪙 420G · 💎 2 · ⭐ 250EXP' },
  { id: 12, name: '독늪 왕의 영지', desc: '늪지대를 지배하는 거대 개구리 왕의 본거지.',              level: 25, pos:{ x:53, y:68 }, reward:'🪙 460G · 💎 3 · ⭐ 280EXP' },
  { id: 13, name: '어둠의 늪 심부', desc: '빛이 없는 늪의 가장 깊은 곳. 최강의 늪 괴물이 기다린다.',level: 27, pos:{ x:57, y:60 }, reward:'🪙 500G · 💎 3 · ⭐ 310EXP' },
  { id: 14, name: '뜨거운 모래밭',  desc: '뜨거운 열기가 가득한 사막 입구. 모래 도마뱀이 도사린다.', level: 29, pos:{ x:60, y:52 }, reward:'🪙 540G · 💎 4 · ⭐ 340EXP' },
  { id: 15, name: '모래 폭풍 지대', desc: '쉼없이 몰아치는 모래 폭풍. 방향 감각을 잃으면 끝이다.',   level: 31, pos:{ x:63, y:44 }, reward:'🪙 580G · 💎 4 · ⭐ 370EXP' },
  { id: 16, name: '선인장 미로',    desc: '독침을 쏘는 선인장 몬스터들의 미로 지대.',                level: 33, pos:{ x:67, y:37 }, reward:'🪙 620G · 💎 5 · ⭐ 400EXP' },
  { id: 17, name: '파라오 무덤',    desc: '저주받은 파라오가 영원히 잠든 거대 무덤.',                level: 35, pos:{ x:67, y:28 }, reward:'🪙 660G · 💎 5 · ⭐ 430EXP' },
  { id: 18, name: '사막 신전',      desc: '모래 속에 묻힌 고대 신전. 미라 군단이 봉인을 지킨다.',    level: 37, pos:{ x:71, y:53 }, reward:'🪙 700G · 💎 6 · ⭐ 460EXP' },
  { id: 19, name: '사막 왕의 능',   desc: '사막을 지배했던 왕의 거대한 능. 최강의 미라 왕이 기다린다.', level: 39, pos:{ x:75, y:46 }, reward:'🪙 740G · 💎 6 · ⭐ 490EXP' },
  { id: 20, name: '불꽃 협곡',      desc: '화염이 치솟는 협곡. 불꽃 도마뱀 군단이 지킨다.',          level: 41, pos:{ x:77, y:40 }, reward:'🪙 780G · 💎 7 · ⭐ 520EXP' },
  { id: 21, name: '용암 동굴',      desc: '마그마가 흐르는 화산 내부. 용암 골렘들이 순찰한다.',       level: 43, pos:{ x:80, y:34 }, reward:'🪙 820G · 💎 7 · ⭐ 550EXP' },
  { id: 22, name: '화산 사원',      desc: '불의 신에게 바쳐진 고대 사원. 불꽃 사제들이 지킨다.',      level: 45, pos:{ x:78, y:28 }, reward:'🪙 860G · 💎 8 · ⭐ 580EXP' },
  { id: 23, name: '용의 둥지',      desc: '화산 정상에 둥지를 튼 고룡. 전설의 용이 기다린다.',        level: 48, pos:{ x:84, y:24 }, reward:'🪙 920G · 💎 9 · ⭐ 620EXP' },
  { id: 24, name: '마왕 성채',      desc: '세계를 지배하려는 마왕의 최후 요새. 모든 용사의 종착지.',   level: 52, pos:{ x:85, y:17 }, reward:'🪙 1200G · 💎 15 · ⭐ 800EXP' },
];

export default function DungeonMapEditor() {
  const [dungeons, setDungeons] = useState(DEFAULT_DUNGEONS);
  const [dragging, setDragging] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [mode, setMode]         = useState('edit'); // 'edit' | 'preview'
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'dungeons'));
        if (snap.exists() && snap.data().list?.length > 0) {
          const saved = snap.data().list;
          // 이름 변경됐으면 이름·설명 업데이트, 위치/active/이미지는 유지
          const needsUpdate = saved[0]?.name !== DEFAULT_DUNGEONS[0].name;
          if (needsUpdate) {
            const merged = DEFAULT_DUNGEONS.map(d => {
              const s = saved.find(x => x.id === d.id);
              return s ? { ...d, pos: s.pos, active: s.active, monsterImage: s.monsterImage, monsters: s.monsters } : d;
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

  // 마우스 드래그
  const onMouseDown = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const d = dungeons.find(d => d.id === id);
    setDragging({ id, startX: e.clientX, startY: e.clientY, origX: d.pos.x, origY: d.pos.y });
    setSelected(id);
  };

  const onMouseMove = (e) => {
    if (!dragging || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.startX) / rect.width)  * 100;
    const dy = ((e.clientY - dragging.startY) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, dragging.origX + dx));
    const newY = Math.max(0, Math.min(100, dragging.origY + dy));
    setDungeons(prev => prev.map(d =>
      d.id === dragging.id ? { ...d, pos: { x: parseFloat(newX.toFixed(1)), y: parseFloat(newY.toFixed(1)) } } : d
    ));
  };

  const onMouseUp = () => setDragging(null);

  // 터치 지원
  const onTouchStart = (e, id) => {
    e.stopPropagation();
    const t = e.touches[0];
    const d = dungeons.find(d => d.id === id);
    setDragging({ id, startX: t.clientX, startY: t.clientY, origX: d.pos.x, origY: d.pos.y });
    setSelected(id);
  };

  const onTouchMove = (e) => {
    if (!dragging || !mapRef.current) return;
    const t = e.touches[0];
    const rect = mapRef.current.getBoundingClientRect();
    const dx = ((t.clientX - dragging.startX) / rect.width)  * 100;
    const dy = ((t.clientY - dragging.startY) / rect.height) * 100;
    const newX = Math.max(0, Math.min(100, dragging.origX + dx));
    const newY = Math.max(0, Math.min(100, dragging.origY + dy));
    setDungeons(prev => prev.map(d =>
      d.id === dragging.id ? { ...d, pos: { x: parseFloat(newX.toFixed(1)), y: parseFloat(newY.toFixed(1)) } } : d
    ));
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'dungeons'), { list: dungeons });
      setSaved(true);
      setMode('preview'); // 저장 후 미리보기로 전환
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert('저장 실패'); }
    finally { setSaving(false); }
  };

  // 미리보기용 순차 상태 계산 (첫 active = current, 나머지 = locked)
  const getPreviewState = (dungeon) => {
    const isActive = dungeon.active !== false;
    if (!isActive) return 'locked';
    const prevActive = dungeons.filter(d => d.active !== false && d.id < dungeon.id);
    return prevActive.length === 0 ? 'current' : 'locked';
  };

  const selectedDungeon = dungeons.find(d => d.id === selected);

  if (loading) return <div className="p-10 text-slate-400 text-center animate-pulse">불러오는 중...</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-slate-800 text-base">🗺️ 던전 위치 편집</h3>
          <p className="text-xs text-slate-400 mt-0.5">번호를 드래그해서 위치를 조정하고 저장하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 편집/미리보기 탭 */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-xs">
            {[['edit','✏️ 편집'],['preview','👁️ 미리보기']].map(([v,l]) => (
              <button key={v} onClick={() => setMode(v)}
                className={`px-3 py-2 font-bold transition-colors
                  ${mode===v ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={save} disabled={saving}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all
              ${saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-50`}>
            {saved ? '✅ 저장됨!' : saving ? '저장 중...' : '💾 저장하기'}
          </button>
        </div>
      </div>

      {/* 맵 - 전체 너비 (학생 화면과 동일한 레이아웃) */}
      <div
        ref={mapRef}
        className="relative w-full rounded-2xl overflow-hidden select-none"
        style={{ aspectRatio: '2236/1080', cursor: mode==='edit' && dragging ? 'grabbing' : 'default' }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onMouseUp}
      >
          <img src="/images/FantasyGameMap.png" alt="map"
            className="w-full h-full object-cover pointer-events-none" />

          {dungeons.map(d => {
            const previewState = getPreviewState(d);
            const flagIcon =
              previewState === 'current'   ? '/images/Current.png'
              : previewState === 'completed' ? '/images/Completed.png'
              :                               '/images/Locked.png';

            return mode === 'preview' ? (
              /* 미리보기 모드: 실제 깃발 표시 */
              <div key={d.id} style={{
                position: 'absolute',
                left: `${d.pos.x}%`, top: `${d.pos.y}%`,
                transform: 'translate(-50%,-50%)', zIndex: 10,
              }}>
                <div className="flex flex-col items-center gap-0.5">
                  <img src={flagIcon} alt=""
                    style={{
                      width: 36, height: 36, objectFit: 'contain',
                      filter: d.active === false ? 'brightness(0.6) saturate(0.3)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))',
                    }} />
                  <span className={`text-[8px] font-extrabold px-1 py-0.5 rounded-full whitespace-nowrap
                    ${d.active===false ? 'bg-slate-500 text-slate-200'
                    : previewState==='current' ? 'bg-amber-400 text-amber-900'
                    : 'bg-slate-600 text-slate-300'}`}>
                    {d.name}
                  </span>
                </div>
              </div>
            ) : (
              /* 편집 모드: 드래그 가능한 번호 원 */
              <div
                key={d.id}
                onMouseDown={e => onMouseDown(e, d.id)}
                onTouchStart={e => onTouchStart(e, d.id)}
                style={{
                  position: 'absolute',
                  left: `${d.pos.x}%`, top: `${d.pos.y}%`,
                  transform: 'translate(-50%,-50%)',
                  zIndex: selected === d.id ? 20 : 10,
                  cursor: 'grab',
                }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shadow-lg border-2 transition-all
                  ${selected === d.id
                    ? 'bg-yellow-400 border-yellow-600 text-yellow-900 scale-125'
                    : d.active === false
                    ? 'bg-slate-500 border-slate-700 text-slate-200'
                    : 'bg-indigo-600 border-indigo-800 text-white hover:scale-110'}`}>
                  {d.id + 1}
                </div>
              </div>
            );
          })}
        </div>

      {/* 하단 컨트롤 패널 */}
      <div className="flex gap-4 mt-3">
        {/* 선택된 던전 X/Y 조정 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 w-64 shrink-0">
          {selectedDungeon ? (
            <>
              <div className="font-extrabold text-slate-800 text-sm mb-1">
                {selectedDungeon.id + 1}. {selectedDungeon.name}
              </div>
              <div className="text-xs text-slate-400 mb-3">Lv.{selectedDungeon.level}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500">X (%)</label>
                  <input type="number" step="0.1" value={selectedDungeon.pos.x}
                    onChange={e => setDungeons(prev => prev.map(d =>
                      d.id === selected ? { ...d, pos: { ...d.pos, x: parseFloat(e.target.value)||0 } } : d
                    ))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm text-center mt-0.5 focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500">Y (%)</label>
                  <input type="number" step="0.1" value={selectedDungeon.pos.y}
                    onChange={e => setDungeons(prev => prev.map(d =>
                      d.id === selected ? { ...d, pos: { ...d.pos, y: parseFloat(e.target.value)||0 } } : d
                    ))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm text-center mt-0.5 focus:outline-none focus:border-indigo-400" />
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400 text-center py-3">번호를 클릭하거나 드래그하세요</p>
          )}
        </div>

        {/* 번호 목록 - 가로 스크롤 */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-3 overflow-x-auto">
          <div className="text-[10px] font-bold text-slate-400 mb-2">던전 목록 (클릭하여 선택)</div>
          <div className="flex gap-1.5 flex-wrap">
            {dungeons.map(d => (
              <button key={d.id} onClick={() => setSelected(d.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors shrink-0
                  ${selected === d.id ? 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-300' : 'hover:bg-slate-50 text-slate-600 border border-slate-200'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold
                  ${selected === d.id ? 'bg-indigo-600 text-white' : d.active===false ? 'bg-slate-400 text-white' : 'bg-indigo-200 text-indigo-700'}`}>
                  {d.id + 1}
                </span>
                <span>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
