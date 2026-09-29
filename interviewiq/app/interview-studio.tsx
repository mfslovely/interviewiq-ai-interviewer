"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, AudioLines, BrainCircuit, Check, ChevronRight, Clock3, Code2, Cloud, Database, Layers3, Mic, MicOff, RotateCcw, Sparkles, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { tracks, trackMap, type Difficulty, type TrackId } from "@/lib/question-banks";

type Screen = "setup" | "interview" | "summary";
type Feedback = { score: number | null; verdict: string; strengths: string[]; improvements: string[]; betterAnswer: string; followUp: string; source: "groq" | "demo" };
type Result = Feedback & { questionId: string; answer: string };
const trackIcons = { python: Code2, fullstack: Layers3, rag: Database, genai: BrainCircuit, frontend: Sparkles, aws: Cloud, dsa: Code2 };
const interviewerOpeners = ["Good. Let's begin with something practical.", "Take a moment. Think out loud as you work through this.", "I’m interested in your reasoning more than a memorized definition."];

declare global {
  interface Window { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike; }
  interface Document { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> }; }
}
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export default function InterviewStudio() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [trackId, setTrackId] = useState<TrackId>("python");
  const [level, setLevel] = useState<Difficulty>("Mid-level");
  const [questionCount, setQuestionCount] = useState(5);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");
  const [followUpReview, setFollowUpReview] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const track = trackMap[trackId];
  const questions = useMemo(() => track.questions.slice(0, questionCount), [track, questionCount]);
  const question = questions[questionIndex];
  const scored = results.filter((item) => item.score !== null);
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length) : 0;

  const speak = useCallback((text: string) => {
    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96; utterance.pitch = 0.92;
    window.speechSynthesis.speak(utterance);
  }, [voiceOn]);

  const begin = useCallback((selectedTrack: TrackId = trackId) => {
    setTrackId(selectedTrack); setQuestionIndex(0); setResults([]); setFeedback(null); setAnswer(""); setElapsed(0); setScreen("interview");
    setCode(trackMap[selectedTrack].questions[0].coding?.starter || ""); setFollowUpAnswer(""); setFollowUpReview(null); setError("");
    setTimeout(() => speak(`${interviewerOpeners[0]} ${trackMap[selectedTrack].questions[0].prompt}`), 180);
  }, [speak, trackId]);

  useEffect(() => {
    if (screen !== "interview" || feedback) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen, feedback, questionIndex]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "start_mock_interview", title: "Start mock interview", description: "Start a visible mock interview in a selected engineering track.",
        inputSchema: { type: "object", properties: { track: { type: "string", enum: tracks.map((item) => item.id) } }, required: ["track"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input: unknown) { const candidate = (input as { track?: TrackId })?.track; if (!candidate || !trackMap[candidate]) throw new Error("Unknown track"); begin(candidate); return { status: "started", track: candidate }; }
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [begin]);

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError("Voice input is not supported in this browser. Please type your answer."); return; }
    const recognition = new Recognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
    const initial = answer;
    recognition.onresult = (event) => { const transcripts = Array.from(event.results, (line) => line[0].transcript); setAnswer([initial, ...transcripts].join(" ").trim()); };
    recognition.onend = () => setListening(false); recognition.onerror = () => setListening(false); recognition.start(); recognitionRef.current = recognition; setListening(true);
  }

  async function submitAnswer() {
    if ((!answer.trim() && !question.coding) || (question.coding && (!code.trim() || code === question.coding.starter)) || loading) return;
    recognitionRef.current?.stop(); setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track: track.label, level, question, answer: answer.trim(), code: question.coding ? code : undefined }) });
      if (!response.ok) throw new Error("Interview service unavailable");
      const next = await response.json() as Feedback; setFeedback(next); setResults((items) => [...items, { ...next, questionId: question.id, answer: answer.trim() }]); speak(`${next.verdict}. ${next.followUp}`);
    } catch { setError("The review could not be completed. Your answer is still here; please try again."); }
    finally { setLoading(false); }
  }

  async function reviewFollowUp() {
    if (!followUpAnswer.trim() || !feedback || loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track: track.label, level, question, answer: followUpAnswer, code: question.coding ? code : undefined, followUp: feedback.followUp, previousAnswer: answer }) });
      if (!response.ok) throw new Error("Review failed");
      const review = await response.json() as Feedback; setFollowUpReview(review); speak(review.verdict);
    } catch { setError("Could not review the follow-up. Please retry."); }
    finally { setLoading(false); }
  }

  function nextQuestion() {
    if (questionIndex + 1 >= questions.length) { setScreen("summary"); window.speechSynthesis?.cancel(); return; }
    const nextIndex = questionIndex + 1; setQuestionIndex(nextIndex); setAnswer(""); setFeedback(null); setElapsed(0);
    setCode(questions[nextIndex].coding?.starter || ""); setFollowUpAnswer(""); setFollowUpReview(null); setError("");
    setTimeout(() => speak(`${interviewerOpeners[(nextIndex + 1) % interviewerOpeners.length]} ${questions[nextIndex].prompt}`), 120);
  }

  if (screen === "setup") return <Setup trackId={trackId} setTrackId={setTrackId} level={level} setLevel={setLevel} questionCount={questionCount} setQuestionCount={setQuestionCount} onBegin={() => begin()} />;
  if (screen === "summary") return <Summary track={track.label} results={results} average={average} onRestart={() => { setScreen("setup"); setResults([]); }} />;

  return (
    <main className="interview-shell">
      <header className="topbar"><Brand /><div className="session-status"><span className="live-dot" /> Interview in progress <span className="divider" /> <Clock3 size={15} /> {formatTime(elapsed)}</div><Button variant="ghost" size="icon" aria-label={voiceOn ? "Mute interviewer" : "Enable interviewer voice"} onClick={() => { setVoiceOn(!voiceOn); window.speechSynthesis?.cancel(); }}>{voiceOn ? <Volume2 /> : <VolumeX />}</Button></header>
      <div className="interview-grid">
        <aside className="session-rail"><div><p className="eyebrow">SESSION</p><h2>{track.shortLabel}</h2><p>{level} · {questions.length} questions</p></div><nav aria-label="Interview progress" className="question-nav">{questions.map((item, index) => <div className={`question-step ${index === questionIndex ? "current" : ""} ${index < results.length ? "done" : ""}`} key={item.id}><span>{index < results.length ? <Check size={14} /> : index + 1}</span><div><b>Question {index + 1}</b><small>{index < results.length ? results[index].score === null ? "Practice complete" : `${results[index].score}/100` : index === questionIndex ? "In progress" : "Upcoming"}</small></div></div>)}</nav><div className="rail-score"><span>Current score</span><strong>{average || "—"}</strong><Progress value={average} /></div></aside>
        <section className="interview-stage"><div className="interviewer-row"><div className="avatar"><AudioLines size={22} /></div><div><b>Maya</b><span>Senior technical interviewer</span></div><div className="voice-bars" aria-hidden="true"><i /><i /><i /><i /></div></div><div className="question-card"><div className="question-meta"><span>QUESTION {questionIndex + 1} OF {questions.length}</span><span>{track.shortLabel.toUpperCase()}</span></div><h1>{question.prompt}</h1><p>Explain your trade-offs as you go. I may ask a follow-up based on your answer.</p></div>
          {question.coding && <section className="coding-brief"><div className="editor-top"><Code2 size={17} /><b>Python coding round</b><span>Explain → Write → Review</span></div><p>{question.coding.constraints}</p><pre>{question.coding.examples.join("\n")}</pre></section>}
          {!feedback ? <div className="answer-panel">
            {question.coding && <><div className="editor-top"><label htmlFor="code">solution.py</label><span>Python 3 · code review, no execution</span></div><Textarea id="code" className="code-editor" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={code} onChange={(event) => setCode(event.target.value)} rows={12} aria-describedby="code-help" /><p id="code-help" className="editor-help">Use spaces for indentation. Explain time complexity and test the examples mentally; code is reviewed, not executed.</p></>}
            <label htmlFor="answer">{question.coding ? "Explain your approach and complexity" : "Your answer"}</label><Textarea id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Think out loud: approach, trade-offs, edge cases…" rows={question.coding ? 3 : 7} />
            <div className="answer-actions"><Button className={`mic-button ${listening ? "recording" : ""}`} variant="outline" onClick={toggleListening}>{listening ? <><Square /> Stop listening</> : <><Mic /> Answer by voice</>}</Button><span>{answer.trim().split(/\s+/).filter(Boolean).length} words</span><Button className="submit-button" disabled={loading || (question.coding ? !code.trim() || code === question.coding.starter : !answer.trim())} onClick={submitAnswer}>{loading ? "Reviewing…" : <>Submit {question.coding ? "solution" : "answer"} <ArrowUp /></>}</Button></div>
          </div> : <><FeedbackCard feedback={feedback} onNext={nextQuestion} last={questionIndex + 1 >= questions.length} />
            {question.coding && <details className="solution-panel"><summary>Reference Python solution & complexity</summary><pre>{question.coding.solution}</pre><p>{question.coding.complexity}</p></details>}
            <section className="answer-panel"><label htmlFor="follow-up-answer">Your reply to Maya’s follow-up</label><Textarea id="follow-up-answer" value={followUpAnswer} onChange={(event) => setFollowUpAnswer(event.target.value)} placeholder="Explain your reasoning or walk through an example…" rows={3} /><Button className="next-button" disabled={loading || !followUpAnswer.trim()} onClick={reviewFollowUp}>{loading ? "Reviewing…" : "Discuss follow-up"}</Button>{followUpReview && <div className="follow-up" role="status"><b>{followUpReview.verdict}</b><p>{followUpReview.betterAnswer}</p><small>Follow-up practice does not change the main-round score.</small></div>}</section></>}
          {error && <p role="alert" className="error-message">{error}</p>}
        </section>
      </div>
    </main>
  );
}

