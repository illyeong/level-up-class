import React from 'react';
import TeacherLayout from './TeacherLayout';

function TeacherLogin({ onStudentTestLogin, onLogout, teacherEmail, selectedClass, onChangeClass }) {
  return (
    <TeacherLayout
      user={{ email: teacherEmail }}
      onLogout={onLogout}
      onStudentTestLogin={onStudentTestLogin}
      selectedClass={selectedClass}
      onChangeClass={onChangeClass}
    />
  );
}

export default TeacherLogin;