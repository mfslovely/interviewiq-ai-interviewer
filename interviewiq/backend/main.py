"""FastAPI owns every API route and serves the compiled React frontend."""
import json
import math
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .models import Components, Envelope, GeneratedQuestion, Question, QuestionRequest, Review, SpeechRequest, Submission
from .prompts import QUESTION_PROMPT, SCORING_PROMPT
from .provider import GroqProvider
from .security import sign_question, verify_question

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env.local', override=False)
TRACKS = {p.stem: json.loads(p.read_text(encoding='utf-8')) for p in (ROOT / 'backend/question_banks').glob('*.json')}
QUESTIONS = {q['id']: q for track in TRACKS.values() for q in track['questions']}


def weighted_score(c: Components) -> int:
    return math.floor((c.concepts * 50 + c.correctness * 35 + c.clarity * 10 + c.grammar * 5) / 100 + 0.5)


def create_app(provider=None, key=None, static_dir=None):
    api_key = os.getenv('GROQ_API_KEY', '') if key is None else key
    service = provider or GroqProvider(api_key, os.getenv('GROQ_MODEL', 'openai/gpt-oss-20b'), os.getenv('GROQ_TTS_VOICE', 'hannah'))

    @asynccontextmanager
    async def lifespan(app):
        yield
        if provider is None:
            await service.close()

    app = FastAPI(title='InterviewIQ FastAPI Backend', version='2.0.0', lifespan=lifespan)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        # Do not echo request bodies/tokens/secrets in validation errors.
        return JSONResponse({'error': 'Invalid submission'}, status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({'error': exc.detail}, status_code=exc.status_code)

    @app.middleware('http')
    async def limit_body(request: Request, call_next):
        limits = {'/api/question': 24000, '/api/interview': 80000, '/api/speech': 2000}
        if request.method == 'POST' and request.url.path in limits:
            chunks, size = [], 0
            async for chunk in request.stream():
                size += len(chunk)
                if size > limits[request.url.path]:
                    return JSONResponse({'error': 'Submission too large'}, status_code=413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        response = await call_next(request)
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/api/health')
    async def health():
        return {'status': 'ok', 'service': 'interviewiq', 'backend': 'fastapi', 'language': 'python'}

    @app.post('/api/question')
    async def question(body: QuestionRequest):
        def fallback(reason):
            index = min(len(body.previousQuestions), 4)
            return {'question': TRACKS[body.topic]['questions'][index], 'source': 'curated', 'reason': reason}
        if not api_key:
            return fallback('Groq key missing - curated question')
        try:
            generated = GeneratedQuestion.model_validate(await service.chat(QUESTION_PROMPT, body.model_dump()))
            if body.topic == 'dsa' and not generated.coding:
                raise ValueError('Missing coding exercise')
            if any(q.strip().casefold() == generated.prompt.strip().casefold() for q in body.previousQuestions):
                raise ValueError('Repeated question')
            item = Question(**generated.model_dump(), id=f'ai-{uuid4()}')
            envelope = Envelope(question=item, topic=body.topic, level=body.level, expires=int(time.time()*1000)+14400000)
            return {'question': {**item.model_dump(exclude_none=True), 'token': sign_question(envelope, api_key)}, 'source': 'groq'}
        except Exception:
            return fallback('AI generation unavailable - curated question')

    @app.post('/api/interview')
    async def interview(body: Submission):
        envelope = verify_question(body.question.token, api_key) if body.question.token else None
        if body.question.token and (not envelope or envelope.question.id != body.question.id or envelope.level != body.level):
            raise HTTPException(400, 'Question expired or invalid. Start another interview.')
        item = envelope.question.model_dump(exclude_none=True) if envelope else QUESTIONS.get(body.question.id)
        if not item or not (body.answer.strip() or (body.code or '').strip()):
            raise HTTPException(400, 'A known question and an answer are required')
        if item.get('coding') and not body.followUp and (not (body.code or '').strip() or body.code == item['coding']['starter']):
            raise HTTPException(400, 'Write your solution first')

        def demo(reason):
            return {'score': None, 'verdict': reason,
                    'strengths': ['Your submission was received.', 'Compare your approach with the reference below.'],
                    'improvements': ['No correctness or performance score is assigned in demo mode.', 'Enable Groq for individual feedback on your reasoning and code.'],
                    'betterAnswer': 'Discuss the follow-up using a concrete example. AI review is unavailable in demo mode.' if body.followUp else item['idealAnswer'],
                    'followUp': item['followUp'], 'source': 'demo'}
        if not api_key:
            return demo('Practice received - AI review is not configured')
        context = {'role': envelope.topic if envelope else body.track, 'level': body.level,
                   'question': item['prompt'], 'reference': item['idealAnswer'], 'expectedConcepts': item['signals'],
                   'coding': item.get('coding'), 'candidateAnswer': body.answer, 'candidateCode': body.code,
                   'followUpQuestion': body.followUp, 'previousAnswer': body.previousAnswer}
        try:
            review = Review.model_validate(await service.chat(SCORING_PROMPT, context, scoring=True))
            return {**review.model_dump(), 'score': weighted_score(review.components), 'source': 'groq'}
        except Exception:
            return demo('AI review is unavailable - reference practice only')

    @app.post('/api/speech')
    async def speech(body: SpeechRequest):
        if not api_key:
            raise HTTPException(503, 'Neural voice requires GROQ_API_KEY')
        try:
            return Response(await service.speech(body.text), media_type='audio/wav')
        except Exception:
            raise HTTPException(502, 'Neural voice unavailable') from None

    # Mount only build output, never the project root or environment files.
    public = Path(static_dir) if static_dir else ROOT / 'dist'
    @app.get('/', include_in_schema=False)
    async def frontend():
        if not (public / 'index.html').is_file():
            raise HTTPException(503, 'Build the React frontend with npm run build:frontend')
        return FileResponse(public / 'index.html', headers={'Cache-Control': 'no-cache'})

    if public.is_dir():
        app.mount('/', StaticFiles(directory=public), name='frontend')
    return app


app = create_app()