function Setup({ trackId, setTrackId, level, setLevel, questionCount, setQuestionCount, onBegin }: { trackId: TrackId; setTrackId: (id: TrackId) => void; level: Difficulty; setLevel: (value: Difficulty) => void; questionCount: number; setQuestionCount: (value: number) => void; onBegin: () => void }) {
  return <main className="setup-shell"><header className="setup-header"><Brand /><div className="header-note">TECHNICAL · CODING · FEEDBACK</div></header><section className="setup-layout"><div className="setup-copy"><p className="eyebrow lime">AI MOCK INTERVIEWER</p><h1>Practice the pressure.<br/><em>Keep your composure.</em></h1><p>Choose a track and meet Maya, an interviewer who listens for your reasoning—not just the right keywords.</p><div className="mini-proof"><div><strong>35</strong><span>curated questions</span></div><div><strong>7</strong><span>engineering tracks</span></div><div><strong>Live</strong><span>voice answers</span></div></div></div><div className="setup-card"><div className="setup-card-head"><div><span>01</span><h2>Choose your interview</h2></div><p>You can switch tracks before you begin.</p></div><div className="track-grid">{tracks.map((item) => { const Icon = trackIcons[item.id]; return <button className={`track-option ${trackId === item.id ? "selected" : ""}`} key={item.id} onClick={() => setTrackId(item.id)} style={{ "--track-accent": item.accent } as React.CSSProperties}><Icon /><span><b>{item.shortLabel}</b><small>{item.description}</small></span>{trackId === item.id && <Check className="selected-check" />}</button>; })}</div><div className="setup-controls"><div><label>Experience level</label><div className="segmented">{(["Junior", "Mid-level", "Senior"] as Difficulty[]).map((item) => <button className={level === item ? "active" : ""} onClick={() => setLevel(item)} key={item}>{item}</button>)}</div></div><div><label>Questions</label><div className="segmented compact">{[3, 5].map((count) => <button className={questionCount === count ? "active" : ""} onClick={() => setQuestionCount(count)} key={count}>{count}</button>)}</div></div></div><Button className="begin-button" onClick={onBegin}>Enter interview room <ChevronRight /></Button><p className="privacy-note"><MicOff size={14} /> Voice recognition may use your browser provider. Answers are sent to Groq when configured.</p></div></section></main>;
}

