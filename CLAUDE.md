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

---

## 폴더 구조
```
level-up-class/
├── client/src/
│   ├── components/
│   │   ├── NavigationBar.jsx         — 학생 사이드바
│   │   ├── TeacherNavigationBar.jsx  — 교사 사이드바
│   │   ├── StudentDashboard.jsx      — 학생 대시보드 (Firebase 연동)
│   │   └── MyCharacter.jsx           — 내 캐릭터 페이지
│   ├── pages/student/
│   │   ├── AvatarShop.jsx            — Unity 아바타샵 (iframe, studentCode prop)
│   │   ├── ClassAllView.jsx          — 우리반 전체 보기
│   │   └── StudentQuestPage.jsx      — 학생 퀘스트 페이지 (자체체크 기능)
│   └── pages/teacher/
│       ├── TeacherLogin.jsx          — 교사 로그인
│       ├── TeacherLayout.jsx         — 교사 레이아웃
│       ├── TeacherDashboard.jsx      — 교사 어드민 (퀘스트 현황, 테스트 로그인)
│       ├── QuestManage.jsx           — 퀘스트 관리소 (목록/생성/종료/추천)
│       ├── QuestDetail.jsx           — 퀘스트 상세 팝업 (학생카드, 보상지급)
│       └── AccountIssue.jsx          — 학생 계정 발급
├── unity/
│   ├── LevelUpClass_Dungeon/         — 던전 게임
│   └── LevelUpClass_AvatarMaker/     — 아바타 메이커
└── CLAUDE.md
```

---

## 현재 구현 상태

### React 웹앱
- [x] 학생 대시보드 — Firebase에서 characterImage, 레벨, 골드, 다이아 표시 (studentCode prop)
- [x] 내 캐릭터 페이지 — studentCode prop 지원
- [x] 우리반 전체 보기 — 반 전체 캐릭터/레벨 카드
- [x] 교사 대시보드 — characterImage 표시, 퀘스트 현황(일일/주간 색상 구분), SINSEOK-5-01 테스트 로그인 버튼
- [x] 퀘스트 관리소 — 생성/수정/복제/종료/추천템플릿, 진행률 표시, 종료된 퀘스트 탭
- [x] 퀘스트 상세 — 팝업 모달, 학생 카드 그리드, 체크/보상지급/취소(보상회수)
- [x] 학생 퀘스트 페이지 — 활성 퀘스트 표시, selfCheck 완료 체크 기능
- [x] AvatarShop — studentCode→Firestore docId 변환, 저장 오류 수정, 저장된 아바타 자동 로딩 (iframe onload 후 2초 간격 재시도)
- [x] 테스트 로그인 — 교사→SINSEOK-5-01 학생 전환, App.jsx testStudentCode 상태 전파

### App.jsx 상태 구조
```
testStudentCode: string | null  ← "SINSEOK-5-01" 등
  → StudentDashboard, MyCharacter, AvatarShop, StudentQuestPage, ClassAllView 모두 전달
```

### Unity AvatarMaker (`LevelUpClass_AvatarMaker`)
- [x] WebBridge.cs — React↔Unity 메시지 수신/전송
- [x] ReactBridge.jslib — SendPurchaseDataToReact, SendCharacterDataToReact, RegisterMessageListener
- [x] DemoControl.cs — 구매 시 스크린샷 캡처 후 React로 전송
- [x] CharacterCapture.cs — 전용 카메라로 캐릭터만 캡처
- [x] client/public/avatar_game/index.html — window.unityInstance 전역 노출

**AvatarMaker 남은 이슈:**
- [ ] 피부색 저장/로드 (ColorPresetManager 색상 데이터 parts에 미포함)
- [ ] REACT_LOAD_AVATAR 수신 후 UNITY_AVATAR_LOADED 응답 전송 (재시도 즉시 중단용)

### Unity Dungeon (`LevelUpClass_Dungeon`)
씬 구성: `Dungeon_Main(Stage1)` → `Stage2` → `Stage2_Boss` → `Clear`

**스크립트 위치:**
- `Assets/Scripts/` — GameManager, StageManager, PortalTrigger, BossFSM, PlayerHpBar, MonsterHpBar, CharacterCapture
- `Assets/MonsterFSM.cs`, `Assets/CameraFollow.cs`
- `Assets/Layer Lab/.../Character/PlayerMovement.cs`, `PlayerCombat.cs`

