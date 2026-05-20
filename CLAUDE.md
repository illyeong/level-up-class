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
- jszip (PPTX 텍스트 추출)

---

## 폴더 구조
```
level-up-class/
├── client/
│   ├── api/
│   │   ├── stock-prices.js      — Yahoo Finance ETF 가격 프록시
│   │   └── generate-quiz.js     — AI 퀴즈 생성 (Claude API / Gemini 전환 가능)
│   ├── public/
│   │   ├── images/
│   │   │   └── soul-bond-bg.png — 선생님의 영혼 카드 배경 이미지
│   │   └── avatar_game/         — Unity AvatarMaker WebGL 빌드
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
│       │   ├── QuizDungeon.jsx         — 솔로 퀴즈 던전 (로비+배틀+결과)
│       │   ├── BossRaid.jsx            — 월드 보스 레이드 (Firebase 실시간 HP)
│       │   └── StockMarket.jsx         — 주식/ETF 거래소
│       └── pages/teacher/
│           ├── TeacherLogin.jsx
│           ├── TeacherLayout.jsx
│           ├── TeacherDashboard.jsx    — 재화 지급/차감, 퀘스트 현황, 테스트 로그인
│           ├── QuestManage.jsx         — 퀘스트 관리소
│           ├── QuestDetail.jsx         — 퀘스트 상세 팝업
│           ├── QuestKiosk.jsx          — 학생 체크인 키오스크 (전체화면 오버레이)
│           ├── AccountIssue.jsx        — 학생 계정 발급 (이름/번호 인라인 편집)
│           ├── BankManage.jsx          — 학급 은행 관리
│           ├── ClassShopManage.jsx     — 학급 상점 관리 (아이템 등록, 사용내역)
│           ├── StockManage.jsx         — 주식 ETF 관리 (선생님의 영혼 포함)
│           ├── QuizDungeonManage.jsx   — 퀴즈 던전 관리 (AI 생성, PDF/PPT 업로드)
│           ├── BossRaidManage.jsx      — 보스 레이드 관리 (생성/종료/보상 지급)
│           └── AdventureManage.jsx     — 어드벤처 관리 (이용권 부여/조회)
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
- [x] 퀘스트 — 진행중/완료/보상로그 3탭, 자체체크, 기한 표시
- [x] 학급 은행 — 다이아/골드 예치·출금, 주간 복리이자
- [x] 학급 상점 — 구매→보유(인벤토리)→사용 시스템
- [x] 어드벤처 — 이용권 바(sticky), 주간 자동 지급, 퀴즈던전, 보스레이드
- [x] 주식/ETF 거래소 — 실시간 가격(Yahoo Finance), 매수/매도, 포트폴리오, 배당
- [x] 프로필 편집 — 학생 이름 설정/변경

### 교사 페이지
- [x] 대시보드 — 재화 지급/차감(골드+다이아 동시), 퀘스트 현황, 테스트 로그인
- [x] 퀘스트 관리소 — 생성/수정/복제/종료/추천템플릿, 진행률, 종료된 퀘스트 탭
- [x] 학생 체크인 (키오스크) — 전체화면 오버레이, 퀘스트 선택→학생 카드 탭
- [x] 학생 계정 발급 — 번호·이름 칸 추가, 인라인 편집
- [x] 학급 은행 관리 — 이율 설정, 이자 일괄 지급
- [x] 학급 상점 관리 — 아이템 등록/수정/삭제, 구매내역, 사용내역
- [x] 주식 ETF 관리 — 가격 새로고침, 배당 지급, 선생님의 영혼 특별 채권
- [x] 퀴즈 던전 관리 — AI 생성(Claude/Gemini), PDF/PPT 업로드, 던전 목록
- [x] 보스 레이드 관리 — 레이드 생성/종료, 실시간 HP 모니터링, 보상 지급
- [x] 어드벤처 관리 — 이용권 3종 현황, 개별/선택/전체 부여, 초기화

---

## Firebase 데이터 구조

### students/{uid}
```
├── studentCode: "SINSEOK-5-01"
├── name: "홍길동"
├── diamonds, gold, level, exp, maxExp
├── parts: { Back, Beard, Boots, ... }
├── characterImage: "data:image/png;base64,..."
├── tickets: { dungeon: 3, bossRaid: 1, arena: 5 }
├── lastTicketRefreshDate: "2025-05-19"
├── bankDiamond, bankGold, bankDiamondInterest, bankGoldInterest
├── lastDividendDate
└── pendingSoulDividend: number
```

### quests/{questId}/completions/{studentId}
```
├── checked, checkedAt, rewarded, rewardedAt, rewardedBy
└── acknowledgedAt
```

### 학급 경제
```
bankSettings/config — weeklyDiamondRate, weeklyGoldRate
bankLogs/{id} — 예치/출금/이자
shopItems/{id}, shopPurchases/{id}
shopInventory/{studentId}_{itemId} — totalQuantity, usedQuantity
shopUsages/{id}
portfolios/{studentId}/holdings/{etfId} — quantity, avgBuyPrice, baseQuantity
etfs/{id} — currentPrice, changePercent, dividendRate, topHoldings
dividendLogs/{id}
```

### 퀴즈 던전
```
quizDungeons/{id}
├── title, grade, semester, subject, publisher, difficulty
├── active: boolean, playCount: number
├── rewards: { gold, exp, diamond }
└── questions: [{ question, options[4], answer(0-3), explanation }]

