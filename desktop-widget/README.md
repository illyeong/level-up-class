# LevelUp Class 교사용 데스크톱 위젯

Electron 기반 미니 위젯입니다. 학급 ID 또는 teacherUid를 저장하면 Firestore에서 학급 현황을 읽어 작은 바탕화면 창에 보여줍니다.

## 실행

```powershell
cd C:\Users\imdlf\Desktop\level-up-class\desktop-widget
npm install
npm start
```

## 기능

- 학생 수, 오늘 퀘스트 완료 수, 배움노트 승인 대기 수, 오늘 활동 학생 수 요약
- 진행 중인 보스레이드 상태 표시
- 배움노트 승인 대기, 레이드 결과 확인, 아이템 사용 확인 요약
- 총 골드와 총 다이아 요약
- 웹 대시보드 빠른 열기
- 항상 위 고정 버튼

## 연결값

- `학급 ID`: `classes` 컬렉션의 문서 ID입니다. 가능하면 이 값을 넣는 방식이 가장 정확합니다.
- `teacherUid`: 교사 UID입니다. 학급 ID가 없을 때 교사 전체 범위로 조회합니다.
- `웹앱 주소`: 기본값은 `https://level-up-class.vercel.app`입니다.

Firestore 보안 규칙에서 비로그인 읽기가 막혀 있다면 위젯에 권한 오류가 표시됩니다. 그 경우 다음 단계에서 Electron 전용 로그인 흐름을 추가해야 합니다.
