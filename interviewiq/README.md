# InterviewIQ

InterviewIQ is a voice-enabled AI mock interviewer for Python, full-stack, RAG, GenAI, frontend, and AWS roles. It includes curated question banks, seniority settings, live transcription, spoken questions, per-answer coaching, model answers, follow-ups, and a final scorecard.

## Run locally

```bash
npm ci
copy .env.example .env.local
npm run dev
```

Add your Groq key to `.env.local`. Without a key, the app automatically uses its built-in review mode.

## Environment

- `GROQ_API_KEY`: Groq API key. Kept server-side.
- `GROQ_MODEL`: Optional model override; defaults to `llama-3.3-70b-versatile`.

## Deploy to Render

This repository includes `render.yaml`. Connect the repository as a Render Blueprint and enter `GROQ_API_KEY` when prompted.
