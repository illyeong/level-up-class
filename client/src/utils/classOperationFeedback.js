export const getClassOperationErrorMessage = (error) => {
  const code = String(error?.code || '').replace(/^firestore\//, '');
  if (code === 'resource-exhausted') {
    return '서버 사용량 한도에 도달해 요청을 처리하지 못했습니다. 선생님께 Firebase 사용량·할당량 확인을 요청해주세요. (resource-exhausted)';
  }
  if (error?.name === 'QuotaExceededError') {
    return '브라우저 저장공간이 부족하거나 저장이 제한되어 있습니다. 선생님께 기기의 사이트 저장공간 설정 확인을 요청해주세요. (QuotaExceededError)';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return '서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해주세요.';
  }
  return error?.message || '대작전 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
};

// Effects must never be a prerequisite for committing an attack. A missing
// canvas, suspended animation frame, or thrown effect still lets the UI finish.
export const playOptionalClassOperationEffect = (start, timeoutMs = 1500) => new Promise(resolve => {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    resolve();
  };
  const timer = setTimeout(finish, timeoutMs);
  try {
    start(finish);
  } catch {
    finish();
  }
});
