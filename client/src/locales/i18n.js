import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './ko.json';
import en from './en.json';
import th from './th.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      // 💡 핵심 수정: Vite 환경에서 JSON이 'default'로 감싸지는 현상을 방지합니다!
      ko: { translation: ko.default || ko },
      en: { translation: en.default || en },
      th: { translation: th.default || th }
    },
    lng: "ko", // 기본 언어 한국어
    fallbackLng: "en", 
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;