quizResults/{id}
├── studentId, dungeonId, score, totalQuestions, accuracy
├── cleared, wrongIndexes[], goldEarned, expEarned, diamondEarned
└── completedAt
```

### 보스 레이드
```
worldBossRaids/{id}
├── bossName, bossEmoji, status: 'active'|'cleared'
├── maxHP, currentHP (Firestore increment으로 원자적 감소)
├── questions: [...] (연결된 퀴즈 던전 문제)
├── participants: { [studentId]: { name, damage, answeredCount } }
├── rewards: { gold, exp, diamond }, rewardsPaid: boolean
└── createdAt, clearedAt
```

---

## 선생님의 영혼 (teacher_soul) 특별 채권
- 매일 1% 자동 상승 (Math.floor, 소수점 없음)
- 모든 학생 50주 자동 지급, 최대 100주, 50주 미만 매도 불가
- 배당 지급: (currentPrice - 100) × 보유주수 → pendingSoulDividend → 가격 100G 초기화
- 배경: `/images/soul-bond-bg.png` (opacity 0.55)
- 환경변수: ANTHROPIC_API_KEY (Claude) 또는 무시 (추후 설정)

---

## AI 퀴즈 생성 (`client/api/generate-quiz.js`)
- 현재: Claude API (`claude-haiku-4-5-20251001`)
- 환경변수: `ANTHROPIC_API_KEY` (Vercel Dashboard에 등록)
- PDF 지원: base64로 Claude에 직접 전송
- PPT/PPTX 지원: jszip으로 텍스트 추출 → textarea 자동 입력
- Gemini로 전환: 파일 하단 주석 참고

---

## 어드벤처 이용권 시스템
```
tickets 필드 (students/{uid})
├── dungeon:  주 3회, 최대 3개
├── bossRaid: 주 1회, 최대 3개
└── arena:    주 5회, 최대 5개

매주 월요일 자동 갱신 (첫 접속 시)
교사가 AdventureManage에서 수동 부여/초기화 가능
```

---

## 퀴즈 던전 구현 단계
- [x] 1단계: 교사 AI 퀴즈 생성 + 발행
- [x] 2단계: 학생 솔로 퀴즈 배틀 (로비→배틀→결과)
- [x] 3단계: 결과 저장, 보상 지급 (EXP 레벨업 포함)
- [x] 4단계: 월드 보스 레이드 (Firebase 실시간 HP 공유)
- [ ] 5단계: Unity 보스+HP 시각화 (집에서 Unity 작업 예정)
  - 구조: React(퀴즈 팝업) + Unity iframe(보스 씬) + Firebase(HP 공유)
  - 플레이어 캐릭터: characterImage PNG → Unity에서 표시
  - 보스: 기존 BossFSM Spine 에셋 재사용

---

## 주요 통신 흐름 (React ↔ Unity AvatarMaker)
```
React → Unity: { type: "REACT_LOAD_AVATAR", parts, characterImage }
Unity → React: { type: "UNITY_READY" }
Unity → React: { type: "UNITY_PURCHASE", cost, equipment, characterImage }
Unity → React: { type: "UNITY_SAVE_CHARACTER", parts, characterImage }
```

---

## 네비게이션 구조

### 학생 (NavigationBar.jsx)
- 대시보드 → 우리반 전체 보기
- 내 캐릭터 → 아바타 룸
- 퀘스트 → 업적
- 아카데미 (준비중)
- 어드벤처 → 퀴즈던전, 탐험던전, 투기장, 보스레이드, 미니게임
- 무역 센터 → 학급 은행, 학급 상점, 주식/ETF 거래소
- 시스템 설정 → 프로필 수정

### 교사 (TeacherNavigationBar.jsx)
- 대시보드
- 내 캐릭터
- **퀘스트 관리소** → 🖐️ 학생 체크인
- 어드벤처 → 퀴즈던전 관리, 보스레이드 관리, 퀴즈던전, 탐험던전, 투기장, 보스레이드, 미니게임, **어드벤처 관리**
- 학급 경제 관리 → 학급 상점 관리, 은행 관리, 주식etf 관리
- 학급/학생 관리 → 학생 계정 발급
- 시스템 설정
- 건의 및 문의하기

---

## 알려진 TODO

### 웹
- [ ] 자정 자동 보상/초기화 (Firebase Cloud Functions)
- [ ] 학생 로그인 시스템 (현재 testStudentCode prop)
- [ ] MyCharacter.jsx — 실제 Firebase 데이터 연동

### Unity Dungeon (5단계 보스레이드)
- [ ] BossRaidScene 씬 제작 (판타지 배경 + 보스 배치)
- [ ] Firebase bossHP 리스너 → BossFSM TakeDamage 연결
- [ ] 플레이어 슬롯 (characterImage PNG + 이름 표시)
- [ ] React↔Unity postMessage 연결 (studentCode 전달)
- [ ] WebGL 빌드 → public/boss_raid/

### Unity AvatarMaker
- [ ] UNITY_AVATAR_LOADED 신호 전송
- [ ] 피부색 Firebase 저장/로드

---

## 레이어 설정 (Unity Dungeon)
- `Ground` — 바닥/벽
- `Player` — 플레이어 (Tag: "Player")
- `Monster` — 몬스터/보스
- Physics 2D: Player-Monster OFF, Monster-Monster OFF
