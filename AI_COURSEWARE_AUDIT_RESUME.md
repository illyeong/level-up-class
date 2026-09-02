# AI 학습관 4~6학년 전수검수 — 재개 지점 (2026-09-02)

사용자가 토큰 소진으로 **현재 작업을 중단하고 저장**하도록 요청했다. 다음에 이어서 요청하면 아래 상태부터 재개한다. 아직 전수검수/운영 반영이 완료되지 않았다.

## 현재 요청과 권한

- 4~6학년 AI 학습관의 모든 문제를 검사하고 오류 수정.
- 사용자에게 병렬 검수 허락을 받았으며 학년별 보조 에이전트 3개를 사용했다.
- 앞선 요청의 일일퀘스트 수정은 이전 작업. 이번 작업 트리에는 AI 검증 및 우리반 대작전 quota 대응 변경도 함께 있다. 기존 변경을 버리지 말 것.
- 운영 배포/요금제 변경은 하지 않았다. Git commit/push도 이번 중단 시 하지 않았다.

## 원본 및 작업 파일

`client/courseware-audit.local/2026-09-02/`에 저장. 이 폴더는 `*.local` 규칙으로 Git에서 제외된다. **로컬에만 있으므로 삭제/정리 금지.**

- `aiLessonContent.backup.json`: 원본 전체 스캔 완료(`complete:true`). 627개 문서 중 대상341차시, 총6,120문항.
  - 4학년 98차시 / 1,908문항
  - 5학년 134차시 / 2,471문항
  - 6학년 109차시 / 1,741문항
- `curriculumUnits.backup.json`: 교육과정 원본 백업 완료.
- `audit.json`: 모든 원본 문항, 안정적인 검수 ID, 원본 SHA256, 자동검사 후보.
- `grade-4-review.jsonl`, `grade-5-review.jsonl`, `grade-6-review.jsonl`: 읽기용 문항.
- `grade4-corrections.json`, `grade5-corrections.json`, `grade6-corrections.json`: 부분검수 수정안. 생성 시점/최종 범위는 각 보고서 확인.
- `grade4-review-report.json`, `grade5-review-report.json`, `grade6-review-report.json`: 실제 읽은 범위와 다음 시작점. **미검토 문항까지 완료로 간주하지 말 것.**
- 학년별 `*authoring.cjs`, `grade5-batch*.cjs`, `grade6-work.mjs` 등은 수정안의 재생성 소스.

검수 ID `G4-L100-Q01`의 L번호는 원본 백업 전체 문서 인덱스다. 실제 학년의 차시 번호와 다르다. `audit.json`의 `lessonId`/`questionIndex`로 운영 문서를 찾는다.

## Root 별도 담당 범위

`grade4-root-authoring.cjs` → `grade4-root-corrections.json`, `grade4-root-review-report.json`.

- **L100–L105, L109–L118 전체314문항 읽기 완료, 94개 수정안 저장.**
- **L106–L108은 아직 읽지 않음.** 다음 Root 작업은 여기부터.
- grade4 에이전트에게 L099까지만 검수 후 중단/저장을 요청했다. 에이전트가 실제로 도달한 지점은 보고서 확인.
- Root 수정안과 에이전트 수정안이 이미 병합됐는지 ID 집합으로 확인한 뒤 병합. 중복 적용 금지.
- 첫63안은 구조/공통수학 검사 통과. 추가31안까지 포함한94안 전체 검증은 재개 후 다시 수행.
- 맞는 계산의 반복 출제는 지우거나 재생성하지 않았고 품질경고로만 남길 것.

## 운영 DB 차단 상태 (중요)

- Firestore 집계, REST 단건 GET, `runTransaction` 읽기에서 **RESOURCE_EXHAUSTED / Quota exceeded** 확인.
- 일반 Firebase `getDocs(query(...))` 페이지 조회는 성공하여 원본 전체 백업 가능했다.
- **운영 DB 수정은 아직 0건.** 코드 변경도 배포하지 않음.
- 사용자에게 Firebase Console → Firestore → Usage 할당량 확인 요청을 보냈으나 응답은 아직 없음.
- Firebase Console 브라우저는 로그인되어 있지 않았고 `.env`에는 관리자 이메일 설정만 있음. 인증 우회/비밀키 탐색 금지.
- 할당량 해결 여부를 재개 시 확인. 실패 요청 반복 금지. 무조건 덮어쓰기로 우회하지 말 것.

## 반영 도구와 안전장치

- `client/scripts/export-courseware-audit.mjs`: 원본 내보내기. 기존 백업을 불필요하게 다시 덮어쓰지 말 것.
- `client/scripts/audit-courseware-content.mjs`: 자동 후보 및 읽기용 파일 생성. 자동 후보는 확정 오류가 아님.
- `client/scripts/apply-courseware-audit.mjs`: 기본 dry-run, 운영 쓰기는 `--apply`와 검토된 `approvals.json`이 모두 필요.

client 디렉터리에서:

```text
node scripts/apply-courseware-audit.mjs --grade=4
node scripts/apply-courseware-audit.mjs --grade=5
node scripts/apply-courseware-audit.mjs --grade=6
```