**구현 완료:**
- [x] PlayerMovement — 이동/점프, 공격 중 이동 차단
- [x] PlayerCombat — 공격(크리티컬), 피격(넉백), 사망→로비
- [x] MonsterFSM — FSM(Idle/Wander/Chase/Attack), 골드 드롭
- [x] GameManager — 싱글톤, PlayerPrefs 저장 (HP/마나/레벨/골드/스탯)
- [x] StageManager — 몬스터 전멸 시 포탈 활성화
- [x] PortalTrigger — 씬 전환
- [x] CameraFollow — Lerp 추적 + Clamp 맵 제한
- [x] BossFSM — Phase1/2, Walk/Attack/Die(Spine), 추적+공격+돌진
- [x] PlayerHpBar — HP/마나/레벨 HUD (Screen Space)
- [x] MonsterHpBar — 피격 시 World Space HP 바 + 이름태그

**BossFSM 주요 설정 (Inspector):**
- Skeleton Anim: Boss_Dino의 SkeletonAnimation 연결
- Player Target: Character 오브젝트 직접 연결
- Animator 컴포넌트 비활성화 (Spine과 충돌)
- Capsule Collider 2D 크기 조정 (기본값 4.26이 너무 커서 이동 막힘)

---

## Firebase 데이터 구조
```
students/{uid}
├── studentCode: "SINSEOK-5-01"
├── name: "홍길동"           (선택)
├── diamonds: 1000
├── gold: 50
├── level: 1
├── exp: 0
├── maxExp: 1000
├── parts: { Back: -1, Beard: -1, Boots: -1, ... }  ← 16개 파츠 인덱스
└── characterImage: "data:image/png;base64,..."

quests/{questId}
├── title: string
├── description: string
├── type: 'daily' | 'weekly'
├── selfCheck: boolean          ← 학생 자체 체크 허용
├── repeatDaily: boolean        ← 매일 자정 자동 초기화 (Cloud Functions 예정)
├── difficulty: 'easy' | 'medium' | 'hard'
├── rewards: { exp, gold, diamond }
├── skills: string[]            ← ['인성', '의사소통', ...]
├── active: boolean             ← false = 종료된 퀘스트
├── createdAt: timestamp
└── endedAt: timestamp          (종료 시)

quests/{questId}/completions/{studentId}
├── checked: boolean            ← 학생/교사 체크
├── checkedAt: timestamp
├── rewarded: boolean           ← 보상 지급 완료
├── rewardedAt: timestamp
└── rewardedBy: 'teacher' | 'auto' | null
```

---

## 주요 통신 흐름 (React ↔ Unity AvatarMaker)
```
React → Unity: { type: "REACT_LOAD_AVATAR", parts: {...}, characterImage: "..." }
Unity → React: { type: "UNITY_READY" }              ← Unity 초기화 완료 신호
Unity → React: { type: "UNITY_AVATAR_LOADED" }      ← 아바타 적용 완료 (재시도 중단용, 미구현)
Unity → React: { type: "UNITY_PURCHASE", cost: N, equipment: {...}, characterImage: "..." }
Unity → React: { type: "UNITY_SAVE_CHARACTER", parts: {...}, characterImage: "..." }
```

**저장된 아바타 로딩 흐름:**
```
Firebase 로딩 → parts/characterImage ref 저장
  → iframe onload
    → 2초 간격으로 최대 10회 REACT_LOAD_AVATAR 전송
      → UNITY_READY 수신 시 즉시 전송 + 재시도 중단
      → UNITY_AVATAR_LOADED 수신 시 재시도 중단 (Unity 측 미구현)
```

---

## 알려진 미완성/TODO

### 웹
- [ ] 자정 자동 보상/초기화 (Firebase Cloud Functions 필요 — 일일/주간 퀘스트)
- [ ] 학생 로그인 시스템 (현재 testStudentCode prop으로 테스트)
- [ ] MyCharacter.jsx — studentCode 기반 실제 Firebase 데이터 연동 (현재 더미데이터)

### Unity AvatarMaker
- [ ] UNITY_AVATAR_LOADED 신호 전송 (아바타 적용 완료 시)
- [ ] 피부색(ColorPresetManager) Firebase 저장/로드

### Unity Dungeon
- [ ] Stage2_Boss → Clear 씬 전환 (PortalTrigger clearPortal 연결)
- [ ] BossFSM HP 바 UI 연결
- [ ] Lobby, DungeonSelect, Clear 씬 구현
- [ ] 웹 characterImage/parts → 던전 캐릭터 외형 연동

---

## 레이어 설정 (Unity)
- `Ground` — 바닥/벽
- `Player` — 플레이어 (Tag도 "Player"로 설정)
- `Monster` — 몬스터/보스
- Physics 2D: Player-Monster 충돌 OFF, Monster-Monster 충돌 OFF
