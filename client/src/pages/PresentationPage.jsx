import React, { useEffect, useMemo, useState } from 'react';
import './PresentationPage.css';

const asset = (name) => `/intro/${name}`;

const slides = [
  {
    kind: 'cover',
    section: '교사 AI활용 교수학습 협력설계 챌린지',
    title: 'LevelUp Class',
    subtitle: 'AI 기반 게임형\n학급 운영 플랫폼',
    description: '학생의 학습 행동을 게임 속 성장 경험으로 바꾸는 학급 운영 시스템',
    meta: ['퀘스트 · 보상 · 레벨 · 아바타', 'AI 퀴즈 · 퀴즈 레이드 · 학급 경제'],
    image: '/images/levelupclass.png',
    note: '방향키로 진행 · 한 단계씩 펼쳐집니다',
  },
  {
    section: '프로젝트 소개',
    title: '학교생활과 수업 참여가 성장 경험으로 이어집니다',
    layout: 'splitImage',
    image: asset('학생대시보드.png'),
    points: [
      '규칙 지키기, 수업 참여, 문제 풀이, 모둠활동을 학습 행동으로 기록합니다.',
      '그 행동은 퀘스트, 보상, 레벨, 아바타 성장, 던전 클리어로 연결됩니다.',
      '학생은 “내가 한 행동이 바로 내 성장으로 보인다”는 경험을 하게 됩니다.',
    ],
    closing: 'LevelUp Class는 학급 운영과 교수학습을 하나의 게임형 성장 흐름으로 묶은 플랫폼입니다.',
  },
  {
    section: '설계 의도 1 · 보상 체계',
    title: '학생들이 학교생활에서 하는 거의 모든 행동을 보상과 연결하고 싶었습니다',
    layout: 'contrast',
    leftTitle: '교실에서 들었던 고민',
    leftItems: [
      '꾸준히 잘하는 학생들이 학급 안에서 더 인정받게 할 수 없을까?',
      '동기가 낮은 학생들도 선생님 말을 들을 이유를 만들 수 없을까?',
      '작은 행동 변화도 바로 보상과 성장으로 느끼게 할 수 없을까?',
    ],
    rightTitle: 'LevelUp Class의 방향',
    rightItems: [
      '학습, 생활 습관, 협력, 책임감을 모두 퀘스트화',
      '경험치, 골드, 다이아, 아바타 성장으로 즉시 피드백',
      '학급 안에서 긍정적 행동이 자연스럽게 인정받는 구조',
    ],
    quote: '해야 하는 일을, 해보고 싶은 미션으로.',
  },
  {
    section: '설계 의도 2 · 보상 관리',
    title: '보상 시스템은 좋아도, 운영이 번거로우면 교실에서 오래가기 어렵습니다',
    layout: 'splitImage',
    image: asset('교사대시보드.png'),
    points: [
      '재화나 마일리지를 주는 것만으로는 학생들이 즐겁게 쓸 사용처가 부족했습니다.',
      '교사가 보상을 주고, 기록하고, 사용 내역을 확인하는 과정도 일이 되었습니다.',
      '그래서 보상 지급, 소비, 기록, 성장 확인이 한 사이트 안에서 이어지게 했습니다.',
    ],
    closing: '보상은 끝이 아니라 학급 경제, 상점, 아바타, 던전으로 이어지는 출발점입니다.',
  },
  {
    section: '설계 의도 3 · AI와 에듀테크',
    title: '도구가 많아질수록 교사는 또 다른 일을 하게 됩니다',
    layout: 'splitImage',
    image: asset('AI문제출제.png'),
    points: [
      '수업마다 어떤 사이트를 쓸지 찾고, 다른 아이디로 로그인해야 했습니다.',
      '사용 방법을 학생들에게 다시 안내하고, 결과를 보려면 또 다른 곳으로 들어가야 했습니다.',
      '결국 AI 활용 자체가 교사에게 또 하나의 업무가 되는 경우가 많았습니다.',
    ],
    closing: '글쓰기, 수업 설계, 퀘스트, AI 퀴즈 생성, 학생 활동, 보상과 기록을 한 흐름으로 묶었습니다.',
  },
  {
    section: 'H-A-H 수업 설계',
    title: 'AI는 중간에서 돕고, 판단과 피드백은 다시 교사에게 돌아옵니다',
    layout: 'hah',
    steps: [
      {
        label: 'H',
        title: 'Human',
        text: '교사가 수업 목표와 학생 수준을 보고 활동, 퀘스트, 보상 기준을 설계합니다.',
      },
      {
        label: 'A',
        title: 'AI',
        text: 'AI가 수업 자료를 바탕으로 퀴즈, 글쓰기, 반복학습 자료의 초안을 만듭니다.',
      },
      {
        label: 'H',
        title: 'Human',
        text: '교사가 검토한 뒤 학생이 활동하고, 결과는 피드백과 다음 수업 설계로 이어집니다.',
      },
    ],
  },
  {
    section: '학교 현장 연결성',
    title: '특정 과목용 앱이 아니라 교사가 자기 수업을 넣는 틀입니다',
    layout: 'subjectGrid',
    subjects: [
      ['국어', '주제글쓰기 · 독후감 쓰기 · 각종 글쓰기 업로드'],
      ['수학', 'AI 수학문제 · 오답 풀이 · 단원 평가 · 풀이 설명 퀘스트'],
      ['사회/과학', '자료 공유 · 투표 · 발표 준비 · 탐구 질문 만들기'],
      ['전 교과', '배움노트 쓰기 · 퀘스트 수행 · 활동 기록'],
    ],
    closing: '과목과 학년이 달라도 “수업 활동 → 퀘스트 → 보상 → 기록” 구조는 그대로 적용할 수 있습니다.',
  },
  {
    section: '대표 메뉴 1 · 학생 대시보드',
    title: '학생은 오늘의 성장 상태와 할 일을 한 화면에서 확인합니다',
    layout: 'imageLead',
    image: asset('학생대시보드.png'),
    points: [
      '자신의 캐릭터, 레벨, 경험치, 골드, 다이아, 이용권을 확인합니다.',
      '학생 입장에서는 “이번 주에 무엇을 할 수 있는지”가 보입니다.',
      '대시보드는 학습 활동으로 들어가는 허브 역할을 합니다.',
    ],
  },
  {
    section: '대표 메뉴 2 · 퀘스트 시스템',
    title: '교실의 기본 학습 행동을 게임의 미션 구조로 바꿉니다',
    layout: 'dualImage',
    images: [asset('학생-퀘스트.png'), asset('교사-퀘스트관리.png')],
    captions: ['학생 화면 · 진행 중인 퀘스트 확인', '교사 화면 · 퀘스트 생성, 복제, 종료, 진행률 확인'],
    points: [
      '본문 읽기, 모둠 토의, 단원 개념 문제 풀이 같은 활동을 퀘스트로 등록합니다.',
      '학생은 퀘스트를 수행하고 완료하면 보상을 받습니다.',
      '교사는 학생별 진행률과 완료 여부를 확인할 수 있습니다.',
    ],
  },
  {
    section: '대표 메뉴 3 · AI 퀴즈 던전',
    title: 'AI 퀴즈 던전은 반복학습 콘텐츠를 빠르게 만들게 해줍니다',
    layout: 'dualImage',
    images: [asset('퀴즈던전 관리.png'), asset('퀴즈던전.png')],
    captions: ['교사 화면 · PDF/PPT 기반 문제 생성', '학생 화면 · 던전형 문제 풀이'],
    points: [
      '교사는 PDF나 PPT 자료, 단원, 학년, 난이도를 설정합니다.',
      'AI가 객관식 문제, 정답, 해설을 만들고 교사가 검토 후 발행합니다.',
      '학생은 문제를 풀고 점수에 따라 골드, 경험치, 다이아를 받습니다.',
    ],
  },
  {
    section: '대표 메뉴 4 · 퀴즈 레이드',
    title: '퀴즈 레이드는 개인 문제풀이를 반 전체의 협력학습으로 바꿉니다',
    layout: 'imageLead',
    image: asset('보스레이드 전투화면.png'),
    points: [
      '학생이 문제를 맞히면 보스에게 데미지가 들어갑니다.',
      'Firebase를 통해 보스 HP가 실시간으로 줄어듭니다.',
      '각 학생의 참여가 누적되어 반 전체 목표를 달성하는 구조입니다.',
    ],
  },
  {
    section: '대표 메뉴 5 · 어드벤처 이용권',
    title: '재미는 주되, 수업 흐름은 교사가 설계할 수 있게 했습니다',
    layout: 'splitImage',
    image: asset('어드벤처관리.png'),
    points: [
      '던전, 보스레이드, 투기장 이용권을 주간 단위로 관리합니다.',
      '학생들이 보상형 콘텐츠만 무제한 반복하지 않도록 조절합니다.',
      '교사는 이용권을 개별, 선택, 전체 학생에게 지급할 수 있습니다.',
    ],
    closing: '게임화를 학급 운영의 통제와 연결한 장치입니다.',
  },
  {
    section: '대표 메뉴 6 · 학급 경제',
    title: '보상은 소비, 저축, 투자, 사용의 흐름으로 이어집니다',
    layout: 'mosaic',
    images: [
      asset('학급은행.png'),
      asset('학급상점.png'),
      asset('주식ETF.png'),
      asset('장비창.png'),
    ],
    points: [
      '학급 은행: 골드와 다이아 예치, 출금, 이자',
      '학급 상점: 교사가 등록한 아이템 구매와 사용',
      '주식/ETF: 가상 자산을 사고팔며 경제 개념 경험',
      '보상은 수업 참여와 연결되고, 소비는 학급 문화와 연결됩니다.',
    ],
  },
  {
    section: '대표 메뉴 7 · 아바타와 성장 콘텐츠',
    title: '학생은 내 캐릭터가 계속 성장한다는 몰입감을 얻습니다',
    layout: 'mosaic',
    images: [
      asset('아바타룸.png'),
      asset('탐험던전.png'),
      asset('투기장.png'),
      asset('보물상자.png'),
    ],
    points: [
      '아바타 꾸미기: 내 캐릭터를 커스터마이징하고 저장',
      '탐험 던전: 내 캐릭터로 몬스터를 사냥하는 경험',
      '펫 시스템: 밥주기, 씻기기, 놀아주기로 펫 성장',
      '다음 목표를 위해 재화를 모으고 활동에 참여하게 됩니다.',
    ],
  },
  {
    section: '책임 있는 AI · 윤리',
    title: 'AI를 안전하게 쓰기 위해 교사가 검토하고 책임지는 구조를 두었습니다',
    layout: 'ethics',
    points: [
      ['저작권', '사이트 내 에셋은 직접 구매한 에셋을 사용하고, 저작권에 위배되는 자료는 사용하지 않았습니다.'],
      ['데이터 활용', '학생 개인정보나 민감한 학습 기록은 AI 요청에 넣지 않고, 수업 자료 중심으로만 입력했습니다.'],
      ['교사 검토', 'AI가 만든 문제는 정답, 난이도, 표현, 편향 가능성을 교사가 확인한 뒤 발행합니다.'],
    ],
  },
  {
    section: '책임 있는 AI · 윤리',
    title: 'AI는 교사를 대체하는 판단 도구가 아닙니다',
    layout: 'ethics',
    points: [
      ['내부 활용', '학생 결과 데이터는 플랫폼 내부에서 학습 보상과 피드백 목적으로만 활용합니다.'],
      ['편향·안전성', '학생 수준에 맞지 않거나 부적절한 문항이 들어가지 않도록 검토 단계를 둡니다.'],
      ['최종 책임', '최종 발행, 피드백, 보상 판단은 교사가 담당하도록 설계했습니다.'],
    ],
  },
  {
    section: '정리',
    title: 'LevelUp Class는 AI로 교사를 대체하지 않고, 교실의 성장 흐름을 연결합니다',
    layout: 'gallery',
    columns: [
      {
        title: '교사에게',
        items: ['수업 설계 보조', '보상과 기록 관리', '학생 참여 확인'],
      },
      {
        title: '학생에게',
        items: ['퀘스트 수행', '보상과 성장 확인', '협력학습 경험'],
      },
      {
        title: '수업에는',
        items: ['H-A-H 순환', '게임형 반복학습', '학급 문화와 연결'],
      },
    ],
    closing: '학생은 더 자주 시도하고, 교사는 그 과정을 더 쉽게 기록하고 피드백할 수 있습니다.',
  },
  {
    section: '갤러리워킹 · 체험 동선',
    title: '전시는 교사 화면과 학생 화면을 직접 눌러보는 방식으로 운영합니다',
    layout: 'gallery',
    columns: [
      {
        title: '교사용 노트북',
        items: ['퀘스트 관리소', 'AI 퀴즈 생성', '퀴즈 레이드 관리', '어드벤처 이용권 관리'],
      },
      {
        title: '학생용 태블릿',
        items: ['학생 대시보드', '퀘스트 확인', '퀴즈 던전 1문제', '보상 결과 확인'],
      },
      {
        title: '포스터/QR',
        items: ['H-A-H 구조', '대표 메뉴 흐름', '실제 사이트 QR', '시연 영상 백업'],
      },
    ],
    closing: '보는 전시보다, 직접 눌러보는 전시로 “우리 반에도 쓸 수 있겠다”를 만들겠습니다.',
  },
];