수정안 구조: `{id,beforeHash,patch,reason,verification}`. patch 허용필드: question/options/answerIndex/explanation/shape/table.
dry-run은 `plan-*.json`에 before/after/changeHash/validatorConflict를 저장한다.
실제 반영 전 `{id,changeHash,validatorOverride?}` 승인 파일을 검토해서 만들고, 모든 보정 충돌을 먼저 해결한다.
트랜잭션은 원본 질문 SHA 일치 확인, 동일 수정 재실행 시 건너뛰기, 쓰기 전 문서백업, 쓰기 후 실제 조회 검증을 수행한다. 오류 발생 시 중단하며 진행결과를 `apply-<시각>/outcomes.json`에 남긴다.

## 코드 변경 (디스크 저장 완료)

- `coursewareOptions.js`: 정확히4개 선택지, 공백/번호 접두사/유니코드 정규화 후 중복 검사, 유효한 정답 인덱스만 허용. 잘못된 인덱스를0으로 바꾸지 않음.
- `coursewareArithmetic.js`: eval 없는 안전 계산 파서, 직접 산술/동치분수 선택지 검증.
- `validateCoursewareMathQuestion.js`: 공통 산술/동치분수 검증 연결. 기존 범위/어림 검증도 있음.
- API `generate-courseware.js`: 공통 검증 적용, 버전 `quality-v21-shared-choice-arithmetic-qa`, 읽기용 `inspectCoursewareQuestion` export.
- `AICourseware.jsx`: 기존 저장 문제에도 검증 적용, 검증된 문제가 없으면 진행 방지/재생성, 최근기록 localStorage quota 대응.
- `ClassOperation.jsx`/`classOperationFeedback.js`: 공격 구독 안정화, DB quota와 브라우저 저장공간 오류 구분, 공격 DB 처리와 선택적 애니메이션 실패 분리.
- `mathDiagramLayout.js`/`ShapeRenderer.jsx`: 약수·배수 숫자 자름 제거/줄바꿈, 소수·분수·불규칙 수직선 눈금/레이블/화살표/열린 경계 지원, 반복소수 중복눈금 방지, 직사각형 단위격자/gridLines/gridlines/gridSize/filledCells/대각선, 미지수 길이로 인한 NaN 방지.

## 검증 상태와 남은 주의점

- 중단 직전 `npm run test:courseware`, `npm run test:class-operation` 모두 통과.
- 빌드는 앞서 통과했으나 마지막 직사각형 격자/분수 눈금 정밀도 수정 이후에는 아직 다시 빌드하지 않음.
- Vite 임시서버5175는 중단 시 종료함. 그림 미리보기 HTML은 로컬 작업 폴더에 보존.
- 마지막 확인된6학년 중간300개 수정안 dry-run은 충돌0. 이후 에이전트가372개 이상으로 갱신했으므로 다시 검사.
- 기존 범위/어림 검증기가 정상 문항의 정답을 잘못 보정하는 사례가 없는지 최종 수정안과 대조. 충돌을 승인으로만 덮지 말고 런타임 오보정도 해결해야 함.
- 6학년 일부 새 수정문장 띄어쓰기 정돈 작업이 남아 있음. L291-Q13의 위에서본 세로=깊이 해설 오류는 에이전트가 수정했다고 알림.
- 다각형 포함관계(정사각형은 직사각형/마름모/사다리꼴 포함), 가분수/대분수 동치 중복, 모든 보기가 맞는 오류찾기, 없는 기호/그림 조건, 쌓기나무 투영조건 모순이 다수 확인됨.
- 원래 차시 주제와 무관한 기본입체 fallback 문제도 있음. 무단 대량 삭제/재생성은 하지 않았으며 보고서의 범위 경고 확인.

## 재개 순서

중단 확정 체크포인트:

- **4학년:** 에이전트 원본순1,424문항(L094-Q02까지) / 수정458건. 다음 `G4-L094-Q03`. Root314문항/94건은 **아직 미병합**. 합계1,738/1,908문항 확정검토, 나머지170문항. `grade4-resume-notes.md`에 읽었으나 미확정된 L094–L097 후보 및 그림 후속작업 기록. `grade4-authoring.cjs` 재실행 시 에이전트 부분본만 생성하므로 병합본 덮어쓰기 주의.
- **5학년:** `grade5-corrections.json` 478개 제안 저장. 원문확인1,669개 중1,572/2,471문항 검토완료(통과1,099/교정473), 나머지899개 불확실·미검토. 제안5개도 정밀도 후속점검 필요. 다음 `G5-L184-Q01`. L184–L186은 읽었으나 수정 미확정, 이후802개 미열람. `grade5-resume.md` 참고. JSON 구조검사만 통과했으며 최종 수학QA/dry-run 미완료.
- **6학년:** L305까지1,152/1,741문항 확정검토, 수정399건 저장. 다음 `G6-L306-Q01`, 남은589문항. `grade6-resume.md` 참고. L306–L310은 읽었으나 수정 미확정. 문장 띄어쓰기 및 사후검증 미완료.

1. 학년별 최신 보고서/중단 메모와 수정안 개수 확인.
2. 미검토 범위부터 전체 문항 검수 이어가기(Root L106–L108 포함).
3. 수정안 병합, 중복/원본해시/단일정답/해설/그림 재검증 및 dry-run.
4. 테스트와 빌드. 공통 검증기와 충돌 해결.
5. Firestore 할당량 해소 확인 후 승인된 변경만 안전 반영하고 조회검증. 해결 안 되면 운영 미반영을 명확히 보고.
6. 실제 검수 완료 수, 오류 수정 수, 운영 반영 여부를 구분해서 사용자에게 전달.
