# AI 학습관 4~6학년 전수검수 — 작업 상태 (2026-09-03)

## 최신 상태 — 아래의 9월 2일 기록보다 우선

사용자 요청으로 작업을 재개했다가 **2026-09-03 09시경 사용자의 재개 저장 요청으로 다시 중단**했다. 운영 DB 쓰기와 배포는 아직 하지 않았다. 다음 요청 때 아래 지점부터 재개한다.

- 4학년: 전체 1,908문항 검수 완료. 에이전트 1,546문항/519개 수정안 + Root L100–118 전체 362문항/110개 수정안 = 총 629개 수정안.
- 5학년: **전체 2,471문항 읽기 완료, 수정안 907개 저장 확정**. 기존 후속23개 및 마지막139-Q02/153-Q12/207-Q07 수정도 JSON에 반영. 최종 통합 QA·띄어쓰기·일부 그림 단위/문구 후보 정돈은 미완료이며 `grade5-resume.md` 맨 위에 기록.
- 6학년: 전체 1,741문항 검수 완료, 수정안 601개. 원본 해시/구조/공통 계산/필수 시각자료/미완성 해설 오류 0. 동치값 후보 58개 정상 사유 기록. `grade6-verification.json` 참고.
- `apply-courseware-audit.mjs`는 4학년 에이전트 파일과 Root 파일을 함께 읽는다. 에이전트 생성 파일에 Root 수정안을 수동 병합하지 말 것.
- `check-courseware-audit-proposals.mjs`는 미수정 문항까지 6,120개를 후검사한다. 동치값 경고는 오답끼리 같은 경우/표현 조건 문제도 있으므로 자동 오류로 취급하지 않는다.
- `summarize-courseware-audit.mjs`는 최신 통합 계획/실제 검토 상태에서 `summary.json`과 `corrected-questions.local.json`을 재생성한다.
- 공유 계산기: 대분수 Unicode/분수 나눗셈/모호한 슬래시 연쇄 및 선택지 중복 판정 보완. 그림: 다각형 꼭짓점·대각선, 사다리꼴 윗변/아랫변 비율, 격자 교점의 대칭축·점 표시 지원.
- 회귀 테스트 28건 및 그림/대작전 테스트, 변경 파일 lint, Vite 빌드가 한 차례 통과했다. 이후 생성 API 오보정 발견으로 해당 API 추가 수정 진행 중이므로 **최종 상태 테스트/빌드는 다시 필요**하다. API 수정 중 실행한 테스트는 `getWholeNumberComparisonIndex is not defined`로 실패했으나, 중간 저장 시점과 겹쳤으므로 최종 체크포인트와 재대조한다.
- API 추가 작업: `inspectCoursewareQuestion`으로 이전 통합본 6,120개를 검사했을 때 정답 인덱스를 잘못 바꾸는 사례 70개 발견. 괄호/빈칸/부분곱/어림셈/가격관계/틀린 식 찾기를 단순 숫자 추출로 오보정하는 원인이다. `review_grade6`가 `generate-courseware.js`를 shared 계산기 기반 보수적 판정으로 변경 중. table 누락 및 symmetry.points/polygon 필드 보존도 담당. `grade6-api-resume.md`가 있으면 먼저 읽을 것. 생성 API의 차시 필터에 의한 reject는 문항 오류와 구분한다.
- Root 추가 코드: Unicode 대분수와 단독 지수를 구분, `cm²` 표시 보존, `2²`를22로 계산하지 않도록 방어. API와 무관한 숫자/단위 회귀 확인은 통과했다.
- 반영 스크립트 추가 안전장치: `scripts/lib/courseware-audit-hash.mjs`로 운영 문항 비교 시 객체 키 순서는 무시하되 보기/꼭짓점 배열 순서는 유지. 운영 학년도 원래 수정안과 정확히 일치해야 한다. `check-courseware-audit-hash.mjs` 통과.
- 실제 UI: 수정된 분수 눈금/대분수, 다각형 B-D/B-E 대각선, 윗변32/아랫변20 사다리꼴 및 단위 라벨, 분수 나눗셈/반지름-넓이 표를 확인했다. 로컬 미리보기 HTML 보존, Vite 임시서버5175 종료.
- **중단 직전 통합 계획 저장 완료: 2,137개 수정안 / 330차시, 공통 검증 충돌0.** 최종5학년 저장 이후 `G5-L207-Q07` 등3개 후보가 해결됐고, 전체6,120개 후검사에서 구조/공통 검산/필수 시각자료/미완성 해설 후보0. 동치값 후보는4학년14/5학년82/6학년58(각 담당자가 조건부 정상 확인). `AUDIT_RESULT.md`, `corrected-questions.local.json`, `summary.json`, `plan-4-5-6.json`을 현재 수정안으로 재생성했다. 단, 추가 API 통합 QA와5학년 마무리 정돈은 남았으므로 즉시 운영 반영용 최종 승인본은 아니다.
- `summarize-courseware-audit.mjs`에는 현재 수정안과 계획의 해시가 다르면 중단하는 검사를 추가했다. **dry-run 성공 후에만** summary를 재생성한다.
- 2026-09-03 읽기 전용 Firestore 트랜잭션 1회에서 `RESOURCE_EXHAUSTED: Quota exceeded` 재확인. 사용자에게 사용량/결제 안내 확인 요청했으며 응답 대기. 실패 재시도 반복이나 무조건 덮어쓰기 금지.
- 운영 DB 수정 0건, 배포 없음, 승인 파일 `approvals.json` 아직 없음.

