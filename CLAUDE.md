# LevelUp Class — 프로젝트 컨텍스트

## 프로젝트 개요
게임형 학급 관리 웹앱 + Unity 던전/아바타 게임
- **React 웹앱** (`client/`) — 학생 대시보드, 교사 어드민
- **Unity Dungeon** (`unity/LevelUpClass_Dungeon/`) — 2D 플랫포머 RPG
- **Unity AvatarMaker** (`unity/LevelUpClass_AvatarMaker/`) — 아바타 커스터마이징
- **배포**: Vercel (`level-up-class.vercel.app`)
- **DB**: Firebase Firestore

---

## 기술 스택
- React 19 + Vite + Tailwind CSS
- Firebase (Firestore + Auth)
- i18next 다국어 (ko/en/th)
- Unity 6 (WebGL 빌드) + Spine 2D
- Vercel Serverless Functions (`client/api/`)

---

## 폴더 구조
```
level-up-class/
├── client/
│   ├── api/
│   │   └── stock-prices.js       — Vercel 서버리스: Yahoo Finance ETF 가격 프록시
│   ├── public/
│   │   ├── images/
│   │   │   └── soul-bond-bg.png  — 선생님의 영혼 카드 배경 이미지
│   │   └── avatar_game/          — Unity AvatarMaker WebGL 빌드
│   └── src/
│       ├── components/
│       │   ├── NavigationBar.jsx
│       │   ├── TeacherNavigationBar.jsx
│       │   ├── StudentDashboard.jsx    — Firebase 연동 (characterImage, 레벨, 재화)
│       │   └── MyCharacter.jsx
│       ├── pages/student/
│       │   ├── AvatarShop.jsx          — Unity 아바타샵 (studentCode→docId 조회)
│       │   ├── ClassAllView.jsx
│       │   ├── StudentQuestPage.jsx    — 퀘스트 (진행중/완료/보상로그 탭)
│       │   ├── EditProfile.jsx         — 학생 이름 설정
│       │   ├── ClassBank.jsx           — 학급 은행 (예치/출금/이자)
│       │   ├── ClassShop.jsx           — 학급 상점 (구매→보유→사용 시스템)
│       │   ├── AdventurePage.jsx       — 어드벤처 허브 (이용권 sticky 바)
│       │   └── StockMarket.jsx         — 주식/ETF 거래소
│       └── pages/teacher/
│           ├── TeacherLogin.jsx
│           ├── TeacherLayout.jsx
│           ├── TeacherDashboard.jsx    — 재화 지급/차감, 퀘스트 현황, 테스트 로그인
│           ├── QuestManage.jsx         — 퀘스트 관리소
│           ├── QuestDetail.jsx         — 퀘스트 상세 팝업
│           ├── AccountIssue.jsx        — 학생 계정 발급 (이름/번호 인라인 편집)
│           ├── BankManage.jsx          — 학급 은행 관리 (이율 설정, 이자 지급)
│           ├── ClassShopManage.jsx     — 학급 상점 관리 (아이템 등록, 사용내역)
│           └── StockManage.jsx         — 주식 ETF 관리 (가격 새로고침, 배당, 선생님의 영혼)
```

---

## App.jsx 상태 구조
```
testStudentCode: string | null  ← "SINSEOK-5-01" 등
  → StudentDashboard, MyCharacter, AvatarShop, StudentQuestPage,
    ClassAllView, ClassBank, ClassShop, StockMarket, AdventurePage 모두 전달
```

---

## 현재 구현 상태

### 학생 페이지
- [x] 대시보드 — Firebase 연동, characterImage/레벨/골드/다이아
- [x] 아바타샵 — studentCode→docId 변환, UNITY_READY 기반 저장된 아바타 로딩
- [x] 퀘스트 — 진행중/완료/보상로그 3탭, 자체체크, 확인 후 포트폴리오 이동, 기한 표시
- [x] 학급 은행 — 다이아/골드 예치·출금, 주간 복리이자, 거래내역
- [x] 학급 상점 — 구매→보유(인벤토리)→사용 시스템, 구매 즉시 사용 여부 팝업
- [x] 어드벤처 — 이용권 바(sticky), 주간 자동 지급(월요일), 던전/보스/투기장 이용권
- [x] 주식/ETF 거래소 — 실시간 가격(Yahoo Finance), 매수/매도, 포트폴리오, 배당
- [x] 프로필 편집 — 학생 이름 설정/변경

