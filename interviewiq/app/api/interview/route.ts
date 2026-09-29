import { NextResponse } from "next/server";

type RequestBody = { track?: string; level?: string; question?: { prompt?: string; idealAnswer?: string; signals?: string[]; followUp?: string }; answer?: string };
export async function POST(request: Request) {
  const body = await request.json() as RequestBody;
  if (!body.answer || !body.question?.prompt) return NextResponse.json({ error: "Question and answer are required." }, { status: 400 });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json(fallback(body));
  const prompt = `You are Maya, a demanding but encouraging senior technical interviewer. Evaluate the candidate's answer for a ${body.level} ${body.track} role.\n\nQuestion: ${body.question.prompt}\nCandidate answer: ${body.answer}\nReference answer: ${body.question.idealAnswer}\nSignals to look for: ${(body.question.signals ?? []).join(", ")}\n\nReturn ONLY valid JSON with: score (integer 0-100), verdict (one candid sentence), strengths (exactly 2 concise strings), improvements (exactly 2 concise strings), betterAnswer (a strong spoken answer under 110 words), followUp (one natural probing question). Be fair to alternative correct approaches. Penalize confident inaccuracies more than missing jargon.`;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", temperature: 0.25, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You are a precise technical interviewer. Output valid JSON only." }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`Groq returned ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}") as Record<string, unknown>;
    return NextResponse.json({ score: Math.max(0, Math.min(100, Number(parsed.score) || 0)), verdict: String(parsed.verdict || "Answer reviewed"), strengths: stringList(parsed.strengths), improvements: stringList(parsed.improvements), betterAnswer: String(parsed.betterAnswer || body.question.idealAnswer || ""), followUp: String(parsed.followUp || body.question.followUp || "Can you make that more concrete?"), source: "groq" });
  } catch { return NextResponse.json(fallback(body)); }
}
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.slice(0, 2).map(String) : ["You addressed the core question.", "Your answer showed relevant experience."]; }
function fallback(body: RequestBody) { const text = body.answer!.toLowerCase(); const signals = body.question?.signals ?? []; const hits = signals.filter((signal) => text.includes(signal.toLowerCase())).length; const score = Math.min(92, 50 + hits * 8 + Math.min(22, Math.floor(body.answer!.split(/\s+/).length / 8))); return { score, verdict: score >= 80 ? "Strong answer with credible production judgment" : score >= 65 ? "Sound direction; make your decision criteria clearer" : "A workable start that needs more technical depth", strengths: ["You responded directly to the scenario.", hits ? `You included ${hits} relevant technical signal${hits > 1 ? "s" : ""}.` : "You established a useful starting point."], improvements: ["State assumptions and trade-offs explicitly.", `Include ${signals.filter((signal) => !text.includes(signal.toLowerCase())).slice(0, 2).join(" and ") || "a measurable example"}.`], betterAnswer: body.question?.idealAnswer || "", followUp: body.question?.followUp || "Can you make that concrete?", source: "demo" }; }