### 다음 재개 순서

1. `grade5-resume.md`, `grade5-review-report.json`, `grade6-api-resume.md` 및 아래 중단 확정 내용을 읽고 실제 파일 상태 확인.
2. API 추가 작업 마무리와 전용 회귀 테스트. 전체 수정문항을 `inspectCoursewareQuestion`에 다시 대조하여 잘못된 정답 재보정이 사라졌는지 확인.
3. `node scripts/apply-courseware-audit.mjs` dry-run → `node scripts/check-courseware-audit-proposals.mjs` → `node scripts/summarize-courseware-audit.mjs` 순으로 재생성. 모든 실제 검수 ID 합계6,120, 미검토0, 원본해시/중복/공통검산 충돌0 확인.
4. `npm run test:courseware`, `npm run test:class-operation`, `node scripts/check-courseware-audit-hash.mjs`, 새 API 테스트, 변경 파일 lint와 `npm run build` 재실행.
5. 사용자에게 Firestore 할당량 해소 여부 확인. 해소 전 DB 쓰기/배포 완료라고 보고하지 말 것. 승인 해시 파일 생성 및 트랜잭션 기반 반영/사후 조회는 아직 남아 있다.

### 중단 시 추가 확인

- API 담당 에이전트가 ReferenceError 해결 및 전체6,120개 실행 가능 확인. 기존70개 오보정은 제거됐고, **구버전 통합 계획 기준** 정답변경2개(`G5-L227-Q07`, `G5-L227-Q14`)는 기존 문제의 정답 오류 후보라고 보고했다. 최신5학년 수정안에 이미 반영됐는지 먼저 대조. 당시 API accepted5,839/rejected281(차시 필터 등 포함)이며 아직 최종 통합 검증은 아니다.
- Root의 `node --check api/generate-courseware.js` 통과. 새 회귀 스크립트/진단 파일은 담당 에이전트 중단 메모 확인.
- API 담당 저장 확정: `scripts/check-courseware-api-safe-normalization.mjs` 16/16 통과, `api-safe-normalization-verification.json`과 `grade6-api-resume.md` 저장. 5학년 담당자는 L227-Q07(index0)/Q14(index3)가 최신907개 수정안에 이미 포함됐음을 확인. API 진단은 구버전 계획 기준이므로 최신2,137개 계획으로 다시 실행해야 한다.
- 최종 저장 시 전체 검수6,120/6,120, 수정안4학년629 + 5학년907 + 6학년601 = **2,137개**. 계획 SHA256(JSON 문자열 기준): `72f40bfb7cc16441cb1276f3dacbef0a3f3dad37a5d0f787dbc7c3ca67dc255d`.
- 모든 보조 에이전트 중단 저장 완료. 사용자 요청대로 추가 작업하지 않고 종료한다. Git commit/push는 하지 않았으며 작업 파일은 현재 디스크에 보존돼 있다.

## 이전 중단 기록 (2026-09-02, 이력용)

아래 내용은 재개 전 체크포인트다. 완료 수/남은 범위는 위 최신 상태를 우선한다.

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
