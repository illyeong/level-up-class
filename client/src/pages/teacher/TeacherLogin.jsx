import React from 'react';
import TeacherLayout from './TeacherLayout';

function TeacherLogin({
  onStudentTestLogin,
  onLogout,
  teacherEmail,
  selectedClass,
  onChangeClass,
  autoOpenBossRaidDemoKey = 0,
  allowBossRaidDemoEntry = false,
}) {
  return (
    <TeacherLayout
      user={{ email: teacherEmail }}
      onLogout={onLogout}
      onStudentTestLogin={onStudentTestLogin}
      selectedClass={selectedClass}
      onChangeClass={onChangeClass}
      autoOpenBossRaidDemoKey={autoOpenBossRaidDemoKey}
      allowBossRaidDemoEntry={allowBossRaidDemoEntry}
    />
  );
}

export default TeacherLogin;