### 교사 페이지
- [x] 대시보드 — 재화 지급/차감(골드+다이아 동시), 퀘스트 현황, SINSEOK-5-01 테스트 로그인
- [x] 퀘스트 관리소 — 생성/수정/복제/종료/추천템플릿, 진행률, 종료된 퀘스트 탭
- [x] 학생 계정 발급 — 번호·이름 칸 추가, 인라인 편집 (✏️ 클릭)
- [x] 학급 은행 관리 — 이율 설정(다이아/골드 별도), 이자 일괄 지급, 학생 예치현황
- [x] 학급 상점 관리 — 아이템 등록/수정/삭제, 구매내역, 사용내역
- [x] 주식 ETF 관리 — 가격 새로고침, 배당 일괄 지급, 선생님의 영혼 특별 채권 관리

---

## Firebase 데이터 구조

### students/{uid}
```
├── studentCode: "SINSEOK-5-01"
├── name: "홍길동"
├── diamonds, gold, level, exp, maxExp
├── parts: { Back, Beard, Boots, ... }   ← 16개 파츠
├── characterImage: "data:image/png;base64,..."
├── tickets: { dungeon: 3, bossRaid: 1, arena: 5 }
├── lastTicketRefreshDate: "2025-05-19"   ← 주간 이용권 갱신 추적
├── bankDiamond, bankGold                ← 은행 예치금
├── bankDiamondInterest, bankGoldInterest ← 누적 이자
├── lastDividendDate                     ← ETF 배당 중복 방지
└── pendingSoulDividend: number          ← 선생님의 영혼 수령 대기 배당금
```

### quests/{questId}
```
├── title, description, type('daily'|'weekly'), difficulty
├── selfCheck: boolean, repeatDaily: boolean
├── rewards: { exp, gold, diamond }, skills: string[]
├── active: boolean, createdAt, endedAt

quests/{questId}/completions/{studentId}
├── checked, checkedAt, rewarded, rewardedAt, rewardedBy
└── acknowledgedAt  ← 학생이 "확인했어요" 버튼 누른 시점
```

### 학급 경제
```
bankSettings/config
├── weeklyDiamondRate, weeklyGoldRate
└── lastInterestApplied: timestamp

bankLogs/{id} — 예치/출금/이자 기록

shopItems/{id} — 상점 아이템
shopPurchases/{id} — 구매 기록
shopInventory/{studentId}_{itemId} — 보유 수량 (totalQuantity, usedQuantity)
shopUsages/{id} — 사용 기록

portfolios/{studentId}/holdings/{etfId}
├── quantity, avgBuyPrice, baseQuantity(선생님의 영혼은 50)

etfs/{id}
├── name, symbol, theme, topHoldings, description
├── currentPrice, prevPrice, changePercent
├── dividendRate, basePrice, updatedDate
└── (teacher_soul 전용) dailyGrowthRate, baseShares, maxShares, teacherSetToday

dividendLogs/{id} — ETF 배당 지급 기록
dividendLogs/{id} — dividendAmount, weekOf, studentId...
```

---

## 선생님의 영혼 (teacher_soul) 특별 채권 시스템
- ETF ID: `teacher_soul`, symbol: `SOUL`
- 모든 학생 **50주 자동 지급** (첫 주식 페이지 접속 시)
- **매일 1%** 자동 상승 (Math.floor), 소수점 없음
- 최대 100주 보유, **50주 미만으로 매도 불가**
- 교사가 **배당금 지급** 클릭 → (currentPrice - 100) × 보유주수 → pendingSoulDividend 설정 → 가격 100G 초기화
- 학생이 **"보상 수령하기"** 버튼으로 골드 수령
- 배경 이미지: `/images/soul-bond-bg.png` (opacity 0.55 + 그라데이션 오버레이)

---

## 주식/ETF 거래소 ETF 목록 (15종)
| ID | 티커 | 이름 | 테마 |
|----|------|------|------|
| tech | QQQ | 미국 기술주 ETF | 기술 |
| semiconductor | SOXX | 반도체 ETF | 반도체 |
| healthcare | XLV | 헬스케어 ETF | 헬스케어 |
| battery | LIT | 2차전지·리튬 ETF | 2차전지 |
| energy | XLE | 에너지 ETF | 에너지 |
| consumer | XLY | 소비재 ETF | 소비재 |
| reits | VNQ | 부동산 리츠 ETF | 부동산 |
| gold | GLD | 금 ETF | 원자재 |
| bank | KBE | 미국 은행주 ETF | 배당·금융 |
| bitcoin | IBIT | 비트코인 ETF | 암호화폐 |
| k_semiconductor | 091160.KS | KODEX 반도체 | 한국주식 |
| k_battery | 305720.KS | KODEX 2차전지 | 한국주식 |
| k_healthcare | 266420.KS | KODEX 헬스케어 | 한국주식 |
| k_kospi200 | 069500.KS | KODEX 200 | 한국주식 |
| samsung | 005930.KS | 삼성전자 | 한국주식 |

