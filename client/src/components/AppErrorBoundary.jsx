import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <section className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
          <div className="text-4xl">⚠️</div>
          <h1 className="mt-4 text-xl font-extrabold">화면을 불러오지 못했습니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">새 배포 파일이 완전히 반영되지 않았거나 일시적인 오류가 발생했습니다.</p>
          <button type="button" onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-indigo-500">
            다시 불러오기
          </button>
        </section>
      </main>
    );
  }
}
