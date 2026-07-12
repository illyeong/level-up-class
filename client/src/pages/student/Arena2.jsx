import React, { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, query, where, doc, updateDoc, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { fireProjectile } from '../../utils/projectile';
import { STAT_LABEL } from '../../constants/equipment';
import { getMaxExpForLevel } from '../../utils/leveling';

// ── 레벨 기반 스탯 + 장비/업그레이드 보너스 ─────────────────
// 인수로 student 객체 또는 숫자(레벨)를 받음
const getStats = (studentOrLevel = 1, equipmentItems = []) => {
  const level = typeof studentOrLevel === 'number'
    ? studentOrLevel
    : (studentOrLevel?.level || 1);
  const s = typeof studentOrLevel === 'object' && studentOrLevel !== null
    ? studentOrLevel : null;

  const base = {
    hp:          100 + Math.floor(level * 12),
    attack:      10  + Math.floor(level * 2),
    defense:     Math.floor(level * 1.2),
    crit:        8,
    dodge:       5,
    attackSpeed: 10  + Math.floor(level * 1),
  };

  if (!s) return base;

  const equipped = s.equipped || {};
  const inventory = s.equipInventory || [];
  const getInvItem = (invId) => inventory.find((inv) => String(inv.id) === String(invId));
  const getItem = (itemId) => equipmentItems.find((item) => String(item.id) === String(itemId));
  const equipBonus = Object.keys(STAT_LABEL).reduce((acc, key) => {
    acc[key] = Object.values(equipped).reduce((sum, invId) => {
      const inv = getInvItem(invId);
      const item = inv ? getItem(inv.itemId) : null;
      if (!item?.stats?.[key]) return sum;
      return sum + (Number(item.stats[key]) || 0) + (Number(inv.stars) || 0) * 5;
    }, 0);
    return acc;
  }, {});

  // Firebase에 저장된 업그레이드 스탯 반영 (기본값 초과분을 보너스로 합산)
  const atkBonus  = Math.max(0, (s.attackPower || 10) - 10);
  const defBonus  = Math.max(0, (s.defense     ||  5) -  5);
  const critBonus = Math.max(0, (s.critChance  || 20) - 20);

  return {
    hp:          base.hp + (s.bonusHp || 0) + (equipBonus.hp || 0),
    attack:      base.attack  + atkBonus + (equipBonus.attack || 0),
    defense:     base.defense + defBonus + (equipBonus.defense || 0),
    crit:        base.crit    + critBonus + (equipBonus.crit || 0),
    dodge:       base.dodge + Math.floor((base.attackSpeed + (equipBonus.attackSpeed || 0)) / 20),
    attackSpeed: base.attackSpeed + (equipBonus.attackSpeed || 0),
  };
};

const calcLevelUp = (level, exp, gained) => {
  let lv = level || 1, ex = (exp || 0) + gained;
  let mx = getMaxExpForLevel(lv), leveled = false;
  while (ex >= mx && lv < 99) { ex -= mx; lv++; mx = getMaxExpForLevel(lv); leveled = true; }
  return { level: lv, exp: ex, maxExp: mx, leveled };
};

const STAT_META = [
  { key:'hp',          label:'체력',     img:'/images/Icon_Heart02.png',            icon:'❤️' },
  { key:'attack',      label:'공격력',   img:'/images/ItemIcon_Weapon_Sword.png',   icon:'⚔️' },
  { key:'defense',     label:'방어력',   img:'/images/ItemIcon_Weapon_Shield.png',  icon:'🛡️' },
  { key:'crit',        label:'크리티컬', img:'/images/Icon_Fire01.png',             icon:'💥' },
  { key:'dodge',       label:'회피율',   img:null,                                  icon:'💨' },
  { key:'attackSpeed', label:'공격속도', img:null,                                  icon:'💨' },
];

const WIN_REWARD  = { gold: 100, diamond: 50, exp: 50 };
const LOSE_REWARD = { gold: 0,   diamond: 0,  exp: 25 };
const CHANGE_COST = 30;
const MAX_CHANGES = 3;
const FINAL_STRIKE_FX_MS = 2200;
const VICTORY_FX_MS = 1700;

const getArenaBattlePower = (stats) => (
  (stats.attack || 0) * 2
  + (stats.defense || 0)
  + (stats.hp || 0) / 20
  + (stats.crit || 0) * 0.25
  + (stats.dodge || 0) * 0.35
  + (stats.attackSpeed || 0) * 0.2
);

const getUnderdogBonus = (myStats, oppStats) => {
  const myPower = Math.max(1, getArenaBattlePower(myStats));
  const oppPower = Math.max(1, getArenaBattlePower(oppStats));
  if (myPower >= oppPower) {
    return {
      active: false,
      gap: 0,
      dodgeBonus: 0,
      critBonus: 0,
      damageDealtMultiplier: 1,
      damageTakenMultiplier: 1,
    };
  }

  const gap = Math.min(0.35, (oppPower - myPower) / oppPower);
  const pressure = Math.max(0, Math.min(1, (gap - 0.08) / 0.14));
  return {
    active: true,
    gap,
    dodgeBonus: Math.round(1 + pressure * 8),
    critBonus: Math.round(1 + pressure * 7),
    damageDealtMultiplier: 1 + pressure * 0.11,
    damageTakenMultiplier: 1 - pressure * 0.1,
  };
};

const ARENA_TACTICS = [
  {
    id: 'balanced',
    name: '균형형',
    icon: '⚖️',
    desc: '스탯 변화 없이 안정적으로 대련합니다.',
    apply: (stats) => stats,
  },
  {
    id: 'attack',
    name: '공격형',
    icon: '⚔️',
    desc: '공격력 +10%, 방어력 -5%',
    apply: (stats) => ({
      ...stats,
      attack: Math.max(1, Math.floor(stats.attack * 1.1)),
      defense: Math.max(0, Math.floor(stats.defense * 0.95)),
    }),
  },
  {
    id: 'defense',
    name: '방어형',
    icon: '🛡️',
    desc: '방어력 +15%, 공격력 -5%',
    apply: (stats) => ({
      ...stats,
      attack: Math.max(1, Math.floor(stats.attack * 0.95)),
      defense: Math.floor(stats.defense * 1.15),
    }),
  },
  {
    id: 'speed',
    name: '민첩형',
    icon: '💨',
    desc: '회피율 +7%, 치명타 -3%',
    apply: (stats) => ({
      ...stats,
      dodge: Math.min(45, (stats.dodge || 0) + 7),
      crit: Math.max(0, (stats.crit || 0) - 3),
    }),
  },
];

const getArenaTactic = (id) => ARENA_TACTICS.find(t => t.id === id) || ARENA_TACTICS[0];

const LEARNING_BUFFS = [
  { id: 'focus', name: '집중', desc: '내 첫 3번 행동의 공격력 +10%', badge: 'ATK' },
  { id: 'calm', name: '침착', desc: '첫 피격 때 회피율 +10%', badge: 'EVA' },
  { id: 'review_power', name: '복습의 힘', desc: '전투 시작 HP +15', badge: 'HP' },
  { id: 'insight', name: '분석', desc: '상대의 첫 강타 피해 감소', badge: 'DEF' },
];

const ARENA_STRATEGY_QUESTIONS = [
  { id: 'g1-math-01', grade: 1, subject: 'math', q: '7 + 5 = ?', options: ['10', '11', '12', '13'], answer: 2, exp: '7에 5를 더하면 12입니다.' },
  { id: 'g1-math-02', grade: 1, subject: 'math', q: '15 - 6 = ?', options: ['7', '8', '9', '10'], answer: 2, exp: '15에서 6을 빼면 9입니다.' },
  { id: 'g1-math-03', grade: 1, subject: 'math', q: '10보다 3 큰 수는?', options: ['11', '12', '13', '14'], answer: 2, exp: '10보다 3 큰 수는 13입니다.' },
  { id: 'g1-math-04', grade: 1, subject: 'math', q: '8은 5보다 얼마나 클까요?', options: ['2', '3', '4', '5'], answer: 1, exp: '8 - 5 = 3입니다.' },
  { id: 'g1-math-05', grade: 1, subject: 'math', q: '20, 21, 22, 다음 수는?', options: ['23', '24', '25', '26'], answer: 0, exp: '1씩 커지므로 다음 수는 23입니다.' },
  { id: 'g1-math-06', grade: 1, subject: 'math', q: '동전 10원 3개는 모두 얼마인가요?', options: ['20원', '30원', '40원', '50원'], answer: 1, exp: '10원이 3개면 30원입니다.' },
  { id: 'g2-math-01', grade: 2, subject: 'math', q: '23 + 14 = ?', options: ['35', '36', '37', '38'], answer: 2, exp: '23 + 14 = 37입니다.' },
  { id: 'g2-math-02', grade: 2, subject: 'math', q: '42 - 18 = ?', options: ['22', '23', '24', '25'], answer: 2, exp: '42 - 18 = 24입니다.' },
  { id: 'g2-math-03', grade: 2, subject: 'math', q: '5 × 3 = ?', options: ['10', '12', '15', '18'], answer: 2, exp: '5를 3번 더하면 15입니다.' },
  { id: 'g2-math-04', grade: 2, subject: 'math', q: '2시 30분에서 30분 뒤는?', options: ['2시 40분', '3시', '3시 30분', '4시'], answer: 1, exp: '2시 30분에서 30분 뒤는 3시입니다.' },
  { id: 'g2-math-05', grade: 2, subject: 'math', q: '100은 10이 몇 개인가요?', options: ['5개', '10개', '20개', '100개'], answer: 1, exp: '10이 10개이면 100입니다.' },
  { id: 'g2-math-06', grade: 2, subject: 'math', q: '가장 큰 수는?', options: ['46', '64', '56', '60'], answer: 1, exp: '64가 가장 큽니다.' },
  { id: 'g3-math-01', grade: 3, subject: 'math', q: '36 ÷ 4 = ?', options: ['6', '7', '8', '9'], answer: 3, exp: '4 × 9 = 36이므로 답은 9입니다.' },
  { id: 'g3-math-02', grade: 3, subject: 'math', q: '125 + 230 = ?', options: ['345', '355', '365', '375'], answer: 1, exp: '125 + 230 = 355입니다.' },
  { id: 'g3-math-03', grade: 3, subject: 'math', q: '1m는 몇 cm인가요?', options: ['10cm', '50cm', '100cm', '1000cm'], answer: 2, exp: '1m는 100cm입니다.' },
  { id: 'g3-math-04', grade: 3, subject: 'math', q: '삼각형의 변은 몇 개인가요?', options: ['2개', '3개', '4개', '5개'], answer: 1, exp: '삼각형은 변이 3개입니다.' },
  { id: 'g3-math-05', grade: 3, subject: 'math', q: '7 × 8 = ?', options: ['48', '54', '56', '64'], answer: 2, exp: '7 × 8 = 56입니다.' },
  { id: 'g3-math-06', grade: 3, subject: 'math', q: '500 - 125 = ?', options: ['365', '375', '385', '395'], answer: 1, exp: '500 - 125 = 375입니다.' },
  { id: 'g4-math-01', grade: 4, subject: 'math', q: '3/6과 같은 크기의 분수는?', options: ['1/2', '1/3', '2/3', '3/4'], answer: 0, exp: '3/6은 약분하면 1/2입니다.' },
  { id: 'g4-math-02', grade: 4, subject: 'math', q: '24 × 3 = ?', options: ['62', '70', '72', '82'], answer: 2, exp: '24 × 3 = 72입니다.' },
  { id: 'g4-math-03', grade: 4, subject: 'math', q: '96 ÷ 8 = ?', options: ['10', '11', '12', '13'], answer: 2, exp: '8 × 12 = 96입니다.' },
  { id: 'g4-math-04', grade: 4, subject: 'math', q: '0.3은 분수로?', options: ['3/10', '3/100', '30/1000', '1/3'], answer: 0, exp: '0.3은 3/10입니다.' },
  { id: 'g4-math-05', grade: 4, subject: 'math', q: '직각은 몇 도인가요?', options: ['45도', '60도', '90도', '180도'], answer: 2, exp: '직각은 90도입니다.' },
  { id: 'g4-math-06', grade: 4, subject: 'math', q: '가로 5cm, 세로 4cm 직사각형의 넓이는?', options: ['9㎠', '18㎠', '20㎠', '25㎠'], answer: 2, exp: '넓이는 5 × 4 = 20㎠입니다.' },
  { id: 'g5-math-01', grade: 5, subject: 'math', q: '1.2 + 0.8 = ?', options: ['1.8', '2', '2.2', '2.8'], answer: 1, exp: '1.2 + 0.8 = 2입니다.' },
  { id: 'g5-math-02', grade: 5, subject: 'math', q: '2/5 + 1/5 = ?', options: ['2/10', '3/10', '3/5', '1/5'], answer: 2, exp: '분모가 같으므로 분자만 더해 3/5입니다.' },
  { id: 'g5-math-03', grade: 5, subject: 'math', q: '15의 약수는?', options: ['2', '4', '5', '8'], answer: 2, exp: '15는 5로 나누어떨어집니다.' },
  { id: 'g5-math-04', grade: 5, subject: 'math', q: '4와 6의 최소공배수는?', options: ['8', '10', '12', '24'], answer: 2, exp: '4와 6의 공배수 중 가장 작은 수는 12입니다.' },
  { id: 'g5-math-05', grade: 5, subject: 'math', q: '평행사변형의 넓이는?', options: ['밑변 × 높이', '밑변 + 높이', '밑변 × 2', '높이 × 2'], answer: 0, exp: '평행사변형의 넓이는 밑변 × 높이입니다.' },
  { id: 'g5-math-06', grade: 5, subject: 'math', q: '3.5 × 10 = ?', options: ['0.35', '3.5', '35', '350'], answer: 2, exp: '10을 곱하면 소수점이 한 자리 오른쪽으로 이동합니다.' },
  { id: 'g6-math-01', grade: 6, subject: 'math', q: '50의 10%는?', options: ['3', '5', '10', '15'], answer: 1, exp: '50 × 0.1 = 5입니다.' },
  { id: 'g6-math-02', grade: 6, subject: 'math', q: '3 : 6과 같은 비는?', options: ['1 : 2', '2 : 1', '3 : 1', '6 : 1'], answer: 0, exp: '3 : 6은 1 : 2로 간단히 나타낼 수 있습니다.' },
  { id: 'g6-math-03', grade: 6, subject: 'math', q: '원의 지름이 10cm이면 반지름은?', options: ['3cm', '5cm', '10cm', '20cm'], answer: 1, exp: '반지름은 지름의 절반이므로 5cm입니다.' },
  { id: 'g6-math-04', grade: 6, subject: 'math', q: '2/3 × 3 = ?', options: ['1', '2', '3', '6'], answer: 1, exp: '2/3 × 3 = 2입니다.' },
  { id: 'g6-math-05', grade: 6, subject: 'math', q: '120을 3명에게 똑같이 나누면 한 명당?', options: ['30', '40', '50', '60'], answer: 1, exp: '120 ÷ 3 = 40입니다.' },
  { id: 'g6-math-06', grade: 6, subject: 'math', q: '1.5 ÷ 0.5 = ?', options: ['2', '3', '4', '5'], answer: 1, exp: '1.5 안에 0.5가 3번 들어갑니다.' },
  { id: 'g5-eng-01', grade: 5, subject: 'english', q: '"apple"의 뜻은?', options: ['사과', '바나나', '우유', '학교'], answer: 0, exp: 'apple은 사과입니다.' },
  { id: 'g5-eng-02', grade: 5, subject: 'english', q: '"book"의 뜻은?', options: ['책', '공', '문', '물'], answer: 0, exp: 'book은 책입니다.' },
  { id: 'g5-eng-03', grade: 5, subject: 'english', q: '"I am happy."의 뜻은?', options: ['나는 슬프다', '나는 행복하다', '나는 배고프다', '나는 빠르다'], answer: 1, exp: 'happy는 행복한이라는 뜻입니다.' },
  { id: 'g5-eng-04', grade: 5, subject: 'english', q: '"dog"의 뜻은?', options: ['고양이', '개', '새', '말'], answer: 1, exp: 'dog는 개입니다.' },
  { id: 'g5-eng-05', grade: 5, subject: 'english', q: '"red"는 어떤 색인가요?', options: ['빨간색', '파란색', '초록색', '노란색'], answer: 0, exp: 'red는 빨간색입니다.' },
  { id: 'g5-eng-06', grade: 5, subject: 'english', q: '"Thank you."의 뜻은?', options: ['미안해', '고마워', '안녕', '잘 자'], answer: 1, exp: 'Thank you는 고마워라는 뜻입니다.' },
  { id: 'g6-eng-01', grade: 6, subject: 'english', q: '"What time is it?"의 뜻은?', options: ['몇 살이니?', '몇 시니?', '어디 가니?', '무엇을 먹니?'], answer: 1, exp: 'What time is it?은 몇 시니?입니다.' },
  { id: 'g6-eng-02', grade: 6, subject: 'english', q: '"I like soccer."의 뜻은?', options: ['나는 축구를 좋아한다', '나는 축구를 싫어한다', '나는 야구를 좋아한다', '나는 달리기를 한다'], answer: 0, exp: 'like는 좋아한다는 뜻입니다.' },
  { id: 'g6-eng-03', grade: 6, subject: 'english', q: '"Where are you from?"의 뜻은?', options: ['이름이 뭐니?', '어디 출신이니?', '몇 시니?', '무엇을 원하니?'], answer: 1, exp: 'Where are you from?은 어디 출신이니?입니다.' },
  { id: 'g6-eng-04', grade: 6, subject: 'english', q: '"small"의 반대말은?', options: ['big', 'hot', 'slow', 'short'], answer: 0, exp: 'small의 반대말은 big입니다.' },
  { id: 'g6-eng-05', grade: 6, subject: 'english', q: '"She can swim."의 뜻은?', options: ['그녀는 수영할 수 있다', '그녀는 달릴 수 있다', '그는 수영할 수 있다', '그녀는 노래한다'], answer: 0, exp: 'can은 할 수 있다는 뜻입니다.' },
  { id: 'g6-eng-06', grade: 6, subject: 'english', q: '"Monday"는 무슨 요일인가요?', options: ['월요일', '화요일', '수요일', '금요일'], answer: 0, exp: 'Monday는 월요일입니다.' },
  { id: 'g3-math-07', grade: 3, subject: 'math', q: '64 ÷ 8 = ?', options: ['6', '7', '8', '9'], answer: 2, exp: '8 × 8 = 64이므로 답은 8입니다.' },
  { id: 'g3-math-08', grade: 3, subject: 'math', q: '245 + 120 = ?', options: ['355', '365', '375', '385'], answer: 1, exp: '245 + 120 = 365입니다.' },
  { id: 'g3-math-09', grade: 3, subject: 'math', q: '900 - 450 = ?', options: ['350', '400', '450', '500'], answer: 2, exp: '900 - 450 = 450입니다.' },
  { id: 'g3-math-10', grade: 3, subject: 'math', q: '1km는 몇 m인가요?', options: ['10m', '100m', '500m', '1000m'], answer: 3, exp: '1km는 1000m입니다.' },
  { id: 'g3-math-11', grade: 3, subject: 'math', q: '정사각형의 네 변은?', options: ['모두 같다', '모두 다르다', '2개만 같다', '3개만 같다'], answer: 0, exp: '정사각형은 네 변의 길이가 모두 같습니다.' },
  { id: 'g3-math-12', grade: 3, subject: 'math', q: '9 × 6 = ?', options: ['45', '48', '54', '63'], answer: 2, exp: '9 × 6 = 54입니다.' },
  { id: 'g4-math-07', grade: 4, subject: 'math', q: '1/4 + 2/4 = ?', options: ['1/4', '2/4', '3/4', '4/4'], answer: 2, exp: '분모가 같으므로 분자만 더해 3/4입니다.' },
  { id: 'g4-math-08', grade: 4, subject: 'math', q: '0.7은 분수로?', options: ['7/10', '7/100', '70/10', '1/7'], answer: 0, exp: '0.7은 7/10입니다.' },
  { id: 'g4-math-09', grade: 4, subject: 'math', q: '36 × 2 = ?', options: ['62', '70', '72', '76'], answer: 2, exp: '36 × 2 = 72입니다.' },
  { id: 'g4-math-10', grade: 4, subject: 'math', q: '144 ÷ 12 = ?', options: ['10', '11', '12', '13'], answer: 2, exp: '12 × 12 = 144이므로 답은 12입니다.' },
  { id: 'g4-math-11', grade: 4, subject: 'math', q: '둔각은 90도보다?', options: ['작다', '같다', '크다', '항상 180도다'], answer: 2, exp: '둔각은 90도보다 크고 180도보다 작은 각입니다.' },
  { id: 'g4-math-12', grade: 4, subject: 'math', q: '가장 작은 소수는?', options: ['0.2', '0.5', '0.8', '1.0'], answer: 0, exp: '0.2가 가장 작습니다.' },
  { id: 'g5-math-07', grade: 5, subject: 'math', q: '0.25는 분수로?', options: ['1/2', '1/3', '1/4', '1/5'], answer: 2, exp: '0.25는 25/100이고 약분하면 1/4입니다.' },
  { id: 'g5-math-08', grade: 5, subject: 'math', q: '18과 24의 최대공약수는?', options: ['3', '4', '6', '12'], answer: 2, exp: '18과 24의 공약수 중 가장 큰 수는 6입니다.' },
  { id: 'g5-math-09', grade: 5, subject: 'math', q: '2.4 + 1.6 = ?', options: ['3', '3.5', '4', '4.5'], answer: 2, exp: '2.4 + 1.6 = 4입니다.' },
  { id: 'g5-math-10', grade: 5, subject: 'math', q: '5/8에서 2/8를 빼면?', options: ['2/8', '3/8', '4/8', '7/8'], answer: 1, exp: '5/8 - 2/8 = 3/8입니다.' },
  { id: 'g5-math-11', grade: 5, subject: 'math', q: '삼각형의 넓이는?', options: ['밑변 × 높이', '밑변 × 높이 ÷ 2', '밑변 + 높이', '밑변 × 3'], answer: 1, exp: '삼각형의 넓이는 밑변 × 높이 ÷ 2입니다.' },
  { id: 'g5-math-12', grade: 5, subject: 'math', q: '4.2 ÷ 10 = ?', options: ['0.42', '4.2', '42', '420'], answer: 0, exp: '10으로 나누면 소수점이 한 자리 왼쪽으로 이동합니다.' },
  { id: 'g6-math-07', grade: 6, subject: 'math', q: '80의 25%는?', options: ['10', '20', '25', '40'], answer: 1, exp: '80의 25%는 80의 1/4이므로 20입니다.' },
  { id: 'g6-math-08', grade: 6, subject: 'math', q: '5 : 10을 간단히 하면?', options: ['1 : 2', '2 : 1', '1 : 5', '5 : 1'], answer: 0, exp: '5 : 10은 둘 다 5로 나누어 1 : 2입니다.' },
  { id: 'g6-math-09', grade: 6, subject: 'math', q: '원의 반지름이 4cm이면 지름은?', options: ['2cm', '4cm', '8cm', '16cm'], answer: 2, exp: '지름은 반지름의 2배이므로 8cm입니다.' },
  { id: 'g6-math-10', grade: 6, subject: 'math', q: '3/4 × 8 = ?', options: ['4', '5', '6', '8'], answer: 2, exp: '8의 3/4은 6입니다.' },
  { id: 'g6-math-11', grade: 6, subject: 'math', q: '0.6 : 1.2와 같은 비는?', options: ['1 : 2', '2 : 1', '3 : 1', '6 : 1'], answer: 0, exp: '0.6 : 1.2는 둘 다 0.6으로 나누어 1 : 2입니다.' },
  { id: 'g6-math-12', grade: 6, subject: 'math', q: '150의 20%는?', options: ['20', '25', '30', '40'], answer: 2, exp: '150 × 0.2 = 30입니다.' },
  { id: 'g5-eng-07', grade: 5, subject: 'english', q: '"milk"의 뜻은?', options: ['물', '우유', '주스', '빵'], answer: 1, exp: 'milk는 우유입니다.' },
  { id: 'g5-eng-08', grade: 5, subject: 'english', q: '"Good morning."의 뜻은?', options: ['좋은 아침', '잘 자', '고마워', '미안해'], answer: 0, exp: 'Good morning은 좋은 아침이라는 인사입니다.' },
  { id: 'g5-eng-09', grade: 5, subject: 'english', q: '"blue"는 어떤 색인가요?', options: ['빨간색', '파란색', '초록색', '검은색'], answer: 1, exp: 'blue는 파란색입니다.' },
  { id: 'g6-eng-07', grade: 6, subject: 'english', q: '"I have a pencil."의 뜻은?', options: ['나는 연필이 있다', '나는 공이 있다', '나는 책을 읽는다', '나는 학교에 간다'], answer: 0, exp: 'have는 가지고 있다는 뜻입니다.' },
  { id: 'g6-eng-08', grade: 6, subject: 'english', q: '"Can you help me?"의 뜻은?', options: ['도와줄 수 있니?', '어디 가니?', '무엇을 먹니?', '몇 시니?'], answer: 0, exp: 'Can you help me?는 도와줄 수 있니?입니다.' },
  { id: 'g6-eng-09', grade: 6, subject: 'english', q: '"fast"의 반대말은?', options: ['slow', 'big', 'cold', 'new'], answer: 0, exp: 'fast의 반대말은 slow입니다.' },
  { id: 'g3-math-13', grade: 3, subject: 'math', q: '48 ÷ 6 = ?', options: ['6', '7', '8', '9'], answer: 2, exp: '6 × 8 = 48이므로 답은 8입니다.' },
  { id: 'g3-math-14', grade: 3, subject: 'math', q: '320 + 150 = ?', options: ['460', '470', '480', '490'], answer: 1, exp: '320 + 150 = 470입니다.' },
  { id: 'g3-math-15', grade: 3, subject: 'math', q: '700 - 260 = ?', options: ['420', '430', '440', '450'], answer: 2, exp: '700 - 260 = 440입니다.' },
  { id: 'g3-math-16', grade: 3, subject: 'math', q: '6 × 7 = ?', options: ['36', '40', '42', '48'], answer: 2, exp: '6 × 7 = 42입니다.' },
  { id: 'g3-math-17', grade: 3, subject: 'math', q: '500원짜리 동전 2개는?', options: ['500원', '700원', '1000원', '1500원'], answer: 2, exp: '500원이 2개이면 1000원입니다.' },
  { id: 'g3-math-18', grade: 3, subject: 'math', q: '오각형의 변은 몇 개인가요?', options: ['4개', '5개', '6개', '7개'], answer: 1, exp: '오각형은 변이 5개입니다.' },
  { id: 'g3-math-19', grade: 3, subject: 'math', q: '3분은 몇 초인가요?', options: ['60초', '120초', '180초', '300초'], answer: 2, exp: '1분은 60초이므로 3분은 180초입니다.' },
  { id: 'g3-math-20', grade: 3, subject: 'math', q: '가장 작은 수는?', options: ['305', '350', '503', '530'], answer: 0, exp: '305가 가장 작습니다.' },
  { id: 'g4-math-13', grade: 4, subject: 'math', q: '2/7 + 3/7 = ?', options: ['3/7', '4/7', '5/7', '5/14'], answer: 2, exp: '분모가 같으므로 분자만 더해 5/7입니다.' },
  { id: 'g4-math-14', grade: 4, subject: 'math', q: '0.45는 분수로?', options: ['45/10', '45/100', '4/5', '1/45'], answer: 1, exp: '0.45는 45/100입니다.' },
  { id: 'g4-math-15', grade: 4, subject: 'math', q: '25 × 4 = ?', options: ['80', '90', '100', '120'], answer: 2, exp: '25 × 4 = 100입니다.' },
  { id: 'g4-math-16', grade: 4, subject: 'math', q: '168 ÷ 7 = ?', options: ['22', '23', '24', '25'], answer: 2, exp: '7 × 24 = 168이므로 답은 24입니다.' },
  { id: 'g4-math-17', grade: 4, subject: 'math', q: '예각은 90도보다?', options: ['작다', '같다', '크다', '항상 180도다'], answer: 0, exp: '예각은 90도보다 작은 각입니다.' },
  { id: 'g4-math-18', grade: 4, subject: 'math', q: '가로 8cm, 세로 3cm 직사각형의 둘레는?', options: ['11cm', '22cm', '24cm', '30cm'], answer: 1, exp: '둘레는 (8 + 3) × 2 = 22cm입니다.' },
  { id: 'g4-math-19', grade: 4, subject: 'math', q: '2.5 + 1.3 = ?', options: ['3.6', '3.8', '4.0', '4.2'], answer: 1, exp: '2.5 + 1.3 = 3.8입니다.' },
  { id: 'g4-math-20', grade: 4, subject: 'math', q: '9000은 1000이 몇 개인가요?', options: ['6개', '7개', '8개', '9개'], answer: 3, exp: '1000이 9개이면 9000입니다.' },
];

const getStudentGrade = (student, fallbackCode = '') => {
  const explicit = Number(student?.grade || student?.schoolGrade);
  if (explicit) return explicit;
  const code = student?.studentCode || fallbackCode || '';
  const match = String(code).match(/-(\d+)-/);
  return match ? Number(match[1]) : 5;
};

const pickStrategyQuestion = (student, fallbackCode = '') => {
  const grade = getStudentGrade(student, fallbackCode);
  const reviewGrade = Math.max(1, grade - 1);
  const mathPool = ARENA_STRATEGY_QUESTIONS.filter(q => q.subject === 'math' && q.grade === reviewGrade);
  const englishPool = grade >= 5
    ? ARENA_STRATEGY_QUESTIONS.filter(q => q.subject === 'english' && q.grade === Math.min(6, grade))
    : [];
  const pool = [...mathPool, ...englishPool];
  const fallback = ARENA_STRATEGY_QUESTIONS.filter(q => q.subject === 'math');
  const candidates = pool.length ? pool : fallback;
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
};

const applyLearningBuffToStats = (stats, buff) => {
  if (buff?.id !== 'review_power') return stats;
  return { ...stats, hp: (stats.hp || 0) + 15 };
};

// ── 전적 기록 화면 ────────────────────────────────────────────
function HistoryScreen({ studentDocId, studentCode, onBack }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentDocId) { setLoading(false); return; }
    (async () => {
      try {
        const [asMe, asOpp] = await Promise.all([
          getDocs(query(collection(db, 'arenaLogs'), where('studentId',   '==', studentDocId))),
          getDocs(query(collection(db, 'arenaLogs'), where('opponentId',  '==', studentDocId))),
        ]);
        const all = [
          ...asMe.docs.map(d  => ({ id: d.id,  ...d.data(),  perspective: 'me'  })),
          ...asOpp.docs.map(d => ({ id: d.id,  ...d.data(),  perspective: 'opp' })),
        ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLogs(all);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentDocId]);

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const wins  = logs.filter(l => l.perspective === 'me' ? l.isWin : !l.isWin).length;
  const loses = logs.filter(l => l.perspective === 'me' ? !l.isWin : l.isWin).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col p-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1.5 bg-slate-800 rounded-xl">← 뒤로</button>
        <h2 className="font-extrabold text-white text-lg">📋 전적 기록</h2>
      </div>

      {/* 승패 요약 */}
      {!loading && logs.length > 0 && (
        <div className="flex gap-3 mb-5">
          <div className="flex-1 bg-slate-900/60 rounded-2xl p-3 text-center border border-slate-700">
            <div className="text-2xl font-extrabold text-white">{logs.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">전체</div>
          </div>
          <div className="flex-1 bg-yellow-950/40 rounded-2xl p-3 text-center border border-yellow-700/40">
            <div className="text-2xl font-extrabold text-yellow-400">{wins}</div>
            <div className="text-xs text-slate-400 mt-0.5">승</div>
          </div>
          <div className="flex-1 bg-rose-950/40 rounded-2xl p-3 text-center border border-rose-800/40">
            <div className="text-2xl font-extrabold text-rose-400">{loses}</div>
            <div className="text-xs text-slate-400 mt-0.5">패</div>
          </div>
          <div className="flex-1 bg-indigo-950/40 rounded-2xl p-3 text-center border border-indigo-700/40">
            <div className="text-2xl font-extrabold text-indigo-400">
              {logs.length > 0 ? Math.round(wins / logs.length * 100) : 0}%
            </div>
            <div className="text-xs text-slate-400 mt-0.5">승률</div>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="text-slate-400 text-center py-10 animate-pulse">불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-4xl mb-3">⚔️</div>
          <p className="font-bold">아직 전적이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1">
          {logs.map(log => {
            // perspective: 'me' = 내가 도전자, 'opp' = 내가 상대로 매칭된 것
            const iWon = log.perspective === 'me' ? log.isWin : !log.isWin;
            const myName    = log.perspective === 'me' ? log.studentName  : log.opponentName;
            const enemyName = log.perspective === 'me' ? log.opponentName : log.studentName;

            // 상대방 이미지: 내가 도전자면 상대 이미지, 내가 상대로 매칭됐으면 도전자 이미지
            const enemyImg = log.perspective === 'me'
              ? log.opponentCharacterImage
              : log.studentCharacterImage;

            return (
              <div key={log.id}
                className={`rounded-2xl border p-4 flex items-center gap-3
                  ${iWon ? 'bg-yellow-950/30 border-yellow-700/40' : 'bg-rose-950/30 border-rose-800/40'}`}>
                {/* 승패 뱃지 */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0
                  ${iWon ? 'bg-yellow-500 text-yellow-900' : 'bg-slate-700 text-slate-400'}`}>
                  {iWon ? '승' : '패'}
                </div>

                {/* 상대 캐릭터 */}
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-600 overflow-hidden shrink-0 flex items-center justify-center">
                  {enemyImg
                    ? <img src={enemyImg} alt="" className="w-full h-full object-contain scale-[2]" />
                    : <span className="text-xl">🧑‍🎓</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-extrabold text-sm truncate">{enemyName}</span>
                    {log.perspective === 'opp' && (
                      <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">상대로 매칭됨</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{fmtDate(log.createdAt)}</div>
                </div>

                {/* 보상 */}
                {iWon && log.reward && (
                  <div className="text-right shrink-0">
                    {log.reward.gold    > 0 && <div className="text-xs text-amber-400 font-bold">🪙+{log.reward.gold}</div>}
                    {log.reward.diamond > 0 && <div className="text-xs text-cyan-400 font-bold">💎+{log.reward.diamond}</div>}
                    {log.reward.exp     > 0 && <div className="text-xs text-indigo-400 font-bold">⭐+{log.reward.exp}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 랭킹 화면 ────────────────────────────────────────────────
function RankingScreen({ classmates, studentDocId, onBack }) {
  const [ranks, setRanks]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classmates.length) { setLoading(false); return; }
    (async () => {
      try {
        const ids = classmates.map(s => s.id);
        // studentId 기준 로그 (최대 10개씩 in 쿼리)
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

        const stats = {}; // { id: { name, code, level, characterImage, wins, loses } }
        const initStat = (s) => {
          if (!stats[s.id]) stats[s.id] = {
            id: s.id, name: s.name || s.studentCode, code: s.studentCode,
            level: s.level || 1, characterImage: s.characterImage || '',
            wins: 0, loses: 0,
          };
        };
        classmates.forEach(initStat);

        for (const chunk of chunks) {
          const [asChallenger, asOpponent] = await Promise.all([
            getDocs(query(collection(db, 'arenaLogs'), where('studentId',  'in', chunk))),
            getDocs(query(collection(db, 'arenaLogs'), where('opponentId', 'in', chunk))),
          ]);
          asChallenger.docs.forEach(d => {
            const { studentId, opponentId, isWin } = d.data();
            if (stats[studentId])  isWin ? stats[studentId].wins++  : stats[studentId].loses++;
            if (stats[opponentId]) isWin ? stats[opponentId].loses++ : stats[opponentId].wins++;
          });
          asOpponent.docs.forEach(d => {
            const { studentId, opponentId, isWin } = d.data();
            // asChallenger와 중복 방지: opponentId가 chunk에 있고 studentId가 chunk에 없는 경우만
            if (!chunk.includes(studentId)) {
              if (stats[studentId])  isWin ? stats[studentId].wins++  : stats[studentId].loses++;
              if (stats[opponentId]) isWin ? stats[opponentId].loses++ : stats[opponentId].wins++;
            }
          });
        }

        const list = Object.values(stats)
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            const aTotal = a.wins + a.loses, bTotal = b.wins + b.loses;
            if (bTotal && aTotal) return (b.wins / bTotal) - (a.wins / aTotal);
            return bTotal - aTotal;
          });
        setRanks(list);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [classmates]);

  const MEDALS = ['🥇','🥈','🥉'];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col p-5">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1.5 bg-slate-800 rounded-xl">← 뒤로</button>
        <h2 className="font-extrabold text-white text-lg">🏆 투기장 랭킹</h2>
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-10 animate-pulse">집계 중...</div>
      ) : ranks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-4xl mb-3">🏆</div><p className="font-bold">아직 전적이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ranks.map((r, idx) => {
            const total   = r.wins + r.loses;
            const winRate = total > 0 ? Math.round(r.wins / total * 100) : 0;
            const isMe    = r.id === studentDocId;
            return (
              <div key={r.id}
                className={`rounded-2xl p-4 flex items-center gap-3 border
                  ${isMe ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-900/50 border-slate-700'}`}>
                {/* 순위 */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg font-extrabold
                  bg-slate-800 text-slate-300">
                  {idx < 3 ? MEDALS[idx] : <span className="text-sm">{idx + 1}</span>}
                </div>

                {/* 캐릭터 */}
                <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-600">
                  {r.characterImage
                    ? <img src={r.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" />
                    : <span className="text-2xl">🧑‍🎓</span>}
                </div>

                {/* 이름 + 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-extrabold text-sm truncate ${isMe ? 'text-indigo-300' : 'text-white'}`}>{r.name}</span>
                    {isMe && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full shrink-0">나</span>}
                  </div>
                  <div className="text-xs text-slate-500">Lv.{r.level} · {total}전 {r.wins}승 {r.loses}패</div>
                </div>

                {/* 승률 */}
                <div className="text-right shrink-0">
                  <div className={`text-base font-extrabold ${winRate >= 60 ? 'text-yellow-400' : winRate >= 40 ? 'text-slate-300' : 'text-rose-400'}`}>
                    {winRate}%
                  </div>
                  <div className="text-[10px] text-slate-500">{r.wins}승</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 전적 내부 (모달용) ────────────────────────────────────────
function HistoryInner({ studentDocId }) {
  const [logs, setLogs]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentDocId) { setLoading(false); return; }
    (async () => {
      try {
        const [asMe, asOpp] = await Promise.all([
          getDocs(query(collection(db, 'arenaLogs'), where('studentId',  '==', studentDocId))),
          getDocs(query(collection(db, 'arenaLogs'), where('opponentId', '==', studentDocId))),
        ]);
        const all = [
          ...asMe.docs.map(d  => ({ id: d.id, ...d.data(), perspective: 'me'  })),
          ...asOpp.docs.map(d => ({ id: d.id, ...d.data(), perspective: 'opp' })),
        ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setLogs(all);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [studentDocId]);

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const wins  = logs.filter(l => l.perspective === 'me' ? l.isWin  : !l.isWin).length;
  const loses = logs.filter(l => l.perspective === 'me' ? !l.isWin : l.isWin).length;

  if (loading) return <div className="text-slate-400 text-center py-8 animate-pulse">불러오는 중...</div>;
  if (logs.length === 0) return (
    <div className="text-center py-12 text-slate-500">
      <div className="text-4xl mb-3">⚔️</div><p className="font-bold">아직 전적이 없습니다</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="flex gap-2 mb-4">
        {[['전체', logs.length, 'text-white'], ['승', wins, 'text-yellow-400'], ['패', loses, 'text-rose-400'],
          [`${logs.length ? Math.round(wins/logs.length*100) : 0}%`, '승률', 'text-indigo-400']].map(([val, label, cls], i) => (
          <div key={i} className="flex-1 bg-slate-800 rounded-xl p-2 text-center border border-slate-700">
            <div className={`text-lg font-extrabold ${cls}`}>{i < 3 ? val : val}</div>
            <div className="text-[10px] text-slate-500">{i < 3 ? label : '승률'}</div>
          </div>
        ))}
      </div>
      {logs.map(log => {
        const iWon     = log.perspective === 'me' ? log.isWin : !log.isWin;
        const enemyName = log.perspective === 'me' ? log.opponentName : log.studentName;
        const enemyImg  = log.perspective === 'me' ? log.opponentCharacterImage : log.studentCharacterImage;
        return (
          <div key={log.id} className={`rounded-2xl border p-3 flex items-center gap-3
            ${iWon ? 'bg-yellow-950/30 border-yellow-700/40' : 'bg-rose-950/30 border-rose-800/40'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0
              ${iWon ? 'bg-yellow-500 text-yellow-900' : 'bg-slate-700 text-slate-400'}`}>
              {iWon ? '승' : '패'}
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-600 overflow-hidden shrink-0 flex items-center justify-center">
              {enemyImg ? <img src={enemyImg} alt="" className="w-full h-full object-contain scale-[2]" /> : <span className="text-xl">🧑‍🎓</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-white font-extrabold text-sm truncate">{enemyName}</span>
                {log.perspective === 'opp' && <span className="text-[9px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">상대로 매칭됨</span>}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{fmtDate(log.createdAt)}</div>
            </div>
            {iWon && log.reward && (
              <div className="text-right shrink-0 text-[11px] font-bold space-y-0.5">
                {log.reward.gold    > 0 && <div className="text-amber-400">🪙+{log.reward.gold}</div>}
                {log.reward.diamond > 0 && <div className="text-cyan-400">💎+{log.reward.diamond}</div>}
                {log.reward.exp     > 0 && <div className="text-indigo-400">⭐+{log.reward.exp}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 랭킹 내부 (모달용) ────────────────────────────────────────
function RankingInner({ classmates, studentDocId }) {
  const [ranks, setRanks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const MEDALS = ['🥇','🥈','🥉'];

  useEffect(() => {
    if (!classmates.length) { setLoading(false); return; }
    (async () => {
      try {
        const ids = classmates.map(s => s.id);
        const stats = {};
        classmates.forEach(s => {
          stats[s.id] = { id: s.id, name: s.name || s.studentCode, level: s.level || 1, characterImage: s.characterImage || '', wins: 0, loses: 0 };
        });
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        for (const chunk of chunks) {
          const snap = await getDocs(query(collection(db, 'arenaLogs'), where('studentId', 'in', chunk)));
          snap.docs.forEach(d => {
            const { studentId, opponentId, isWin } = d.data();
            if (stats[studentId])  isWin ? stats[studentId].wins++  : stats[studentId].loses++;
            if (stats[opponentId]) isWin ? stats[opponentId].loses++ : stats[opponentId].wins++;
          });
        }
        setRanks(Object.values(stats).sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : ((b.wins/(b.wins+b.loses||1)) - (a.wins/(a.wins+a.loses||1)))));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [classmates]);

  if (loading) return <div className="text-slate-400 text-center py-8 animate-pulse">집계 중...</div>;

  return (
    <div className="space-y-2">
      {ranks.map((r, idx) => {
        const total   = r.wins + r.loses;
        const winRate = total > 0 ? Math.round(r.wins / total * 100) : 0;
        const isMe    = r.id === studentDocId;
        return (
          <div key={r.id} className={`rounded-2xl p-3 flex items-center gap-3 border
            ${isMe ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-800/50 border-slate-700'}`}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-700 text-base font-extrabold">
              {idx < 3 ? MEDALS[idx] : <span className="text-sm text-slate-300">{idx+1}</span>}
            </div>
            <div className="w-14 h-14 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-600">
              {r.characterImage ? <img src={r.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" /> : <span className="text-2xl">🧑‍🎓</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-extrabold text-sm truncate ${isMe ? 'text-indigo-300' : 'text-white'}`}>{r.name}</span>
                {isMe && <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full shrink-0">나</span>}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Lv.{r.level} · {total}전 {r.wins}승 {r.loses}패</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-base font-extrabold ${winRate >= 60 ? 'text-yellow-400' : winRate >= 40 ? 'text-slate-300' : 'text-rose-400'}`}>{winRate}%</div>
              <div className="text-[10px] text-slate-500">{r.wins}승</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 캐릭터 카드 ───────────────────────────────────────────────
function CharacterCard({ student, label, isMe, highlight, rank, equipmentItems = [] }) {
  const stats = getStats(student, equipmentItems);  // 장비/업그레이드 보너스 포함
  const lv    = student?.level || 1;
  const maxHp = Math.max(1, Number(stats.hp) || 1);
  const hpPct = 100;

  return (
    <div className={`flex flex-col items-center rounded-3xl p-5 transition-all
      ${highlight ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20' : ''}
      ${isMe ? 'bg-indigo-950/60' : 'bg-rose-950/60'}`}>

      {/* 라벨 */}
      <div className={`text-[10px] font-extrabold px-3 py-0.5 rounded-full mb-3
        ${isMe ? 'bg-indigo-500 text-white' : 'bg-rose-500 text-white'}`}>
        {label}
      </div>

      {/* 캐릭터 이미지 */}
      <div className="w-36 h-36 rounded-2xl bg-slate-800 border border-slate-600 overflow-hidden flex items-center justify-center mb-3 relative">
        {student?.characterImage ? (
          <img src={student.characterImage} alt="" className="w-full h-full object-contain scale-[2.5]" />
        ) : (
          <span className="text-5xl">🧑‍🎓</span>
        )}
        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-extrabold px-2 py-0.5 rounded-full
          ${isMe ? 'bg-indigo-500' : 'bg-rose-500'} text-white whitespace-nowrap`}>
          Lv.{lv}
        </div>
      </div>

      {/* 이름 + 랭킹 */}
      <div className="flex flex-col items-center mb-1">
        <div className="font-extrabold text-white text-sm truncate max-w-[120px]">
          {student?.name || student?.studentCode || '???'}
        </div>
        {rank != null && (
          <div className="text-[10px] font-bold text-slate-400 mt-0.5">
            {rank === 0 ? '🥇 1위' : rank === 1 ? '🥈 2위' : rank === 2 ? '🥉 3위' : `${rank + 1}위`}
          </div>
        )}
      </div>

      {/* HP 바 */}
      <div className="w-full mb-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span className="font-bold">HP</span>
          <span className="font-extrabold text-slate-200">{maxHp} / {maxHp}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isMe ? 'bg-indigo-400' : 'bg-rose-400'}`}
            style={{ width: `${hpPct}%` }} />
        </div>
      </div>

      {/* 스탯 */}
      <div className="w-full space-y-2.5 mt-1">
        {STAT_META.map(s => (
          <div key={s.key} className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 text-base font-bold">
              {s.img
                ? <img src={s.img} alt="" className="w-5 h-5 object-contain" />
                : <span className="text-base">{s.icon}</span>}
              {s.label}
            </span>
            <span className="font-extrabold text-white text-2xl">{stats[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const buildBattleSummary = ({ stats, isWin, myName, oppName, finalMyHP, myMaxHP, finalOppHP, oppMaxHP, learningBuff }) => {
  const hpPct = myMaxHP ? finalMyHP / myMaxHP : 0;
  const oppHpPct = oppMaxHP ? finalOppHP / oppMaxHP : 0;
  let title = isWin ? '투기장 승자' : '다음 대련 준비 중';
  let subtitle = isWin ? `${oppName}을(를) 제압했습니다.` : `${oppName}에게 아쉽게 패배했습니다.`;

  if (isWin && hpPct <= 0.25) {
    title = '역전승의 주인공';
    subtitle = `HP ${finalMyHP}만 남기고 버텨낸 승리입니다.`;
  } else if (isWin && oppHpPct <= 0 && hpPct >= 0.75) {
    title = '압도적 승리';
    subtitle = '상대를 크게 흔들며 전투를 끝냈습니다.';
  } else if (isWin && stats.maxDamage >= 120) {
    title = '한 방의 지배자';
    subtitle = `${stats.maxDamage} 데미지로 경기 흐름을 가져왔습니다.`;
  } else if (stats.crits >= 2) {
    title = isWin ? '치명타 장인' : '날카로운 도전자';
    subtitle = `치명타 ${stats.crits}회로 강한 압박을 만들었습니다.`;
  } else if (stats.dodges >= 2) {
    title = isWin ? '회피의 달인' : '민첩한 도전자';
    subtitle = `공격 ${stats.dodges}회를 회피했습니다.`;
  } else if (stats.guards > 0) {
    title = isWin ? '철벽 전술가' : '끈질긴 수비수';
    subtitle = '방어 태세로 큰 피해를 줄였습니다.';
  } else if (stats.heals > 0) {
    title = isWin ? '생존 전문가' : '끝까지 버틴 전사';
    subtitle = '위기에서 회복으로 한 번 더 버텼습니다.';
  }

  const highlights = [];
  if (stats.maxDamage > 0) highlights.push(`최고 데미지: ${stats.maxDamage} (${stats.maxDamageLabel || '공격'})`);
  if (stats.finalBlow) highlights.push(`마지막 일격: ${stats.finalBlow}`);
  if (stats.heals > 0) highlights.push(`회복 발동: ${stats.heals}회`);
  if (stats.dodges > 0) highlights.push(`회피 성공: ${stats.dodges}회`);
  if (stats.guards > 0) highlights.push(`방어 태세: ${stats.guards}회`);
  if (stats.powerHits > 0) highlights.push(`강타 사용: ${stats.powerHits}회`);
  if (learningBuff) highlights.push(`전략 퀴즈 버프: ${learningBuff.name}`);

  return {
    title,
    subtitle,
    highlights: highlights.slice(0, 4),
    turns: stats.turns,
    resultLine: isWin ? `${myName} 승리` : `${oppName} 승리`,
  };
};

// ── 결과 화면 ─────────────────────────────────────────────────
function ResultScreen({ isWin, opponent, reward, battleSummary, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isWin) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const COLORS = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#FF9F43'];
    const SHAPES = ['circle','star','rect'];
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 4,
      vy: 1.5 + Math.random() * 4,
      size: 6 + Math.random() * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.2,
      opacity: 1,
    }));

    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.08;
        p.rot += p.rotV;
        if (p.y < canvas.height + 20) { alive = true; p.opacity = Math.max(0, 1 - p.y / canvas.height); }
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle   = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
        } else if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          // star
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const b = (i * 4 * Math.PI) / 5 + Math.PI / 5 - Math.PI / 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * p.size / 2, Math.sin(a) * p.size / 2);
            else ctx.lineTo(Math.cos(a) * p.size / 2, Math.sin(a) * p.size / 2);
            ctx.lineTo(Math.cos(b) * p.size / 4, Math.sin(b) * p.size / 4);
          }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });
      if (alive) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isWin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {isWin && (
        <canvas ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }} />
      )}
      <div className={`relative bg-slate-900 rounded-3xl p-6 w-full max-w-md text-center border shadow-2xl max-h-[92vh] overflow-y-auto
        ${isWin ? 'border-yellow-600/60 shadow-yellow-900/40' : 'border-slate-700'}`}>
        <div className="text-6xl mb-4">{isWin ? '🏆' : '💀'}</div>
        <h2 className={`text-3xl font-extrabold mb-2 ${isWin ? 'text-yellow-400' : 'text-slate-400'}`}>
          {isWin ? '승리!' : '패배'}
        </h2>
        <p className="text-slate-400 text-sm mb-6">
          {isWin
            ? `${opponent?.name || '상대'}를 물리쳤습니다!`
            : `${opponent?.name || '상대'}에게 패배했습니다.`}
        </p>

        {battleSummary && (
          <div className="mb-5 rounded-2xl border border-indigo-500/40 bg-indigo-950/40 p-4 text-left">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">Battle Title</div>
            <div className="mt-1 text-xl font-black text-white">{battleSummary.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{battleSummary.subtitle}</p>
            {battleSummary.highlights?.length > 0 && (
              <div className="mt-3 rounded-xl bg-slate-950/55 p-3">
                <div className="mb-2 text-[10px] font-extrabold text-amber-300">하이라이트</div>
                <div className="space-y-1.5">
                  {battleSummary.highlights.map((line, index) => (
                    <div key={index} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="mt-0.5 text-amber-300">◆</span>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 보상 */}
        <div className={`rounded-2xl p-4 mb-6 ${isWin ? 'bg-yellow-950/60 border border-yellow-700' : 'bg-slate-800 border border-slate-700'}`}>
          <div className={`text-xs font-bold mb-3 ${isWin ? 'text-yellow-400' : 'text-slate-400'}`}>
            {isWin ? '🎁 획득 보상' : '위로 보상'}
          </div>
          <div className="flex justify-center gap-5">
            {reward.gold    > 0 && <div className="flex flex-col items-center"><span className="text-xl">🪙</span><span className="text-yellow-300 font-extrabold text-sm">+{reward.gold}G</span></div>}
            {reward.diamond > 0 && <div className="flex flex-col items-center"><span className="text-xl">💎</span><span className="text-cyan-300 font-extrabold text-sm">+{reward.diamond}</span></div>}
            {reward.exp     > 0 && <div className="flex flex-col items-center"><span className="text-xl">⭐</span><span className="text-indigo-300 font-extrabold text-sm">+{reward.exp}</span></div>}
          </div>
        </div>

        <button onClick={onClose}
          className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold transition-all active:scale-95">
          확인
        </button>
      </div>
    </div>
  );
}

// ── 메인 ─────────────────────────────────────────────────────
export default function Arena2({ studentCode, tickets, onUseTicket }) {
  // sessionStorage로 매칭 상태 유지 (네비게이션 이동해도 상대 유지)
  const savedMatch = (() => { try { return JSON.parse(sessionStorage.getItem('arenaMatch') || 'null'); } catch { return null; } })();

  const [phase, setPhase]         = useState(savedMatch ? 'vs' : 'lobby');
  const [opponent, setOpponent]   = useState(savedMatch?.opponent || null);
  const [changes, setChanges]     = useState(savedMatch?.changes ?? 0);
  const [battleLog, setBattleLog] = useState([]);
  const [battleHP, setBattleHP]   = useState({ me: 0, opp: 0 });
  const [battleMaxHP, setBattleMaxHP] = useState({ me: 0, opp: 0 });
  const [battleFx, setBattleFx]   = useState({ actor: null, target: null, kind: null, isCrit: false, seq: 0 });
  const [floatTexts, setFloatTexts] = useState([]);
  const [battleBanner, setBattleBanner] = useState('전투 준비');
  const [battleWinner, setBattleWinner] = useState(null);
  const logRef = useRef(null);
  const battleFxTimerRef = useRef(null);
  const floatSeqRef = useRef(0);

  useEffect(() => () => {
    if (battleFxTimerRef.current) clearTimeout(battleFxTimerRef.current);
  }, []);

  const addFloatText = (side, text, kind = 'damage', isCrit = false) => {
    const id = ++floatSeqRef.current;
    setFloatTexts(items => [...items, { id, side, text, kind, isCrit }]);
    setTimeout(() => {
      setFloatTexts(items => items.filter(item => item.id !== id));
    }, kind === 'finish' ? FINAL_STRIKE_FX_MS : 1100);
  };

  const getActorRect = (side) => {
    const el = side === 'me' ? meBattleRef.current : oppBattleRef.current;
    return el?.getBoundingClientRect?.() || null;
  };

  const triggerBattleFx = ({ actor, target, kind = 'attack', damage = 0, isCrit = false, text = null }) => {
    if (battleFxTimerRef.current) clearTimeout(battleFxTimerRef.current);
    const isFinisher = kind === 'finish';
    setBattleFx(prev => ({ actor, target, kind, isCrit: isCrit || isFinisher, seq: prev.seq + 1 }));

    if (text) {
      addFloatText(target || actor, text, kind === 'heal' ? 'heal' : kind === 'dodge' ? 'dodge' : kind, isCrit || isFinisher);
    } else if (damage > 0 && target) {
      addFloatText(target, `${isFinisher ? 'FINISH ' : isCrit ? 'CRIT ' : ''}-${damage}`, isFinisher ? 'finish' : 'damage', isCrit || isFinisher);
    }

    if (actor && target && kind !== 'dodge' && kind !== 'heal' && kind !== 'guard') {
      const fromR = getActorRect(actor);
      const toR = getActorRect(target);
      if (fromR && toR) {
        fireProjectile({
          from: { x: fromR.left + fromR.width / 2, y: fromR.top + fromR.height * 0.48 },
          to:   { x: toR.left + toR.width / 2, y: toR.top + toR.height * 0.48 },
          type: isFinisher || isCrit ? 'fire' : kind === 'power' ? 'energy' : 'magic',
          power: isFinisher ? 1.85 : isCrit ? 1.35 : kind === 'power' ? 1.2 : 1,
        });
      }
    }

    battleFxTimerRef.current = setTimeout(() => {
      setBattleFx(prev => ({ ...prev, actor: null, target: null, kind: null, isCrit: false }));
      battleFxTimerRef.current = null;
    }, isFinisher ? FINAL_STRIKE_FX_MS : isCrit ? 760 : 620);
  };

  // 매칭 상태 저장
  const saveMatch = (opp, ch) => {
    sessionStorage.setItem('arenaMatch', JSON.stringify({ opponent: opp, changes: ch }));
  };
  const clearMatch = () => sessionStorage.removeItem('arenaMatch');

  // 최근 대련 상대 기록 (세션 내 중복 방지)
  const recentOpponents = useRef(
    (() => { try { return JSON.parse(sessionStorage.getItem('arenaRecent') || '[]'); } catch { return []; } })()
  );
  const addRecentOpponent = (id) => {
    const list = [id, ...recentOpponents.current.filter(x => x !== id)].slice(0, 5);
    recentOpponents.current = list;
    sessionStorage.setItem('arenaRecent', JSON.stringify(list));
  };

  const [me, setMe]               = useState(null);
  const [classmates, setClassmates] = useState([]);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [isBusy, setIsBusy]       = useState(false);
  const [result, setResult]       = useState(null);
  const [rankMap, setRankMap]     = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [ticketUsedMsg, setTicketUsedMsg] = useState(false);
  const [matchAnim, setMatchAnim] = useState(false);
  const [strategyQuiz, setStrategyQuiz] = useState(null);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizOutcome, setQuizOutcome] = useState(null);
  const [learningBuff, setLearningBuff] = useState(null);
  const studentDocIdRef           = useRef(null);
  const meBattleRef               = useRef(null);
  const oppBattleRef              = useRef(null);
  const arenaTickets              = tickets?.arena ?? 0;

  // VS 단계에서 다음 전투의 HP/최대 HP를 미리 맞춰 stale 상태를 방지
  useEffect(() => {
    if (phase !== 'vs' || !me || !opponent) return;
    const myStats = getStats(me, equipmentItems);
    const oppStats = getStats(opponent, equipmentItems);
    const nextMeMax = Math.max(1, Number(myStats.hp) || 1);
    const nextOppMax = Math.max(1, Number(oppStats.hp) || 1);
    setBattleMaxHP({ me: nextMeMax, opp: nextOppMax });
    setBattleHP({ me: nextMeMax, opp: nextOppMax });
  }, [phase, me, opponent, equipmentItems]);

  // 내 정보 + 우리반 로드
  useEffect(() => {
    if (!studentCode) return;
    (async () => {
      try {
        const meSnap = await getDocs(query(collection(db, 'students'), where('studentCode', '==', studentCode)));
        if (meSnap.empty) return;
        const meDoc = meSnap.docs[0];
        studentDocIdRef.current = meDoc.id;
        setMe({ id: meDoc.id, ...meDoc.data() });

        const tid = meDoc.data().teacherUid;
        const q   = tid
          ? query(collection(db, 'students'), where('teacherUid', '==', tid))
          : collection(db, 'students');
        const snap = await getDocs(q);
        const isTestAccount = meDoc.data().studentCode === 'SINSEOK-5-15';
        const others = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => {
            if (s.id === meDoc.id) return false; // 나 자신 제외
            // 내가 테스트 계정이 아니면 SINSEOK-5-15를 상대 풀에서 제외
            if (!isTestAccount && s.studentCode === 'SINSEOK-5-15') return false;
            return true;
          });
        setClassmates(others);

        // 레벨 기반 임시 rankMap (대전 기록 없어도 표시)
        const all = [{ id: meDoc.id, ...meDoc.data() }, ...others]
          .sort((a, b) => (b.level || 1) - (a.level || 1));
        const rm = {};
        all.forEach((s, i) => { rm[s.id] = i; });
        setRankMap(rm);

        const equipSnap = await getDocs(collection(db, 'equipmentItems'));
        setEquipmentItems(equipSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    })();
  }, [studentCode]);

  const pickRandom = (excludeId = null) => {
    const recent = recentOpponents.current;
    // 최근 상대 + 현재 상대 제외한 풀
    let pool = classmates.filter(s => s.id !== excludeId && !recent.includes(s.id));
    // 풀이 비면 최근 상대 제한 완화 (현재 상대만 제외)
    if (pool.length === 0) pool = classmates.filter(s => s.id !== excludeId);
    // 그래도 비면 전체
    if (pool.length === 0) pool = classmates;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  // 매칭 시작
  const startMatching = async () => {
    if (arenaTickets <= 0 || isBusy) return;
    setIsBusy(true);
    try {
      await onUseTicket('arena'); // 매칭 시작 즉시 이용권 차감
      setTicketUsedMsg(true);
      setTimeout(() => setTicketUsedMsg(false), 2500);
    } catch (e) {
      setIsBusy(false);
      return;
    }
    setMatchAnim(true);
    setPhase('matching');
    await new Promise(r => setTimeout(r, 1800));
    const opp = pickRandom();
    setOpponent(opp);
    setChanges(0);
    saveMatch(opp, 0);
    setMatchAnim(false);
    setPhase('vs');
    setIsBusy(false);
  };

  // 상대 바꾸기
  const changeOpponent = async () => {
    if (changes >= MAX_CHANGES || isBusy) return;
    const myData = me;
    if ((myData?.diamonds || 0) < CHANGE_COST) return alert(`💎 부족! ${CHANGE_COST}💎 필요`);
    setIsBusy(true);
    try {
      const docId = studentDocIdRef.current;
      await updateDoc(doc(db, 'students', docId), {
        diamonds: (myData.diamonds || 0) - CHANGE_COST,
      });
      setMe(prev => ({ ...prev, diamonds: (prev.diamonds || 0) - CHANGE_COST }));
      setMatchAnim(true);
      await new Promise(r => setTimeout(r, 600));
      const opp = pickRandom(opponent?.id);
      const newChanges = changes + 1;
      setOpponent(opp);
      setChanges(newChanges);
      saveMatch(opp, newChanges);
      setMatchAnim(false);
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  const openStrategyQuiz = () => {
    if (isBusy) return;
    const question = pickStrategyQuestion(me, studentCode);
    if (!question) {
      setLearningBuff(null);
      startBattle(null);
      return;
    }
    setStrategyQuiz(question);
    setQuizAnswer(null);
    setQuizOutcome(null);
    setLearningBuff(null);
  };

  const answerStrategyQuiz = (index) => {
    if (!strategyQuiz || quizOutcome) return;
    const correct = index === strategyQuiz.answer;
    const randomBuff = correct ? LEARNING_BUFFS[Math.floor(Math.random() * LEARNING_BUFFS.length)] : null;
    setQuizAnswer(index);
    setQuizOutcome({ correct, buff: randomBuff });
    setLearningBuff(randomBuff);
  };

  const startBattleWithBuff = (buff) => {
    setLearningBuff(buff || null);
    setStrategyQuiz(null);
    setQuizAnswer(null);
    setQuizOutcome(null);
    startBattle(buff || null);
  };

  // ── 데미지 계산 ──────────────────────────────────────────────
  const calcDmg = (atkStats, defStats, { power = 1, guarded = false, damageMultiplier = 1 } = {}) => {
    const variance = 0.92 + Math.random() * 0.16;
    const raw = Math.max(1, (atkStats.attack * power) - Math.floor(defStats.defense * 0.45));
    const isCrit = Math.random() * 100 < atkStats.crit;
    let dmg = Math.floor(raw * variance * (isCrit ? 1.6 : 1));
    if (guarded) return { dmg: 0, isCrit: false };
    dmg = Math.max(1, Math.floor(dmg * damageMultiplier));
    return { dmg, isCrit };
  };

  // ── 대련 시작 (자동 턴제) ─────────────────────────────────────
  const startBattle = async (selectedBuff = learningBuff) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      clearMatch(); // 전투 시작 시 매칭 초기화

      const activeLearningBuff = selectedBuff || null;
      const baseMyStats = applyLearningBuffToStats(getStats(me, equipmentItems), activeLearningBuff);
      const oppStats = getStats(opponent, equipmentItems);
      const underdogBonus = getUnderdogBonus(baseMyStats, oppStats);
      const myStats = underdogBonus.active
        ? {
            ...baseMyStats,
            dodge: Math.min(45, (baseMyStats.dodge || 0) + underdogBonus.dodgeBonus),
            crit: Math.min(35, (baseMyStats.crit || 0) + underdogBonus.critBonus),
          }
        : baseMyStats;
      const myMaxHP = Math.max(1, Number(myStats.hp) || 1);
      const oppMaxHP = Math.max(1, Number(oppStats.hp) || 1);
      let myHP  = myMaxHP;
      let oppHP = oppMaxHP;

      setBattleMaxHP({ me: myMaxHP, opp: oppMaxHP });
      setBattleHP({ me: myMaxHP, opp: oppMaxHP });
      setBattleLog([]);
      setBattleFx({ actor: null, target: null, kind: null, isCrit: false, seq: 0 });
      setFloatTexts([]);
      setBattleBanner('전투 준비');
      setBattleWinner(null);
      if (battleFxTimerRef.current) { clearTimeout(battleFxTimerRef.current); battleFxTimerRef.current = null; }
      setPhase('battle');

      const myName  = me?.name  || me?.studentCode  || '나';
      const oppName = opponent?.name || opponent?.studentCode || '상대';
      const log = [];
      const addLog = (msg, type = 'normal') => { log.push({ msg, type }); };

      // 공격 속도에 따른 선공 결정 (동일 속도면 랜덤)
      const myFirst = myStats.attackSpeed > oppStats.attackSpeed ||
        (myStats.attackSpeed === oppStats.attackSpeed && Math.random() < 0.5);
      addLog(`⚔️ 대련 시작! ${myFirst ? myName : oppName}이(가) 선공!`, 'system');
      if (underdogBonus.active) {
        addLog(`🔥 역전 기회! 상대가 더 강해서 회피 +${underdogBonus.dodgeBonus}, 치명타 +${underdogBonus.critBonus} 보정이 적용됩니다.`, 'system');
      }
      setBattleBanner(`${myFirst ? myName : oppName} 선공`);

      const TURN_MS  = 1100;
      const MAX_TURN = 20;
      const actionCount = { me: 0, opp: 0 };
      const healUsed = { me: false, opp: false };
      const guardUsed = { me: false, opp: false };
      const guarding = { me: false, opp: false };
      let calmReady = activeLearningBuff?.id === 'calm';
      let insightReady = activeLearningBuff?.id === 'insight';
      const order = myFirst ? ['me', 'opp'] : ['opp', 'me'];
      const actorData = {
        me:  { stats: myStats,  name: myName,  enemyName: oppName },
        opp: { stats: oppStats, name: oppName, enemyName: myName },
      };
      const battleStats = {
        turns: 0,
        maxDamage: 0,
        maxDamageLabel: '',
        crits: 0,
        dodges: 0,
        heals: 0,
        guards: 0,
        powerHits: 0,
        finalBlow: '',
      };

      for (let turn = 1; turn <= MAX_TURN; turn++) {
        if (myHP <= 0 || oppHP <= 0) break;
        await new Promise(r => setTimeout(r, TURN_MS));
        if (myHP <= 0 || oppHP <= 0) break;
        battleStats.turns = turn;

        const side = order[(turn - 1) % 2];
        const target = side === 'me' ? 'opp' : 'me';
        const actorHP = side === 'me' ? myHP : oppHP;
        const actorMaxHP = side === 'me' ? myMaxHP : oppMaxHP;
        const targetStats = target === 'me' ? myStats : oppStats;
        const actor = actorData[side];
        actionCount[side] += 1;

        if (!healUsed[side] && actorHP <= actorMaxHP * 0.3) {
          const heal = Math.max(18, Math.floor(actorMaxHP * 0.24));
          if (side === 'me') myHP = Math.min(myMaxHP, myHP + heal);
          else oppHP = Math.min(oppMaxHP, oppHP + heal);
          healUsed[side] = true;
          if (side === 'me') battleStats.heals += 1;
          addLog(`✨ ${actor.name}이(가) 회복을 사용했습니다. HP +${heal}`, 'heal');
          setBattleBanner('회복');
          triggerBattleFx({ actor: side, target: side, kind: 'heal', text: `+${heal}` });
        } else if (!guardUsed[side] && actorHP <= actorMaxHP * 0.45) {
          guardUsed[side] = true;
          guarding[side] = true;
          if (side === 'me') battleStats.guards += 1;
          addLog(`🛡️ ${actor.name}이(가) 방어 태세를 취했습니다. 다음 피해 감소!`, 'guard');
          setBattleBanner('방어 태세');
          triggerBattleFx({ actor: side, target: side, kind: 'guard', text: 'GUARD' });
        } else {
          const isPower = actionCount[side] % 3 === 0;
          const calmBonus = target === 'me' && calmReady ? 10 : 0;
          const dodgeChance = Math.min(60, (targetStats.dodge || 0) + calmBonus);
          const dodged = Math.random() * 100 < dodgeChance;
          const skillName = isPower ? '강타' : '공격';
          if (target === 'me' && calmReady) calmReady = false;

          if (dodged) {
            if (target === 'me') battleStats.dodges += 1;
            addLog(`💨 ${actor.enemyName}이(가) ${actor.name}의 ${skillName}을 회피했습니다!`, 'dodge');
            setBattleBanner('회피');
            triggerBattleFx({ actor: side, target, kind: 'dodge', text: 'MISS' });
          } else {
            const guarded = guarding[target];
            const focusPower = side === 'me' && activeLearningBuff?.id === 'focus' && actionCount.me <= 3 ? 1.1 : 1;
            const insightActive = target === 'me' && side === 'opp' && isPower && insightReady;
            const underdogDamageMultiplier = side === 'me'
              ? underdogBonus.damageDealtMultiplier
              : target === 'me'
                ? underdogBonus.damageTakenMultiplier
                : 1;
            const { dmg, isCrit } = calcDmg(actor.stats, targetStats, {
              power: (isPower ? 1.5 : 1) * focusPower,
              guarded,
              damageMultiplier: (insightActive ? 0.55 : 1) * underdogDamageMultiplier,
            });
            if (insightActive) insightReady = false;
            guarding[target] = false;

            if (target === 'me') myHP = Math.max(0, myHP - dmg);
            else oppHP = Math.max(0, oppHP - dmg);

            const critText = isCrit ? '💥 크리티컬! ' : '';
            const guardText = guarded ? ' 방어 성공.' : insightActive ? ' 분석으로 강타 피해 감소.' : '';
            addLog(`${critText}${actor.name}의 ${skillName} → ${dmg} 데미지.${guardText}`, isCrit ? 'crit' : isPower ? 'skill' : 'attack');
            if (side === 'me') {
              if (isCrit) battleStats.crits += 1;
              if (isPower) battleStats.powerHits += 1;
              if (dmg > battleStats.maxDamage) {
                battleStats.maxDamage = dmg;
                battleStats.maxDamageLabel = `${skillName}${isCrit ? ' / 치명타' : ''}`;
              }
            }
            const nextTargetHP = target === 'me' ? myHP : oppHP;
            const isFinisher = nextTargetHP <= 0;
            setBattleBanner(guarded ? '방어 성공' : isFinisher ? 'FINAL STRIKE' : isCrit ? 'CRITICAL' : isPower ? '강타' : '공격');
            triggerBattleFx({
              actor: guarded ? target : side,
              target,
              kind: guarded ? 'guard' : isFinisher ? 'finish' : isPower ? 'power' : 'attack',
              damage: dmg,
              isCrit,
              text: guarded ? 'BLOCK' : null,
            });

            if (nextTargetHP <= 0) {
              battleStats.finalBlow = `${actor.name}의 ${skillName}`;
              addLog(`⚡ 최후의 일격! ${actor.name}이(가) ${actor.enemyName}을(를) 쓰러뜨렸습니다!`, 'result');
            }
          }
        }

        setBattleHP({
          me: Math.max(0, Math.min(myHP, myMaxHP)),
          opp: Math.max(0, Math.min(oppHP, oppMaxHP)),
        });
        setBattleLog([...log]);
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }

      // 결과 판정
      const isWin = myHP > oppHP;
      addLog(isWin ? `🏆 ${myName} 승리!` : `💀 ${oppName} 승리!`, 'result');
      const battleSummary = buildBattleSummary({
        stats: battleStats,
        isWin,
        myName,
        oppName,
        finalMyHP: myHP,
        myMaxHP,
        finalOppHP: oppHP,
        oppMaxHP,
        learningBuff: activeLearningBuff,
      });
      setBattleWinner(isWin ? 'me' : 'opp');
      setBattleBanner(isWin ? `${myName} 승리` : `${oppName} 승리`);
      setBattleLog([...log]);

      const reward = isWin ? WIN_REWARD : LOSE_REWARD;
      const docId  = studentDocIdRef.current;

      // 보상 지급
      const { level, exp, maxExp } = calcLevelUp(me.level, me.exp, reward.exp);
      await updateDoc(doc(db, 'students', docId), {
        gold:     (me.gold     || 0) + reward.gold,
        diamonds: (me.diamonds || 0) + reward.diamond,
        exp, level, maxExp,
      });
      setMe(prev => ({ ...prev, gold: (prev.gold||0)+reward.gold, diamonds: (prev.diamonds||0)+reward.diamond, exp, level, maxExp }));

      // 방금 싸운 상대 기록 (다음 매칭에서 제외)
      if (opponent?.id) addRecentOpponent(opponent.id);

      await addDoc(collection(db, 'arenaLogs'), {
        studentId: docId, studentCode: me.studentCode, studentName: myName,
        studentCharacterImage: me.characterImage || '',
        opponentId: opponent?.id, opponentCode: opponent?.studentCode, opponentName: oppName,
        opponentCharacterImage: opponent?.characterImage || '',
        learningBuff: activeLearningBuff ? { id: activeLearningBuff.id, name: activeLearningBuff.name } : null,
        isWin, reward, createdAt: serverTimestamp(),
      });

      await new Promise(r => setTimeout(r, (battleStats.finalBlow ? FINAL_STRIKE_FX_MS : 0) + VICTORY_FX_MS));
      setResult({ isWin, reward, battleSummary });
      setPhase('result');
    } catch (e) { console.error(e); }
    finally { setIsBusy(false); }
  };

  const reset = () => {
    clearMatch();
    setPhase('lobby');
    setOpponent(null);
    setChanges(0);
    setResult(null);
    setStrategyQuiz(null);
    setQuizAnswer(null);
    setQuizOutcome(null);
    setLearningBuff(null);
  };

  // ── 로비 ────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">🏟️</div>
        <h1 className="text-3xl font-extrabold text-white mb-2">투기장</h1>
        <p className="text-slate-400 text-sm mb-8 text-center">
          우리반 친구와 1:1 대련으로 실력을 겨뤄보세요!
        </p>

        {/* 내 캐릭터 미리보기 */}
        {me && (
          <div className="bg-slate-900/60 rounded-2xl px-6 pt-5 pb-4 mb-6 flex flex-col items-center gap-2 border border-slate-700 w-full max-w-xs">
            <div className="w-full h-56 flex items-center justify-center overflow-hidden">
              {me.characterImage
                ? <img src={me.characterImage} alt="" className="w-full h-full object-contain"
                    style={{ imageRendering: 'pixelated', transform: 'scaleX(-1) scale(2.2)', transformOrigin: 'center' }} />
                : <span className="text-7xl">🧑‍🎓</span>}
            </div>
            <div className="text-center">
              <div className="font-extrabold text-white text-base">{me.name || me.studentCode}</div>
              <div className="text-violet-400 font-bold text-sm mt-0.5">Lv.{me.level || 1}</div>
            </div>
          </div>
        )}

        {/* 보상 안내 */}
        <div className="bg-yellow-950/40 border border-yellow-700/50 rounded-2xl px-5 py-3 mb-6 w-full max-w-xs">
          <div className="text-xs font-bold text-yellow-400 mb-2">🏆 승리 보상</div>
          <div className="flex justify-around text-sm font-extrabold">
            <span className="text-amber-300">🪙 {WIN_REWARD.gold}G</span>
            <span className="text-cyan-300">💎 {WIN_REWARD.diamond}</span>
            <span className="text-indigo-300">⭐ {WIN_REWARD.exp}</span>
          </div>
        </div>

        {/* 이용권 + 입장 버튼 */}
        <div className="flex items-center gap-2 mb-4 text-sm text-slate-400">
          <span>🏟️ 이용권</span>
          <span className={`font-extrabold ${arenaTickets > 0 ? 'text-violet-400' : 'text-rose-400'}`}>
            {arenaTickets}장
          </span>
        </div>

        <button onClick={startMatching} disabled={arenaTickets <= 0 || isBusy || classmates.length === 0}
          className={`w-full max-w-xs py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-95 shadow-lg
            ${arenaTickets > 0 && classmates.length > 0
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-violet-900'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
          {classmates.length === 0 ? '대전 상대 없음' : arenaTickets <= 0 ? '이용권 없음' : '⚔️ 대전 상대 찾기'}
        </button>

        <div className="flex gap-2 w-full max-w-xs mt-2">
          <button onClick={() => setShowHistory(true)}
            className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            📋 전적 기록
          </button>
          <button onClick={() => setShowRanking(true)}
            className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            🏆 랭킹
          </button>
        </div>
      </div>

      {strategyQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-indigo-500/35 bg-slate-900 p-5 shadow-2xl shadow-indigo-950/50">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-300">
                  {strategyQuiz.subject === 'english' ? '영어' : '수학'} · 쉬운 복습
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  정답이면 전투 버프가 랜덤으로 적용됩니다
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-slate-500">복습</div>
                <div className="text-sm font-black text-white">{strategyQuiz.grade}학년</div>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <div className="text-lg font-black leading-snug text-white">{strategyQuiz.q}</div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {strategyQuiz.options.map((option, index) => {
                const selected = quizAnswer === index;
                const isCorrectOption = quizOutcome && index === strategyQuiz.answer;
                const isWrongSelected = quizOutcome && selected && !isCorrectOption;
                return (
                  <button key={`${strategyQuiz.id}-${index}`} type="button" disabled={!!quizOutcome || isBusy}
                    onClick={() => answerStrategyQuiz(index)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-extrabold transition-all active:scale-[0.98] disabled:cursor-default
                      ${isCorrectOption
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-100'
                        : isWrongSelected
                          ? 'border-rose-400 bg-rose-500/15 text-rose-100'
                          : selected
                            ? 'border-indigo-400 bg-indigo-400/15 text-white'
                            : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500'}`}>
                    <span className="mr-2 text-slate-500">{index + 1}.</span>{option}
                  </button>
                );
              })}
            </div>

            {quizOutcome && (
              <div className={`mt-4 rounded-2xl border p-4 ${quizOutcome.correct ? 'border-emerald-500/40 bg-emerald-950/35' : 'border-rose-500/40 bg-rose-950/35'}`}>
                <div className={`text-sm font-black ${quizOutcome.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {quizOutcome.correct ? `정답! ${quizOutcome.buff?.name} 버프가 적용됩니다.` : '오답. 버프 없이 전투를 시작합니다.'}
                </div>
                {quizOutcome.correct && quizOutcome.buff && (
                  <div className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-3 py-3">
                    <div className="mb-1 inline-flex rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-950">
                      {quizOutcome.buff.badge}
                    </div>
                    <div className="text-sm font-black text-white">{quizOutcome.buff.name}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-amber-100/80">{quizOutcome.buff.desc}</div>
                  </div>
                )}
                <div className="mt-2 text-xs leading-relaxed text-slate-300">{strategyQuiz.exp}</div>
              </div>
            )}

            {quizOutcome ? (
              <button onClick={() => startBattleWithBuff(quizOutcome.buff || null)} disabled={isBusy}
                className="mt-4 w-full rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 py-4 text-base font-extrabold text-white shadow-lg shadow-rose-950/40 transition-all active:scale-95 disabled:opacity-50">
                {isBusy ? '전투 준비 중...' : '대련 시작'}
              </button>
            ) : (
              <button onClick={() => setStrategyQuiz(null)} disabled={isBusy}
                className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950/70 py-3 text-sm font-bold text-slate-400 transition-all hover:text-white disabled:opacity-50">
                상대 화면으로 돌아가기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 전적 기록 모달 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">📋 전적 기록</h2>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <HistoryInner studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 모달 */}
      {showRanking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowRanking(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">🏆 투기장 랭킹</h2>
              <button onClick={() => setShowRanking(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <RankingInner classmates={[...(me ? [me] : []), ...classmates]} studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ── 매칭 중 ─────────────────────────────────────────────────
  if (phase === 'matching') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col items-center justify-center gap-6">
        <div className="text-5xl animate-spin">⚔️</div>
        <p className="text-white font-extrabold text-xl animate-pulse">상대를 찾는 중...</p>
        {ticketUsedMsg && (
          <div className="bg-violet-900/80 border border-violet-500 text-violet-200 text-sm font-bold px-5 py-2.5 rounded-2xl animate-bounce">
            🏟️ 투기장 이용권 1개 사용됨
          </div>
        )}
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── VS 화면 ─────────────────────────────────────────────────
  if (phase === 'vs' && opponent) {
    const myStats  = getStats(me, equipmentItems);
    const oppStats = getStats(opponent, equipmentItems);
    const canChange = changes < MAX_CHANGES && (me?.diamonds || 0) >= CHANGE_COST;
    const myPower   = myStats.attack * 2 + myStats.defense + myStats.hp / 20;
    const oppPower  = oppStats.attack * 2 + oppStats.defense + oppStats.hp / 20;
    const advantage = myPower > oppPower ? 'win' : myPower < oppPower ? 'lose' : 'even';

    return (
      <>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950 p-4 flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div />
          <div className={`text-xs font-extrabold px-3 py-1.5 rounded-full
            ${advantage==='win' ? 'bg-emerald-900 text-emerald-400' : advantage==='lose' ? 'bg-rose-900 text-rose-400' : 'bg-slate-800 text-slate-400'}`}>
            {advantage==='win' ? '⬆️ 유리' : advantage==='lose' ? '⬇️ 불리' : '🔄 막상막하'}
          </div>
          <div className="text-xs text-slate-400">변경 {MAX_CHANGES - changes}회 남음</div>
        </div>

        {/* VS 카드 */}
        <div className={`flex items-stretch gap-3 mb-4 transition-opacity duration-300 ${matchAnim ? 'opacity-30' : 'opacity-100'}`}>
          <div className="flex-1"><CharacterCard student={me} label="나" isMe rank={rankMap[me?.id]} equipmentItems={equipmentItems} /></div>

          <div className="flex flex-col items-center justify-center gap-2 shrink-0">
            <div className="text-2xl font-extrabold text-slate-500">VS</div>
            <div className="w-px flex-1 bg-slate-700" />
          </div>

          <div className="flex-1"><CharacterCard student={opponent} label="상대" isMe={false} rank={rankMap[opponent?.id]} equipmentItems={equipmentItems} /></div>
        </div>

        {/* 상대 바꾸기 */}
        <button onClick={changeOpponent} disabled={!canChange || isBusy}
          className={`w-full py-3 rounded-2xl font-bold text-sm mb-3 transition-all border
            ${canChange && !isBusy
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600 active:scale-95'
              : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'}`}>
          {changes >= MAX_CHANGES ? '변경 횟수 소진'
            : (me?.diamonds || 0) < CHANGE_COST ? `💎 부족 (${CHANGE_COST}💎 필요)`
            : `🔄 상대 바꾸기 (-💎${CHANGE_COST})  ·  ${MAX_CHANGES - changes}회 남음`}
        </button>

        {/* 대련 시작 */}
        <button onClick={openStrategyQuiz} disabled={isBusy}
          className="w-full py-4 rounded-2xl font-extrabold text-lg bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white shadow-lg shadow-rose-900 transition-all active:scale-95 disabled:opacity-50">
          {isBusy ? '처리 중...' : '🧠 전략 퀴즈 풀고 대련 시작!'}
        </button>

        <p className="text-center text-[10px] text-slate-600 mt-2">
          * 이용권 소비됨 · 대련 시작 후 취소 불가
        </p>

        {/* 전적/랭킹 */}
        <div className="flex gap-2 mt-2">
          <button onClick={() => setShowHistory(true)}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            📋 전적 기록
          </button>
          <button onClick={() => setShowRanking(true)}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all">
            🏆 랭킹
          </button>
        </div>
      </div>

      {strategyQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-indigo-500/35 bg-slate-900 p-5 shadow-2xl shadow-indigo-950/50">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-300">
                  {strategyQuiz.subject === 'english' ? '영어' : '수학'} · 쉬운 복습
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  정답이면 전투 버프가 랜덤으로 적용됩니다
                </div>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-slate-500">복습</div>
                <div className="text-sm font-black text-white">{strategyQuiz.grade}학년</div>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
              <div className="text-lg font-black leading-snug text-white">{strategyQuiz.q}</div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {strategyQuiz.options.map((option, index) => {
                const selected = quizAnswer === index;
                const isCorrectOption = quizOutcome && index === strategyQuiz.answer;
                const isWrongSelected = quizOutcome && selected && !isCorrectOption;
                return (
                  <button key={`${strategyQuiz.id}-${index}`} type="button" disabled={!!quizOutcome || isBusy}
                    onClick={() => answerStrategyQuiz(index)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-extrabold transition-all active:scale-[0.98] disabled:cursor-default
                      ${isCorrectOption
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-100'
                        : isWrongSelected
                          ? 'border-rose-400 bg-rose-500/15 text-rose-100'
                          : selected
                            ? 'border-indigo-400 bg-indigo-400/15 text-white'
                            : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500'}`}>
                    <span className="mr-2 text-slate-500">{index + 1}.</span>{option}
                  </button>
                );
              })}
            </div>

            {quizOutcome && (
              <div className={`mt-4 rounded-2xl border p-4 ${quizOutcome.correct ? 'border-emerald-500/40 bg-emerald-950/35' : 'border-rose-500/40 bg-rose-950/35'}`}>
                <div className={`text-sm font-black ${quizOutcome.correct ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {quizOutcome.correct ? `정답! ${quizOutcome.buff?.name} 버프가 적용됩니다.` : '오답. 버프 없이 전투를 시작합니다.'}
                </div>
                {quizOutcome.correct && quizOutcome.buff && (
                  <div className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-3 py-3">
                    <div className="mb-1 inline-flex rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-950">
                      {quizOutcome.buff.badge}
                    </div>
                    <div className="text-sm font-black text-white">{quizOutcome.buff.name}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-amber-100/80">{quizOutcome.buff.desc}</div>
                  </div>
                )}
                <div className="mt-2 text-xs leading-relaxed text-slate-300">{strategyQuiz.exp}</div>
              </div>
            )}

            {quizOutcome ? (
              <button onClick={() => startBattleWithBuff(quizOutcome.buff || null)} disabled={isBusy}
                className="mt-4 w-full rounded-2xl bg-gradient-to-r from-rose-600 to-orange-500 py-4 text-base font-extrabold text-white shadow-lg shadow-rose-950/40 transition-all active:scale-95 disabled:opacity-50">
                {isBusy ? '전투 준비 중...' : '대련 시작'}
              </button>
            ) : (
              <button onClick={() => setStrategyQuiz(null)} disabled={isBusy}
                className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950/70 py-3 text-sm font-bold text-slate-400 transition-all hover:text-white disabled:opacity-50">
                상대 화면으로 돌아가기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 전적 기록 모달 */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">📋 전적 기록</h2>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <HistoryInner studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 모달 */}
      {showRanking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowRanking(false)}>
          <div className="bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
              <h2 className="font-extrabold text-white text-lg">🏆 투기장 랭킹</h2>
              <button onClick={() => setShowRanking(false)} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <RankingInner classmates={[...(me ? [me] : []), ...classmates]} studentDocId={studentDocIdRef.current} />
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ── 자동 전투 화면 ──────────────────────────────────────────
  if (phase === 'battle') {
    const myMaxHP  = battleMaxHP.me  || 1;
    const oppMaxHP = battleMaxHP.opp || 1;
    const myPct    = Math.max(0, Math.round((battleHP.me  / myMaxHP)  * 100));
    const oppPct   = Math.max(0, Math.round((battleHP.opp / oppMaxHP) * 100));
    const LOG_COLORS = {
      crit: 'text-yellow-400',
      skill: 'text-fuchsia-300',
      attack: 'text-slate-200',
      heal: 'text-emerald-300',
      guard: 'text-sky-300',
      dodge: 'text-cyan-300',
      system: 'text-indigo-400',
      result: 'text-emerald-400',
    };
    const LOG_META = {
      crit: { icon: '🔥', label: '치명타', tone: 'crit' },
      skill: { icon: '⚡', label: '강타', tone: 'skill' },
      attack: { icon: '⚔️', label: '공격', tone: 'attack' },
      heal: { icon: '💚', label: '회복', tone: 'heal' },
      guard: { icon: '🛡️', label: '방어', tone: 'guard' },
      dodge: { icon: '💨', label: '회피', tone: 'dodge' },
      system: { icon: '📣', label: '전투 상황', tone: 'system' },
      result: { icon: '🏆', label: '결과', tone: 'result' },
    };
    const isFinisherFx = battleFx.kind === 'finish';
    const showVictoryFx = Boolean(battleWinner && !isFinisherFx);
    const fighterClass = (side) => [
      'arena2-fighter',
      side === 'me' ? 'arena2-fighter-me' : 'arena2-fighter-opp',
      battleFx.actor === side ? `arena2-actor-${side}` : '',
      battleFx.target === side ? `arena2-target-${side}` : '',
      battleFx.kind === 'finish' && battleFx.actor === side ? `arena2-finisher-${side}` : '',
      battleFx.kind === 'finish' && battleFx.target === side ? `arena2-finish-target-${side}` : '',
      battleFx.kind === 'dodge' && battleFx.target === side ? `arena2-dodge-${side}` : '',
      battleFx.kind === 'guard' && battleFx.actor === side ? 'arena2-guarding' : '',
      battleFx.kind === 'heal' && battleFx.actor === side ? 'arena2-healing' : '',
      showVictoryFx && battleWinner === side ? 'arena2-winner' : '',
      showVictoryFx && battleWinner !== side ? 'arena2-defeated' : '',
    ].filter(Boolean).join(' ');
    const winnerName = battleWinner === 'me'
      ? (me?.name || me?.studentCode || '나')
      : battleWinner === 'opp'
        ? (opponent?.name || opponent?.studentCode || '상대')
        : '';
    const latestLog = battleLog[battleLog.length - 1];
    const latestMeta = LOG_META[latestLog?.type] || LOG_META.system;
    const highlightLogs = battleLog
      .filter(entry => ['crit', 'skill', 'heal', 'guard', 'dodge', 'result'].includes(entry.type))
      .slice(-4);

    return (
      <div className={`arena2-battle-shell bg-gradient-to-b from-slate-950 to-indigo-950 flex flex-col p-4 gap-3 ${battleFx.isCrit ? 'arena2-crit-flash' : ''} ${isFinisherFx ? 'arena2-finish-mode' : ''}`}
        style={{ height: 'calc(100vh - 88px)' }}>
        {isFinisherFx && (
          <div key={`finish-screen-${battleFx.seq}`} className="arena2-final-screen-burst pointer-events-none">
            <div className="arena2-final-screen-panel">
              <small>FINISHING MOVE</small>
              <strong>최후의 일격</strong>
              <span>FINAL STRIKE</span>
            </div>
            <i className="arena2-final-slash arena2-final-slash-a" />
            <i className="arena2-final-slash arena2-final-slash-b" />
            <i className="arena2-final-slash arena2-final-slash-c" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 shrink-0">
          <div className="rounded-xl border border-indigo-500/30 bg-slate-950/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
              <span className="font-extrabold text-indigo-200 truncate">{me?.name || me?.studentCode || '나'}</span>
              <span className={`font-black tabular-nums ${myPct < 30 ? 'text-rose-300' : 'text-slate-200'}`}>{battleHP.me}/{myMaxHP}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className={`h-full rounded-full transition-all duration-500 ${myPct > 50 ? 'bg-emerald-400' : myPct > 25 ? 'bg-amber-400' : 'bg-rose-500'}`}
                style={{ width: `${myPct}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-slate-950/70 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
              <span className="font-extrabold text-rose-200 truncate">{opponent?.name || opponent?.studentCode || '상대'}</span>
              <span className={`font-black tabular-nums ${oppPct < 30 ? 'text-rose-300' : 'text-slate-200'}`}>{battleHP.opp}/{oppMaxHP}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className={`h-full rounded-full transition-all duration-500 ${oppPct > 50 ? 'bg-emerald-400' : oppPct > 25 ? 'bg-amber-400' : 'bg-rose-500'}`}
                style={{ width: `${oppPct}%` }} />
            </div>
          </div>
        </div>

        <div className="arena2-stage relative flex-1 min-h-[310px] overflow-hidden rounded-xl border border-slate-700/60 bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950">
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-[18%] h-px bg-indigo-300/20" />
          <div className="absolute left-1/2 top-5 z-30 -translate-x-1/2 rounded-full border border-slate-600/70 bg-slate-950/75 px-4 py-1.5 text-xs font-black tracking-[0.18em] text-slate-200 shadow-lg">
            {battleBanner}
          </div>
          {battleFx.isCrit && (
            <div key={`crit-${battleFx.seq}`} className="absolute inset-0 z-20 pointer-events-none battle-impact-flash" />
          )}
          {battleWinner && !isFinisherFx && (
            <div key={`victory-${battleWinner}`} className={`arena2-victory-stage arena2-victory-${battleWinner} pointer-events-none`}>
              <div className="arena2-victory-rays" />
              <i className="arena2-victory-spark arena2-victory-spark-1" />
              <i className="arena2-victory-spark arena2-victory-spark-2" />
              <i className="arena2-victory-spark arena2-victory-spark-3" />
              <i className="arena2-victory-spark arena2-victory-spark-4" />
            </div>
          )}
          {isFinisherFx && (
            <div key={`finish-${battleFx.seq}`} className="arena2-finish-cinematic pointer-events-none">
              <span>FINAL STRIKE</span>
              <i />
            </div>
          )}

          <div ref={meBattleRef} className={fighterClass('me')}>
            <div className="arena2-nameplate arena2-nameplate-me">나</div>
            <div className="arena2-character-wrap">
              {me?.characterImage
                ? <img src={me.characterImage} alt="" className="arena2-character-img arena2-character-img-me" />
                : <span className="text-7xl">🧑‍🎓</span>}
            </div>
            {showVictoryFx && battleWinner === 'me' && (
              <div className="arena2-winner-badge">
                <small>WINNER</small>
                <strong>{winnerName}</strong>
                <span>승리!</span>
              </div>
            )}
          </div>

          <div className="absolute left-1/2 bottom-[42%] z-10 -translate-x-1/2 text-4xl font-black text-slate-600/70">VS</div>

          <div ref={oppBattleRef} className={fighterClass('opp')}>
            <div className="arena2-nameplate arena2-nameplate-opp">상대</div>
            <div className="arena2-character-wrap">
              {opponent?.characterImage
                ? <img src={opponent.characterImage} alt="" className="arena2-character-img arena2-character-img-opp" />
                : <span className="text-7xl">🧑‍🎓</span>}
            </div>
            {showVictoryFx && battleWinner === 'opp' && (
              <div className="arena2-winner-badge">
                <small>WINNER</small>
                <strong>{winnerName}</strong>
                <span>승리!</span>
              </div>
            )}
          </div>

          {battleFx.target && battleFx.kind && !['heal', 'guard', 'dodge'].includes(battleFx.kind) && (
            <div key={`impact-${battleFx.seq}`}
              className={`absolute z-30 pointer-events-none battle-impact ${isFinisherFx ? 'battle-impact-finisher battle-impact-tier-4' : battleFx.isCrit ? 'battle-impact-tier-4' : battleFx.kind === 'power' ? 'battle-impact-tier-3' : 'battle-impact-tier-2'}`}
              style={{ left: battleFx.target === 'me' ? '30%' : '70%', top: '48%' }}>
              <span className="battle-impact-ring" />
              <strong className={isFinisherFx ? 'text-orange-200' : battleFx.isCrit ? 'text-yellow-200' : 'text-amber-200'}>
                {isFinisherFx ? 'FINAL STRIKE!' : battleFx.isCrit ? 'CRITICAL!' : battleFx.kind === 'power' ? 'POWER HIT!' : 'HIT!'}
              </strong>
            </div>
          )}

          {floatTexts.map(item => (
            <div key={item.id}
              className={`absolute z-40 pointer-events-none font-black battle-damage-float
                ${item.kind === 'finish' ? 'battle-damage-tier-4 battle-damage-finisher text-orange-200' : item.isCrit ? 'battle-damage-tier-4 text-yellow-300' : item.kind === 'heal' ? 'text-emerald-300' : item.kind === 'dodge' ? 'text-cyan-200' : 'text-rose-300'}`}
              style={{ left: item.side === 'me' ? '30%' : '70%', top: item.kind === 'heal' ? '38%' : '34%' }}>
              {item.text}
            </div>
          ))}

          <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center">
            <div className="rounded-full border border-slate-600/60 bg-slate-950/70 px-4 py-1 text-[11px] font-bold text-slate-400">
              자동 전투 · 3번째 행동마다 강타 · HP 30% 이하 회복
            </div>
          </div>
        </div>

        <div className="arena2-combat-cast">
          <div className={`arena2-live-card arena2-live-${latestMeta.tone}`}>
            <div className="arena2-live-head">
              <span className="arena2-live-dot">LIVE</span>
              <span>{latestMeta.icon} {latestMeta.label}</span>
            </div>
            <div className="arena2-live-message">
              {latestLog?.msg || '⚔️ 전투 준비 중...'}
            </div>
          </div>

          <div className="arena2-highlight-row">
            {highlightLogs.length === 0 ? (
              <div className="arena2-highlight-card arena2-highlight-empty">
                <span>전투 하이라이트 대기 중</span>
              </div>
            ) : highlightLogs.map((entry, i) => {
              const meta = LOG_META[entry.type] || LOG_META.system;
              return (
                <div key={`${entry.type}-${i}-${entry.msg}`} className={`arena2-highlight-card arena2-highlight-${meta.tone}`}>
                  <strong>{meta.icon} {meta.label}</strong>
                  <span>{entry.msg}</span>
                </div>
              );
            })}
          </div>

          <details className="arena2-detail-log">
            <summary>
              <span>상세 전투 기록 보기</span>
              <b>{battleLog.length}</b>
            </summary>
            <div ref={logRef} className="arena2-detail-log-list">
              {battleLog.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-4 animate-pulse">⚔️ 전투 준비 중...</p>
              ) : (
                <div className="space-y-1.5">
                  {battleLog.map((entry, i) => (
                    <div key={i} className={`text-sm font-medium leading-relaxed ${LOG_COLORS[entry.type] || 'text-slate-300'}`}>
                      {entry.msg}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    );
  }


  // ── 결과 ────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-indigo-950">
        <ResultScreen
          isWin={result.isWin}
          opponent={opponent}
          reward={result.reward}
          battleSummary={result.battleSummary}
          onClose={reset}
        />
      </div>
    );
  }

  return null;
}
