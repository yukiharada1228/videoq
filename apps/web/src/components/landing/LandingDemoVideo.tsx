import { useRef, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STUDENT_DEMO_SUBJECTS, studentDemoMedia } from '@/lib/studentDemo';
import { trackLandingEvent } from '@/lib/landingAnalytics';

export function LandingDemoVideo() {
  const { t, i18n } = useTranslation();
  const media = studentDemoMedia(i18n.resolvedLanguage ?? i18n.language);
  return <DemoPlayer key={media.video} media={media} t={t} />;
}

function DemoPlayer({ media, t }: { media: ReturnType<typeof studentDemoMedia>; t: ReturnType<typeof useTranslation>['t'] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  function play() {
    setBlocked(false);
    void videoRef.current?.play().catch(() => setBlocked(true));
  }
  return (
    <section className="lp-film" id="landing-demo" aria-labelledby="landing-demo-title">
      <div className="lp-film-heading">
        <h2 id="landing-demo-title">{t('landing.film.title')}</h2>
        <span>{t('landing.film.duration')}</span>
      </div>
      <div className="lp-film-player">
        <video ref={videoRef} aria-label={t('landing.film.title')} controls={started || blocked} playsInline preload="none"
          src={media.video} poster={media.poster}
          onPlay={() => { setStarted(true); setBlocked(false); trackLandingEvent('demo_engaged'); }}
          onEnded={() => trackLandingEvent('demo_complete')}
          onError={() => setFailed(true)}
        >
          <track kind="captions" src={media.captions} srcLang={media.locale} label={media.locale === 'ja' ? '日本語' : 'English'} />
        </video>
        {!started && !failed && !blocked && <button className="lp-film-play" type="button" onClick={play} aria-label={t('landing.film.play')}>
          <span><Play size={27} fill="currentColor" aria-hidden="true" /></span><strong>{t('landing.film.play')}</strong>
        </button>}
      </div>
      {(failed || blocked) && <p className="lp-film-error" role="status">{t(failed ? 'landing.film.error' : 'landing.film.blocked')}
        {failed && <button type="button" onClick={() => { setFailed(false); setBlocked(false); setStarted(false); videoRef.current?.load(); }}><RotateCcw size={15} aria-hidden="true" />{t('landing.film.retry')}</button>}
      </p>}
      <div className="lp-film-caption">
        <p>{t('landing.film.course')}</p>
        <ul aria-label={t('landing.film.subjectsLabel')}>
          {STUDENT_DEMO_SUBJECTS.map(subject => <li key={subject} className={`lp-subject-${subject}`}>{t(`landing.film.subjects.${subject}`)}</li>)}
        </ul>
      </div>
      <p className="lp-film-note">{t('landing.film.note')}</p>
    </section>
  );
}
