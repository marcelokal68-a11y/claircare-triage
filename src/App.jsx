import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { supabase, supabaseEnabled } from './supabase.js';
import { translations } from './i18n.js';

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SESSION_KEY = 'claircare_session_v2';

const urgencyStyles = {
  'self-care': 'badge badge-soft',
  routine: 'badge badge-routine',
  urgent: 'badge badge-urgent',
  emergency: 'badge badge-emergency'
};

function createSessionId() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data?.id && data?.createdAt && Date.now() - data.createdAt < RETENTION_MS) {
        return data.id;
      }
    } catch (err) {
      // Ignore parse errors and regenerate.
    }
  }
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, createdAt: Date.now() }));
  return id;
}

function getUserEmail(user) {
  return user?.email || user?.user_metadata?.email || '';
}

export default function App() {
  const [locale, setLocale] = useState('pt');
  const t = useMemo(() => translations[locale], [locale]);

  const [authReady, setAuthReady] = useState(!supabaseEnabled);
  const [user, setUser] = useState(null);

  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [initialSymptoms, setInitialSymptoms] = useState('');
  const [qa, setQa] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [consents, setConsents] = useState({
    health: false,
    voice: false,
    privacy: false
  });

  const sessionId = useMemo(() => createSessionId(), []);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    let mounted = true;
    if (!supabaseEnabled) {
      setAuthReady(true);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user || null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const hasConsent = consents.health && consents.voice && consents.privacy;
  const hasResult = Boolean(result);
  const progressPct = done
    ? 100
    : hasResult
      ? Math.max(15, Math.min(90, 100 - (result?.questions_remaining_estimate || 0) * 10))
      : 0;
  const readinessText = !user
    ? 'Aguardando login'
    : !hasConsent
      ? 'Aguardando LGPD'
      : !hasResult
        ? 'Pronto para triagem'
        : done
          ? 'Triagem concluida'
          : 'Triagem em andamento';

  async function persistHistoryRemote(nextResult) {
    if (!user?.id) return;
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_email: getUserEmail(user),
          locale,
          urgency: nextResult?.urgency || 'routine',
          summary: nextResult?.summary_paragraph || '',
          payload: nextResult
        })
      });
    } catch (err) {
      // Keep UI resilient even when history persistence fails.
    }
  }

  async function fetchTriage(payload) {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message || 'Erro ao processar a triagem.');
      setResult(data);
      setCurrentQuestion(data.next_question || '');
      setDone(Boolean(data.done));
      await persistHistoryRemote(data);
    } catch (err) {
      setError(err.message || 'Erro ao processar a triagem.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setInfo('');
    if (!supabaseEnabled) {
      setError(t.supabaseMissing);
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (oauthError) {
      setError(oauthError.message || 'Falha no login com Google.');
    }
  }

  async function handleSignOut() {
    if (!supabaseEnabled) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message || 'Falha ao sair da conta.');
      return;
    }
    handleReset();
  }

  async function handleDeleteData() {
    if (!user?.id) return;
    const confirmed = window.confirm(t.deleteDataConfirm);
    if (!confirmed) return;

    setDeletingData(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch(`/api/history?user_id=${encodeURIComponent(user.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.message || 'Falha ao excluir dados.');
      }
      setInfo(t.deleteDataSuccess);
    } catch (err) {
      setError(err.message || 'Falha ao excluir dados.');
    } finally {
      setDeletingData(false);
    }
  }

  async function handleStart() {
    if (!user) return;
    if (!hasConsent) {
      setError(t.consentRequired);
      return;
    }
    if (!initialSymptoms.trim()) return;

    setQa([]);
    setDone(false);
    setCurrentQuestion('');
    await fetchTriage({
      locale,
      session_id: sessionId,
      initialSymptoms,
      qa: [],
      age: age || undefined,
      sex: sex || undefined
    });
  }

  async function handleAnswer() {
    if (!answer.trim()) return;
    const updatedQa = [...qa, { q: currentQuestion, a: answer }];
    setQa(updatedQa);
    setAnswer('');
    await fetchTriage({
      locale,
      session_id: sessionId,
      initialSymptoms,
      qa: updatedQa,
      age: age || undefined,
      sex: sex || undefined
    });
  }

  async function handleFinish() {
    await fetchTriage({
      locale,
      session_id: sessionId,
      initialSymptoms,
      qa,
      age: age || undefined,
      sex: sex || undefined
    });
  }

  function handleReset() {
    setInitialSymptoms('');
    setQa([]);
    setCurrentQuestion('');
    setAnswer('');
    setResult(null);
    setRecordedAudio(null);
    setError('');
    setDone(false);
  }

  function handleCopy() {
    if (!result?.summary_paragraph) return;
    navigator.clipboard.writeText(result.summary_paragraph);
  }

  function handlePdf() {
    if (!result) return;
    const doc = new jsPDF();
    const lines = [];
    lines.push('ClairCare Triage');
    lines.push('');
    lines.push(`Urgency: ${result.urgency || ''}`);
    lines.push('');
    lines.push('Summary');
    lines.push(result.summary_paragraph || '');
    lines.push('');
    lines.push('Hypotheses');
    (result.hypotheses || []).forEach((h) => {
      lines.push(`- ${h.name} (${h.probability}%)`);
      if (h.rationale) lines.push(`  ${h.rationale}`);
    });
    lines.push('');
    lines.push('Red flags');
    (result.red_flags || []).forEach((rf) => lines.push(`- ${rf}`));
    lines.push('');
    lines.push('Suggested specialists');
    (result.specialists || []).forEach((s) => lines.push(`- ${s}`));

    doc.text(lines, 10, 12);
    doc.save('claircare-triage.pdf');
  }

  async function startRecording() {
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Navegador sem suporte para gravacao.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setError(err.message || 'Falha ao acessar microfone.');
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  }

  async function transcribeAudio() {
    if (!recordedAudio) return;
    setVoiceLoading(true);
    setError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Falha ao converter audio.'));
        reader.readAsDataURL(recordedAudio);
      });

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_base64: base64, locale })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message || 'Erro ao transcrever audio.');

      if (currentQuestion) {
        setAnswer((prev) => (prev ? `${prev}\n${data.text}` : data.text));
      } else {
        setInitialSymptoms((prev) => (prev ? `${prev}\n${data.text}` : data.text));
      }
    } catch (err) {
      setError(err.message || 'Erro ao transcrever audio.');
    } finally {
      setVoiceLoading(false);
    }
  }

  async function handlePlaySummary() {
    if (!result?.summary_paragraph) return;
    setTtsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.summary_paragraph, voice: 'alloy' })
      });
      const data = await res.json();
      if (data.error || !data.audio_base64) {
        throw new Error(data.message || 'Erro ao gerar audio.');
      }
      const audio = new Audio(data.audio_base64);
      await audio.play();
    } catch (err) {
      setError(err.message || 'Erro ao reproduzir audio.');
    } finally {
      setTtsLoading(false);
    }
  }

  const urgencyClass = urgencyStyles[result?.urgency] || 'badge badge-soft';

  return (
    <div className="page">
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <header className="topbar">
        <div className="brand-wrap">
          <span className="brand-badge">Enterprise Clinical Desk</span>
          <h1>{t.brand}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="controls">
          <label>
            {t.languageLabel}
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="pt">PT</option>
              <option value="es">ES</option>
              <option value="en">EN</option>
            </select>
          </label>
          <label>
            {t.ageLabel}
            <input
              type="number"
              min="0"
              max="120"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="32"
            />
          </label>
          <label>
            {t.sexLabel}
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">{t.sexOptions.empty}</option>
              <option value="female">{t.sexOptions.female}</option>
              <option value="male">{t.sexOptions.male}</option>
              <option value="other">{t.sexOptions.other}</option>
            </select>
          </label>
        </div>
      </header>

      <section className="disclaimer">
        <div>
          <strong>{t.disclaimerTitle}</strong>
          <p>{t.disclaimerText}</p>
        </div>
        {result?.urgency === 'emergency' && <div className="emergency">{t.emergencyBanner}</div>}
      </section>

      <section className="status-grid">
        <article className="status-card">
          <span>Identidade</span>
          <strong>{user ? 'Verificada' : 'Nao autenticada'}</strong>
          <p>{user ? getUserEmail(user) : 'Login Google pendente'}</p>
        </article>
        <article className="status-card">
          <span>Conformidade LGPD</span>
          <strong>{hasConsent ? 'Aprovada' : 'Pendente'}</strong>
          <p>{hasConsent ? 'Consentimentos completos' : 'Aceite os 3 consentimentos obrigatorios'}</p>
        </article>
        <article className="status-card">
          <span>Readiness</span>
          <strong>{readinessText}</strong>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </article>
      </section>

      <section className="panel wizard">
        <div className="panel-header">
          <h2>{t.wizardTitle}</h2>
          <span className="chip">{Math.round(progressPct)}% flow</span>
        </div>
        <div className="wizard-steps">
          <span className={user ? 'step done' : 'step'}>1. {t.stepLogin}</span>
          <span className={hasConsent ? 'step done' : 'step'}>2. {t.stepConsent}</span>
          <span className={initialSymptoms ? 'step done' : 'step'}>3. {t.stepTriage}</span>
        </div>

        {!authReady && <p className="hint">Carregando login...</p>}
        {authReady && !user && (
          <div className="signin-box">
            <h3>{t.signinTitle}</h3>
            <p>{t.signinHint}</p>
            <button className="primary" onClick={handleGoogleSignIn}>
              {t.signinButton}
            </button>
          </div>
        )}

        {authReady && user && (
          <div className="signed-box">
            <p>
              {t.welcome} <strong>{getUserEmail(user)}</strong>
            </p>
            <div className="signed-actions">
              <button className="ghost" onClick={() => window.open('/privacy.html', '_blank', 'noopener,noreferrer')}>
                {t.policyButton}
              </button>
              <button className="ghost danger" onClick={handleDeleteData} disabled={deletingData}>
                {deletingData ? '...' : t.deleteDataButton}
              </button>
              <button className="ghost" onClick={handleSignOut}>
                {t.signoutButton}
              </button>
            </div>
          </div>
        )}

        <div className="wizard-body">
          {user && (
            <div className="wizard-main">
              <div className="consent-box">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={consents.health}
                    onChange={(e) => setConsents((prev) => ({ ...prev, health: e.target.checked }))}
                  />
                  <span>{t.consentHealth}</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={consents.voice}
                    onChange={(e) => setConsents((prev) => ({ ...prev, voice: e.target.checked }))}
                  />
                  <span>{t.consentVoice}</span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={consents.privacy}
                    onChange={(e) => setConsents((prev) => ({ ...prev, privacy: e.target.checked }))}
                  />
                  <span>{t.consentPrivacy}</span>
                </label>
                <p className="hint">{t.consentHint}</p>
              </div>

              <div className="panel-lite">
                <h3>{t.startTitle}</h3>
                <p className="hint">{t.startHint}</p>
                {!currentQuestion && (
                  <textarea
                    value={initialSymptoms}
                    onChange={(e) => setInitialSymptoms(e.target.value)}
                    placeholder={t.placeholder}
                    rows={4}
                  />
                )}

                {currentQuestion && (
                  <div className="question-block">
                    <div className="question">{currentQuestion}</div>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder={t.placeholder}
                      rows={3}
                    />
                  </div>
                )}

                <div className="voice-box">
                  <p>{t.voiceHint}</p>
                  <div className="actions">
                    {!isRecording && (
                      <button className="ghost" onClick={startRecording} disabled={voiceLoading}>
                        {t.recordButton}
                      </button>
                    )}
                    {isRecording && (
                      <button className="ghost" onClick={stopRecording}>
                        {t.stopButton}
                      </button>
                    )}
                    <button className="primary" onClick={transcribeAudio} disabled={!recordedAudio || voiceLoading}>
                      {voiceLoading ? '...' : t.transcribeButton}
                    </button>
                  </div>
                </div>

                <div className="actions">
                  {!currentQuestion && (
                    <button className="primary" onClick={handleStart} disabled={loading || !hasConsent}>
                      {loading ? '...' : t.startButton}
                    </button>
                  )}
                  {currentQuestion && !done && (
                    <button className="primary" onClick={handleAnswer} disabled={loading}>
                      {loading ? '...' : t.answerButton}
                    </button>
                  )}
                  {currentQuestion && (
                    <button className="ghost" onClick={handleFinish} disabled={loading}>
                      {loading ? '...' : t.finishButton}
                    </button>
                  )}
                  <button className="ghost" onClick={handleReset}>
                    {t.resetButton}
                  </button>
                </div>
              </div>
            </div>
          )}

          <aside className="wizard-side">
            <h3>Compliance Snapshot</h3>
            <ul className="compact-list">
              <li>Retencao automatica de dados: 30 dias</li>
              <li>Consentimento explicito para voz e dados de saude</li>
              <li>Resumo focado em apoio clinico, sem diagnostico definitivo</li>
            </ul>
          </aside>
        </div>

        {info && <div className="success">{info}</div>}
        {error && <div className="error">{error}</div>}
      </section>

      {hasResult && (
        <main className="layout">
          <section className="panel">
            <div className="panel-header">
              <h2>{t.historyTitle}</h2>
              <span className="chip">{result?.questions_remaining_estimate ?? '—'} Qs</span>
            </div>
            <div className="history-grid">
              <div>
                <span>HPI</span>
                <p>{result?.history?.hpi || t.noData}</p>
              </div>
              <div>
                <span>ROS</span>
                <p>{result?.history?.ros || t.noData}</p>
              </div>
              <div>
                <span>PMH</span>
                <p>{result?.history?.pmh || t.noData}</p>
              </div>
              <div>
                <span>Meds</span>
                <p>{result?.history?.meds || t.noData}</p>
              </div>
              <div>
                <span>Allergies</span>
                <p>{result?.history?.allergies || t.noData}</p>
              </div>
              <div>
                <span>Family</span>
                <p>{result?.history?.family_history || t.noData}</p>
              </div>
              <div>
                <span>Social</span>
                <p>{result?.history?.social || t.noData}</p>
              </div>
            </div>
          </section>

          <section className="panel highlight">
            <div className="panel-header">
              <h2>{t.outputsTitle}</h2>
              <span className={urgencyClass}>{result?.urgency || '—'}</span>
            </div>

            <div className="block">
              <h3>{t.hypothesesTitle}</h3>
              <div className="hypotheses">
                {(result?.hypotheses || []).map((h, idx) => (
                  <div key={`${h.name}-${idx}`} className="hypothesis">
                    <div>
                      <strong>{h.name}</strong>
                      <span>{h.probability}%</span>
                    </div>
                    <p>{h.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="block">
              <h3>{t.redFlagsTitle}</h3>
              <div className="pill-list">
                {(result?.red_flags || []).map((rf, idx) => (
                  <span key={`${rf}-${idx}`}>{rf}</span>
                ))}
              </div>
            </div>

            <div className="block">
              <h3>{t.specialistsTitle}</h3>
              <div className="pill-list">
                {(result?.specialists || []).map((s, idx) => (
                  <span key={`${s}-${idx}`}>{s}</span>
                ))}
              </div>
            </div>

            <div className="block">
              <h3>{t.summaryTitle}</h3>
              <p className="summary">{result?.summary_paragraph || t.noData}</p>
              <div className="actions">
                <button className="primary" onClick={handleCopy} disabled={!result?.summary_paragraph}>
                  {t.copyButton}
                </button>
                <button className="ghost" onClick={handlePdf} disabled={!result}>
                  {t.pdfButton}
                </button>
                <button className="ghost" onClick={handlePlaySummary} disabled={!result?.summary_paragraph || ttsLoading}>
                  {ttsLoading ? '...' : t.playSummaryButton}
                </button>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
