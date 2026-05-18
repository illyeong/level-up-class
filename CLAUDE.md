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
│   │   ├── NavigationBar.jsx       — 학생 사이드바
│   │   ├── StudentDashboard.jsx    — 학생 대시보드 (실제 사용됨)
│   │   └── MyCharacter.jsx         — 내 캐릭터 페이지
│   ├── pages/student/
│   │   ├── AvatarShop.jsx          — Unity 아바타샵 (iframe)
│   │   ├── ClassAllView.jsx        — 우리반 전체 보기
│   │   └── StudentQuestPage.jsx
│   └── pages/teacher/
│       ├── TeacherDashboard.jsx    — 교사 어드민
│       └── QuestDetail.jsx         — 퀘스트 상세/체크
├── unity/
│   ├── LevelUpClass_Dungeon/       — 던전 게임
│   └── LevelUpClass_AvatarMaker/   — 아바타 메이커
└── CLAUDE.md
```

---

## 현재 구현 상태

### React 웹앱
- [x] 학생 대시보드 — Firebase에서 characterImage, 레벨, 골드, 다이아 표시
- [x] 내 캐릭터 페이지 — characterImage + 재화 표시
- [x] 우리반 전체 보기 — 반 전체 캐릭터/레벨 카드
- [x] 교사 대시보드 — 학생 카드에 characterImage 표시
- [x] 퀘스트 상세 — 학생 카드에 characterImage 표시
- [x] AvatarShop — Unity ↔ React postMessage 통신 (UNITY_READY, REACT_LOAD_AVATAR, UNITY_PURCHASE, UNITY_SAVE_CHARACTER)

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
- Idle/Walk/Attack/Die 애니메이션 이름 실제 Spine 이름으로 설정
- Animator 컴포넌트 비활성화 (Spine과 충돌)
- Capsule Collider 2D 크기 조정 (기본값 4.26이 너무 커서 이동 막힘)

### Unity AvatarMaker (`LevelUpClass_AvatarMaker`)
- [x] WebBridge.cs — React↔Unity 메시지 수신/전송
- [x] ReactBridge.jslib — SendPurchaseDataToReact, SendCharacterDataToReact, RegisterMessageListener
- [x] DemoControl.cs — 구매 시 스크린샷 캡처 후 React로 전송
- [x] CharacterCapture.cs — 전용 카메라로 캐릭터만 캡처
- [x] client/public/avatar_game/index.html — window.unityInstance 전역 노출

**AvatarMaker 남은 이슈:**
- 아직 완전히 테스트 안 된 부분: 피부색 저장/로드 (색상 데이터는 parts에 포함 안 됨)

---

## Firebase 데이터 구조
```
students/{uid}
├── studentCode: "SINSEOK-5-01"
├── diamonds: 1000
├── gold: 50
├── level: 1
├── exp: 0
├── maxExp: 1000
├── parts: { Back: -1, Beard: -1, Boots: -1, ... }  ← 16개 파츠 인덱스
└── characterImage: "data:image/png;base64,..."
```

---

## 주요 통신 흐름 (React ↔ Unity AvatarMaker)
```
React → Unity: { type: "REACT_LOAD_AVATAR", parts: {...} }
Unity → React: { type: "UNITY_READY" }
Unity → React: { type: "UNITY_PURCHASE", cost: N, equipment: {...} }
Unity → React: { type: "UNITY_SAVE_CHARACTER", parts: {...}, characterImage: "..." }
```

---

## 알려진 미완성/TODO
- [ ] Stage2_Boss → Clear 씬 전환 (PortalTrigger clearPortal 연결 필요)
- [ ] BossFSM HP 바 UI 연결 (Boss Hp Fill Image, Boss Hp Bar UI 슬롯)
- [ ] AvatarMaker 피부색 저장 (ColorPresetManager 색상 데이터 Firebase 연동)
- [ ] Lobby, DungeonSelect, Clear 씬 구현 (GameManager 상수 정의됨)
- [ ] 학생 로그인 시스템 (현재 테스트용 studentCode prop으로 처리)

---

## 레이어 설정 (Unity)
- `Ground` — 바닥/벽
- `Player` — 플레이어 (Tag도 "Player"로 설정)
- `Monster` — 몬스터/보스
- Physics 2D: Player-Monster 충돌 OFF, Monster-Monster 충돌 OFF
