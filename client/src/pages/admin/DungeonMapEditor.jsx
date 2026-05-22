import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const DEFAULT_DUNGEONS = [
  { id:  0, name: '고블린 동굴',    desc: '얼음산 기슭, 고블린 무리가 들끓는 동굴.',               level:  1, pos:{ x:10, y:63 }, reward:'🪙 50G · ⭐ 30EXP' },
  { id:  1, name: '서리 협곡',      desc: '뼈를 에는 칼바람이 부는 얼음 협곡.',                   level:  3, pos:{ x:14, y:51 }, reward:'🪙 80G · ⭐ 50EXP' },
  { id:  2, name: '눈보라 성채',    desc: '눈보라 속에 숨겨진 냉기 정령의 요새.',                  level:  5, pos:{ x:13, y:40 }, reward:'🪙 110G · ⭐ 70EXP' },
  { id:  3, name: '독버섯 지대',    desc: '독버섯 포자가 가득한 어두운 숲 입구.',                  level:  7, pos:{ x:24, y:77 }, reward:'🪙 140G · ⭐ 90EXP' },
  { id:  4, name: '어둠의 숲',      desc: '빛이 닿지 않는 깊은 숲. 나무 정령이 지킨다.',           level:  9, pos:{ x:27, y:69 }, reward:'🪙 170G · ⭐ 110EXP' },
  { id:  5, name: '늪지대',         desc: '독성 늪에 숨어있는 괴생명체들의 서식지.',               level: 11, pos:{ x:30, y:63 }, reward:'🪙 200G · ⭐ 130EXP' },
  { id:  6, name: '고목 신전',      desc: '수백 년 된 고목 아래 봉인된 고대 신전.',                level: 13, pos:{ x:32, y:55 }, reward:'🪙 230G · ⭐ 150EXP' },
  { id:  7, name: '엘프 마을 폐허', desc: '마족의 침략으로 폐허가 된 엘프들의 마을.',              level: 15, pos:{ x:34, y:47 }, reward:'🪙 260G · ⭐ 170EXP' },
  { id:  8, name: '숲의 제단',      desc: '금지된 제사가 치러진 어두운 제단.',                    level: 17, pos:{ x:35, y:39 }, reward:'🪙 300G · ⭐ 190EXP' },
  { id:  9, name: '버려진 요새',    desc: '마족에게 함락된 왕국 전진 요새.',                      level: 19, pos:{ x:38, y:30 }, reward:'🪙 340G · 💎 1 · ⭐ 210EXP' },
  { id: 10, name: '기사단 본거지',  desc: '타락한 기사단이 점령한 철옹성.',                       level: 21, pos:{ x:41, y:22 }, reward:'🪙 380G · 💎 2 · ⭐ 230EXP' },
  { id: 11, name: '마법사의 탑',    desc: '금지된 마법을 연구하는 흑마법사의 탑.',                 level: 23, pos:{ x:44, y:15 }, reward:'🪙 420G · 💎 2 · ⭐ 250EXP' },
  { id: 12, name: '뼈의 사막',      desc: '죽은 전사들의 뼈로 뒤덮인 황량한 사막.',               level: 25, pos:{ x:53, y:68 }, reward:'🪙 460G · 💎 3 · ⭐ 280EXP' },
  { id: 13, name: '선인장 미로',    desc: '독침을 쏘는 선인장 몬스터들의 미로.',                   level: 27, pos:{ x:57, y:60 }, reward:'🪙 500G · 💎 3 · ⭐ 310EXP' },
  { id: 14, name: '모래 폭풍 지대', desc: '쉼 없이 몰아치는 모래 폭풍 속의 전장.',                level: 29, pos:{ x:60, y:52 }, reward:'🪙 540G · 💎 4 · ⭐ 340EXP' },
  { id: 15, name: '사막 신전',      desc: '모래 속에 묻힌 고대 파라오의 신전.',                   level: 31, pos:{ x:63, y:44 }, reward:'🪙 580G · 💎 4 · ⭐ 370EXP' },
  { id: 16, name: '파라오 무덤',    desc: '저주받은 파라오가 영원히 잠든 거대 무덤.',              level: 33, pos:{ x:67, y:37 }, reward:'🪙 620G · 💎 5 · ⭐ 400EXP' },
  { id: 17, name: '오아시스 함정',  desc: '신기루 뒤에 숨어있는 거대 몬스터의 소굴.',             level: 35, pos:{ x:67, y:28 }, reward:'🪙 660G · 💎 5 · ⭐ 430EXP' },
  { id: 18, name: '용암 동굴',      desc: '마그마가 흐르는 화산 내부. 염왕이 지배한다.',           level: 37, pos:{ x:71, y:53 }, reward:'🪙 700G · 💎 6 · ⭐ 460EXP' },
  { id: 19, name: '화염 골렘 소굴', desc: '용암으로 만들어진 거대 골렘들의 소굴.',                 level: 39, pos:{ x:75, y:46 }, reward:'🪙 740G · 💎 6 · ⭐ 490EXP' },
  { id: 20, name: '불의 협곡',      desc: '화염이 치솟는 협곡.',                                 level: 41, pos:{ x:77, y:40 }, reward:'🪙 780G · 💎 7 · ⭐ 520EXP' },
  { id: 21, name: '화산 사원',      desc: '불의 신에게 바쳐진 고대 사원.',                        level: 43, pos:{ x:80, y:34 }, reward:'🪙 820G · 💎 7 · ⭐ 550EXP' },
  { id: 22, name: '불꽃 왕의 영지', desc: '화산을 지배하는 불꽃 왕의 본거지.',                    level: 45, pos:{ x:78, y:28 }, reward:'🪙 860G · 💎 8 · ⭐ 580EXP' },
  { id: 23, name: '용의 둥지',      desc: '화산 정상 고룡이 지키는 보물창고.',                    level: 48, pos:{ x:84, y:24 }, reward:'🪙 920G · 💎 9 · ⭐ 620EXP' },
  { id: 24, name: '마왕 성채',      desc: '세계를 지배하려는 마왕의 최후 요새.',                   level: 52, pos:{ x:85, y:17 }, reward:'🪙 1200G · 💎 15 · ⭐ 800EXP' },
];