function FeedbackCard({ feedback, onNext, last }: { feedback: Feedback; onNext: () => void; last: boolean }) { return <div className="feedback-card"><div className="score-ring" style={{ "--score": `${(feedback.score ?? 0) * 3.6}deg` } as React.CSSProperties}><span>{feedback.score ?? "—"}</span><small>{feedback.score === null ? "ungraded" : "/ 100"}</small></div><div className="feedback-content"><div className="feedback-heading"><div><p className="eyebrow">INTERVIEWER NOTES</p><h2>{feedback.verdict}</h2></div><span className="mode-label">{feedback.source === "groq" ? "GROQ AI" : "DEMO REVIEW"}</span></div><div className="feedback-columns"><div><h3>What landed</h3><ul>{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>What to sharpen</h3><ul>{feedback.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div></div><details><summary>Show a stronger answer</summary><p>{feedback.betterAnswer}</p></details><div className="follow-up"><b>Maya’s follow-up</b><p>{feedback.followUp}</p></div><Button className="next-button" onClick={onNext}>{last ? "See interview report" : "Continue interview"}<ChevronRight /></Button></div></div>; }

function Summary({ track, results, average, onRestart }: { track: string; results: Result[]; average: number; onRestart: () => void }) { const strongest = results.reduce((a, b) => (a.score ?? -1) > (b.score ?? -1) ? a : b, results[0]); return <main className="summary-shell"><header className="topbar"><Brand /></header><section className="summary-card"><p className="eyebrow lime">INTERVIEW COMPLETE</p><h1>{average >= 80 ? "Strong signal." : average >= 65 ? "Promising—with room to sharpen." : "A useful baseline."}</h1><p>You completed the {track} mock interview.</p><div className="final-score"><strong>{results.some((item) => item.score !== null) ? average : "—"}</strong><span>{results.some((item) => item.score !== null) ? "overall score" : "ungraded practice"}</span></div><div className="summary-stats"><div><span>Questions answered</span><b>{results.length}</b></div><div><span>Strongest answer</span><b>{strongest?.score ?? "—"}</b></div><div><span>Practice mode</span><b>{results.some((item) => item.source === "groq") ? "Groq AI" : "Built-in"}</b></div></div><div className="result-list">{results.map((item, index) => <div key={item.questionId}><span>0{index + 1}</span><p>{item.verdict}</p><b>{item.score ?? "—"}</b></div>)}</div><Button className="begin-button" onClick={onRestart}><RotateCcw /> Start another interview</Button></section></main>; }

function Brand() { return <div className="brand"><span className="brand-mark"><BrainCircuit /></span><b>INTERVIEW<span>IQ</span></b></div>; }
function formatTime(total: number) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