function useSlideNavigation(total, fragmentCounts) {
  const getInitialIndex = () => {
    const start = Number.parseInt(window.location.hash.replace('#', ''), 10);
    if (Number.isFinite(start) && start >= 1 && start <= total) return start - 1;
    return 0;
  };
  const [index, setIndex] = useState(getInitialIndex);
  const [fragment, setFragment] = useState(0);

  const go = (direction) => {
    setFragment((currentFragment) => {
      const maxFragment = fragmentCounts[index] || 0;
      if (direction > 0 && currentFragment < maxFragment) return currentFragment + 1;
      if (direction < 0 && currentFragment > 0) return currentFragment - 1;
      setIndex((currentIndex) => Math.min(total - 1, Math.max(0, currentIndex + direction)));
      return 0;
    });
  };

  const jump = (nextIndex) => {
    setIndex(Math.min(total - 1, Math.max(0, nextIndex)));
    setFragment(0);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(event.key)) {
        event.preventDefault();
        go(1);
      }
      if (['ArrowLeft', 'PageUp', 'Backspace'].includes(event.key)) {
        event.preventDefault();
        go(-1);
      }
      if (event.key === 'Home') jump(0);
      if (event.key === 'End') jump(total - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, total]);

  useEffect(() => {
    const hash = `#${index + 1}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [index]);

  useEffect(() => {
    const onHashChange = () => {
      const next = Number.parseInt(window.location.hash.replace('#', ''), 10);
      if (Number.isFinite(next) && next >= 1 && next <= total) {
        setIndex(next - 1);
        setFragment(0);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [total]);

  return { index, fragment, go, jump };
}

function Reveal({ children, order = 0, fragment }) {
  return (
    <div className={`ppt-reveal ${fragment >= order ? 'is-visible' : ''}`}>
      {children}
    </div>
  );
}

function SlideContent({ slide, fragment }) {
  if (slide.kind === 'cover') {
    return (
      <div className="ppt-cover">
        <div className="ppt-cover-copy">
          <div className="ppt-section-label">{slide.section}</div>
          <h1>{slide.title}</h1>
          <p className="ppt-subtitle">{slide.subtitle}</p>
          <p className="ppt-description">{slide.description}</p>
          <div className="ppt-meta-row">
            {slide.meta.map((item) => <span key={item}>{item}</span>)}
          </div>
          <p className="ppt-note">{slide.note}</p>
        </div>
        <div className="ppt-cover-visual">
          <img src={slide.image} alt="LevelUp Class 대표 이미지" />
        </div>
      </div>
    );
  }

  if (slide.layout === 'contrast') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-contrast">
          <Reveal fragment={fragment} order={0}>
            <Panel title={slide.leftTitle} items={slide.leftItems} tone="muted" />
          </Reveal>
          <Reveal fragment={fragment} order={1}>
            <Panel title={slide.rightTitle} items={slide.rightItems} tone="accent" />
          </Reveal>
        </div>
        <Reveal fragment={fragment} order={2}>
          <div className="ppt-quote">{slide.quote}</div>
        </Reveal>
      </>
    );
  }

  if (slide.layout === 'splitImage') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-split">
          <Reveal fragment={fragment} order={0}>
            <ImageFrame src={slide.image} alt={slide.title} />
          </Reveal>
          <div className="ppt-point-stack">
            {slide.points.map((point, idx) => (
              <Reveal key={point} fragment={fragment} order={idx + 1}>
                <div className="ppt-point">{point}</div>
              </Reveal>
            ))}
            <Reveal fragment={fragment} order={4}>
              <div className="ppt-closing">{slide.closing}</div>
            </Reveal>
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'hah') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-hah">
          {slide.steps.map((step, idx) => (
            <Reveal key={`${step.label}-${idx}`} fragment={fragment} order={idx}>
              <div className="ppt-hah-card">
                <div className="ppt-hah-letter">{step.label}</div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </>
    );
  }

  if (slide.layout === 'imageLead') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-image-lead">
          <Reveal fragment={fragment} order={0}>
            <ImageFrame src={slide.image} alt={slide.title} />
          </Reveal>
          <div className="ppt-point-stack">
            {slide.points.map((point, idx) => (
              <Reveal key={point} fragment={fragment} order={idx + 1}>
                <div className="ppt-point">{point}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'dualImage') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-dual">
          {slide.images.map((image, idx) => (
            <Reveal key={image} fragment={fragment} order={idx}>
              <figure>
                <ImageFrame src={image} alt={slide.captions[idx]} />
                <figcaption>{slide.captions[idx]}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
        <div className="ppt-horizontal-points">
          {slide.points.map((point, idx) => (
            <Reveal key={point} fragment={fragment} order={idx + 2}>
              <div>{point}</div>
            </Reveal>
          ))}
        </div>
      </>
    );
  }

  if (slide.layout === 'mosaic') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-mosaic">
          <div className="ppt-mosaic-grid">
            {slide.images.map((image, idx) => (
              <Reveal key={image} fragment={fragment} order={idx}>
                <ImageFrame src={image} alt={`대표 메뉴 ${idx + 1}`} />
              </Reveal>
            ))}
          </div>
          <div className="ppt-point-stack">
            {slide.points.map((point, idx) => (
              <Reveal key={point} fragment={fragment} order={idx + 1}>
                <div className="ppt-point">{point}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (slide.layout === 'subjectGrid') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-subject-grid">
          {slide.subjects.map(([subject, text], idx) => (
            <Reveal key={subject} fragment={fragment} order={idx}>
              <div className="ppt-subject">
                <strong>{subject}</strong>
                <span>{text}</span>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal fragment={fragment} order={4}>
          <div className="ppt-closing wide">{slide.closing}</div>
        </Reveal>
      </>
    );
  }

  if (slide.layout === 'ethics') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-ethics">
          {slide.points.map(([title, text], idx) => (
            <Reveal key={title} fragment={fragment} order={idx}>
              <div className="ppt-ethic-card">
                <span>{String(idx + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </>
    );
  }

  if (slide.layout === 'gallery') {
    return (
      <>
        <SlideHeader slide={slide} />
        <div className="ppt-gallery">
          {slide.columns.map((column, idx) => (
            <Reveal key={column.title} fragment={fragment} order={idx}>
              <Panel title={column.title} items={column.items} tone={idx === 1 ? 'accent' : 'muted'} />
            </Reveal>
          ))}
        </div>
        <Reveal fragment={fragment} order={3}>
          <div className="ppt-quote">{slide.closing}</div>
        </Reveal>
      </>
    );
  }

  return null;
}

function SlideHeader({ slide }) {
  return (
    <header className="ppt-slide-header">
      <div className="ppt-section-label">{slide.section}</div>
      <h2>{slide.title}</h2>
    </header>
  );
}

function Panel({ title, items, tone }) {
  return (
    <div className={`ppt-panel ${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ImageFrame({ src, alt }) {
  return (
    <div className="ppt-image-frame">
      <img src={src} alt={alt} />
    </div>
  );
}

function getFragmentCount(slide) {
  if (slide.kind === 'cover') return 0;
  if (slide.layout === 'contrast') return 2;
  if (slide.layout === 'splitImage') return 4;
  if (slide.layout === 'hah') return 2;
  if (slide.layout === 'imageLead') return 3;
  if (slide.layout === 'dualImage') return 4;
  if (slide.layout === 'mosaic') return 4;
  if (slide.layout === 'subjectGrid') return 4;
  if (slide.layout === 'ethics') return 2;
  if (slide.layout === 'gallery') return 3;
  return 0;
}

export default function PresentationPage() {
  const fragmentCounts = useMemo(() => slides.map(getFragmentCount), []);
  const { index, fragment, go, jump } = useSlideNavigation(slides.length, fragmentCounts);
  const slide = slides[index];
  const progress = ((index + 1) / slides.length) * 100;

  return (
    <main className="ppt-page">
      <div className="ppt-progress" style={{ width: `${progress}%` }} />
      <section className={`ppt-slide ppt-slide-${slide.layout || slide.kind}`}>
        <SlideContent slide={slide} fragment={fragment} />
      </section>

      <nav className="ppt-controls" aria-label="발표 슬라이드 이동">
        <button type="button" onClick={() => go(-1)} aria-label="이전 슬라이드">‹</button>
        <div className="ppt-count">{index + 1} / {slides.length}</div>
        <button type="button" onClick={() => go(1)} aria-label="다음 슬라이드">›</button>
      </nav>

      <div className="ppt-dots" aria-label="슬라이드 바로가기">
        {slides.map((item, idx) => (
          <button
            key={item.title}
            type="button"
            className={idx === index ? 'active' : ''}
            onClick={() => jump(idx)}
            aria-label={`${idx + 1}번 슬라이드로 이동`}
          />
        ))}
      </div>
    </main>
  );
}