export default function DungeonMapEditor() {
  const [dungeons, setDungeons] = useState(DEFAULT_DUNGEONS);
  const [dragging, setDragging] = useState(null); // { id, startX, startY, origX, origY }
  const [selected, setSelected] = useState(null);
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'dungeons'));
        if (snap.exists() && snap.data().list?.length > 0)
          setDungeons(snap.data().list);
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
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert('저장 실패'); }
    finally { setSaving(false); }
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
        <button onClick={save} disabled={saving}
          className={`px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all
            ${saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-50`}>
          {saved ? '✅ 저장됨!' : saving ? '저장 중...' : '💾 저장하기'}
        </button>
      </div>

      <div className="flex gap-4">
        {/* 맵 에디터 */}
        <div
          ref={mapRef}
          className="relative flex-1 rounded-2xl overflow-hidden select-none"
          style={{ aspectRatio: '2236/1080', cursor: dragging ? 'grabbing' : 'default' }}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchMove={onTouchMove}
          onTouchEnd={onMouseUp}
        >
          <img src="/images/FantasyGameMap.png" alt="map"
            className="w-full h-full object-cover pointer-events-none" />

          {dungeons.map(d => (
            <div
              key={d.id}
              onMouseDown={e => onMouseDown(e, d.id)}
              onTouchStart={e => onTouchStart(e, d.id)}
              style={{
                position: 'absolute',
                left:   `${d.pos.x}%`,
                top:    `${d.pos.y}%`,
                transform: 'translate(-50%, -50%)',
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
          ))}
        </div>

        {/* 선택된 던전 정보 */}
        <div className="w-52 shrink-0 space-y-2">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            {selectedDungeon ? (
              <>
                <div className="font-extrabold text-slate-800 text-sm mb-1">
                  {selectedDungeon.id + 1}. {selectedDungeon.name}
                </div>
                <div className="text-xs text-slate-400 mb-3">Lv.{selectedDungeon.level}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">X (%)</label>
                    <input
                      type="number" step="0.1"
                      value={selectedDungeon.pos.x}
                      onChange={e => setDungeons(prev => prev.map(d =>
                        d.id === selected ? { ...d, pos: { ...d.pos, x: parseFloat(e.target.value)||0 } } : d
                      ))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm text-center mt-0.5 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500">Y (%)</label>
                    <input
                      type="number" step="0.1"
                      value={selectedDungeon.pos.y}
                      onChange={e => setDungeons(prev => prev.map(d =>
                        d.id === selected ? { ...d, pos: { ...d.pos, y: parseFloat(e.target.value)||0 } } : d
                      ))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm text-center mt-0.5 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">번호를 클릭하거나<br/>드래그하세요</p>
            )}
          </div>

          {/* 번호 목록 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 max-h-80 overflow-y-auto">
            <div className="text-[10px] font-bold text-slate-400 mb-2">던전 목록</div>
            {dungeons.map(d => (
              <button key={d.id} onClick={() => setSelected(d.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 mb-0.5
                  ${selected === d.id ? 'bg-indigo-100 text-indigo-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0
                  ${selected === d.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {d.id + 1}
                </span>
                <span className="truncate">{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
