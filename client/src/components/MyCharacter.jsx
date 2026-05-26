import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { GRADE, SLOTS, STAT_LABEL } from '../constants/equipment';

export default function MyCharacter({ studentCode, themeMode = 'dark' }) {
  const { t } = useTranslation();
  const [studentData, setStudentData] = useState(null);
  const [allItems, setAllItems]       = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        let sd = null;
        if (studentCode) {
          const q = query(collection(db, 'students'), where('studentCode', '==', studentCode));
          const snap = await getDocs(q);
          if (!snap.empty) sd = snap.docs[0].data();
        } else {
          const uid = localStorage.getItem('currentStudentUid');
          if (uid) {
            const snap = await getDoc(doc(db, 'students', uid));
            if (snap.exists()) sd = snap.data();
          }
        }
        setStudentData(sd);

        const itemsSnap = await getDocs(
          query(collection(db, 'equipmentItems'), where('active', '==', true))
        );
        setAllItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    };
    load();
  }, [studentCode]);

  const getMaxExpForLevel = (lv) =>
    lv <= 10 ? 100 : lv <= 30 ? 300 : lv <= 60 ? 800 : 2000;

  const name    = studentData?.name || studentData?.studentCode || '용사';
  const level   = studentData?.level || 1;
  const exp     = studentData?.exp || 0;
  const maxExp  = getMaxExpForLevel(level);
  const gold    = studentData?.gold || 0;
  const diamond = studentData?.diamonds || 0;
  const image   = studentData?.characterImage;
  const expPct  = Math.min(100, (exp / maxExp) * 100);

  const equipped  = studentData?.equipped || {};
  const inventory = studentData?.equipInventory || [];

  const getItem    = id => allItems.find(i => i.id === id);
  const getInvItem = id => inventory.find(i => i.id === id);

  // 레벨 기반 기본 스탯
  const levelStats = {
    hp:          100 + Math.floor(level * 10),
    attack:      10  + Math.floor(level * 2),
    defense:     5   + Math.floor(level * 1.5),
    crit:        5   + Math.floor(level * 0.5),
    attackSpeed: 10  + Math.floor(level * 1),
  };

  // 장비 보너스 스탯
  const equipBonus = Object.keys(STAT_LABEL).reduce((acc, key) => {
    acc[key] = Object.values(equipped).reduce((sum, invId) => {
      const inv  = getInvItem(invId);
      const item = inv ? getItem(inv.itemId) : null;
      if (!item?.stats?.[key]) return sum;
      return sum + (item.stats[key] || 0) + (inv.stars || 0) * 5;
    }, 0);
    return acc;
  }, {});

  const totalStats = Object.keys(STAT_LABEL).reduce((acc, key) => {
    acc[key] = (levelStats[key] || 0) + (equipBonus[key] || 0);
    return acc;
  }, {});

  const STAT_META = [
    { key: 'hp',          label: '체력',      img: '/images/Icon_Heart02.png',            icon: '❤️' },
    { key: 'attack',      label: '공격력',    img: '/images/ItemIcon_Weapon_Sword.png',   icon: '⚔️' },
    { key: 'defense',     label: '방어력',    img: '/images/ItemIcon_Weapon_Shield.png',  icon: '🛡️' },
    { key: 'crit',        label: '크리티컬',  img: '/images/Icon_Fire01.png',             icon: '💥' },
    { key: 'attackSpeed', label: '공격속도',  img: null,                                  icon: '💨' },
  ];

  const equippedCount = Object.keys(equipped).length;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full">
      <h1 className={`text-3xl font-bold mb-6 drop-shadow-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-800'}`}>
        {t('character.title')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── 왼쪽: 캐릭터 카드 ── */}
        <div className="lg:col-span-1 bg-white rounded-3xl shadow-lg border border-slate-100 p-8 flex flex-col items-center justify-center transform transition-all hover:-translate-y-1 hover:shadow-xl">
          <div className="relative w-48 h-56 mb-6">
            <div className="relative w-full h-full bg-indigo-50 border-2 border-indigo-200 rounded-2xl flex items-center justify-center shadow-inner overflow-hidden">
              {image
                ? <img src={image} alt="캐릭터" className="w-full h-full object-contain scale-[3]" />
                : <span className="text-6xl">🧑‍🎓</span>}
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-1 rounded-full font-bold text-sm shadow-md border-2 border-white whitespace-nowrap">
              {t('character.level', { level })}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-6">{name}</h2>

          <div className="w-full">
            <div className="flex justify-between text-sm font-bold text-slate-500 mb-2">
              <span>{t('character.exp')}</span>
              <span>{exp} / {maxExp}</span>
            </div>
            <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-1000 ease-out relative"
                style={{ width: `${expPct}%` }}>
                <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/30 rounded-t-full" />
              </div>
            </div>
          </div>
        </div>

        {/* ── 오른쪽 ── */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* 재화 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-6 flex items-center justify-between hover:scale-[1.02] transition-transform cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl shadow-sm">🪙</div>
                <span className="text-lg font-bold text-slate-600">{t('character.gold')}</span>
              </div>
              <span className="text-3xl font-extrabold text-amber-500">{gold.toLocaleString()}</span>
            </div>
            <div className="bg-white rounded-3xl shadow-md border border-slate-100 p-6 flex items-center justify-between hover:scale-[1.02] transition-transform cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center text-2xl shadow-sm">💎</div>
                <span className="text-lg font-bold text-slate-600">{t('character.diamond')}</span>
              </div>
              <span className="text-3xl font-extrabold text-cyan-500">{diamond.toLocaleString()}</span>
            </div>
          </div>

          {/* 전투 능력치 */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6">
            <h3 className="text-base font-extrabold text-slate-800 mb-1 flex items-center gap-2">
              ⚔️ 전투 능력치
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              레벨 스탯{equippedCount > 0 && <span className="text-emerald-500 font-bold"> + 장비 보너스 (초록)</span>}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {STAT_META.map(s => {
                const base  = levelStats[s.key];
                const bonus = equipBonus[s.key] || 0;
                const total = totalStats[s.key];
                return (
                  <div key={s.key} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
                    <div className="flex items-center gap-2">
                      {s.img
                        ? <img src={s.img} alt="" className="w-6 h-6 object-contain" />
                        : <span className="text-lg">{s.icon}</span>}
                      <span className="text-sm font-bold text-slate-600">{s.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-extrabold text-indigo-600">{total}</span>
                      {bonus > 0 && (
                        <span className="text-xs font-bold text-emerald-500">(+{bonus})</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 장착 장비 */}
          <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-6">
            <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              🛡️ 장착 장비
              <span className="text-xs font-normal text-slate-400">{equippedCount} / {SLOTS.length}</span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {SLOTS.map(slot => {
                const invId   = equipped[slot.key];
                const invItem = invId ? getInvItem(invId) : null;
                const item    = invItem ? getItem(invItem.itemId) : null;
                const g       = item ? (GRADE[item.grade] || GRADE.common) : null;
                return (
                  <div key={slot.key}
                    className={`flex flex-col items-center rounded-2xl border-2 p-3 gap-1.5
                      ${item ? `${g.border} ${g.bg}` : 'border-dashed border-slate-200 bg-slate-50'}`}>
                    <div className="w-16 h-16 flex items-center justify-center">
                      {item?.image
                        ? <img src={item.image} alt={item.name} className="w-full h-full object-contain drop-shadow-sm" />
                        : <span className="text-2xl opacity-20">{slot.icon}</span>}
                    </div>
                    <div className="text-xs font-bold text-slate-600 text-center leading-tight w-full truncate">
                      {item ? item.name : <span className="text-slate-300">{slot.label}</span>}
                    </div>
                    {item ? (
                      <div className="flex flex-wrap justify-center gap-px">
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={`text-[10px] ${i < (invItem?.stars || 0) ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-300">비어있음</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