- 가격: Yahoo Finance → `/api/stock-prices` → Firestore 저장
- 한국 ETF: KRW ÷ 1000 스케일 (기본가격은 game gold 단위로 설정)
- 학생 첫 접속 시 Firestore 자동 갱신 (누락 ETF 감지 포함)

---

## 어드벤처 이용권 시스템
```
tickets 필드 (students/{uid})
├── dungeon:  주 3회 지급, 최대 3개
├── bossRaid: 주 1회 지급, 최대 3개
└── arena:    주 5회 지급, 최대 5개

매주 월요일 자동 갱신 (첫 접속 시 체크)
AdventurePage: sticky 티켓 바 (위치 고정, 내용은 스크롤)
```

---

## 학생 퀘스트 시스템 상세
```
퀘스트 완료 흐름:
  selfCheck → checked: true
  교사 보상지급 → rewarded: true
  학생 "확인했어요" → acknowledgedAt: timestamp → "완료한 퀘스트" 탭으로 이동

탭 구성: 진행중 | 완료한 퀘스트 | 보상 로그
보상 로그: 누적 EXP/골드/다이아 합계 + 내역 리스트
```

---

## 주요 통신 흐름 (React ↔ Unity AvatarMaker)
```
React → Unity: { type: "REACT_LOAD_AVATAR", parts: {...}, characterImage: "..." }
Unity → React: { type: "UNITY_READY" }
Unity → React: { type: "UNITY_PURCHASE", cost, equipment, characterImage }
Unity → React: { type: "UNITY_SAVE_CHARACTER", parts, characterImage }
```
AvatarShop: iframe onload 후 2초 간격 최대 10회 재시도 → UNITY_READY 수신 시 중단

---

## 네비게이션 구조

### 학생 (NavigationBar.jsx)
- 대시보드 → 우리반 전체 보기
- 내 캐릭터 → 아바타 룸
- 퀘스트 → 업적
- 아카데미 (준비중)
- 어드벤처 → 퀴즈던전, 탐험던전, 투기장, 보스레이드, 미니게임
- 무역 센터 → 학급 은행, 학급 상점, 주식/ETF 거래소
- 마을 광장
- 시스템 설정 → 프로필 수정

### 교사 (TeacherNavigationBar.jsx)
- 대시보드
- 내 캐릭터
- **퀘스트 관리소** (어드벤처 위)
- 어드벤처 → 퀴즈던전, 탐험던전, 투기장, 보스레이드, 어드벤처 관리
- 학급 경제 관리 → 학급 상점 관리, 은행 관리, 주식etf 관리
- 학급/학생 관리 → 학생 계정 발급
- 시스템 설정
- 건의 및 문의하기

---

## 알려진 미완성/TODO

### 웹
- [ ] 자정 자동 보상/초기화 (Firebase Cloud Functions — 일일/주간 퀘스트)
- [ ] 학생 로그인 시스템 (현재 testStudentCode prop으로 테스트)
- [ ] MyCharacter.jsx — 실제 Firebase 데이터 연동 (현재 더미데이터)
- [ ] 주식 거래소 교사 관리 페이지 — 마켓 이벤트/뉴스 등록 기능

### Unity AvatarMaker
- [ ] UNITY_AVATAR_LOADED 신호 전송 (아바타 적용 완료 시)
- [ ] 피부색(ColorPresetManager) Firebase 저장/로드

### Unity Dungeon
- [ ] Stage2_Boss → Clear 씬 전환
- [ ] BossFSM HP 바 UI 연결
- [ ] Lobby, DungeonSelect, Clear 씬 구현
- [ ] 웹 characterImage/parts → 던전 캐릭터 외형 연동

---

## 레이어 설정 (Unity)
- `Ground` — 바닥/벽
- `Player` — 플레이어 (Tag: "Player")
- `Monster` — 몬스터/보스
- Physics 2D: Player-Monster OFF, Monster-Monster OFF
