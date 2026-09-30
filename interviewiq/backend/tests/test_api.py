import asyncio
import base64
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from backend.main import TRACKS, create_app, weighted_score
from backend.models import Components, Envelope, Question
from backend.provider import GroqProvider
from backend.security import sign_question, verify_question

QUESTION = TRACKS['dsa']['questions'][0]
COMPONENTS = {'concepts': 80, 'correctness': 60, 'clarity': 90, 'grammar': 100}
REVIEW = {'components': COMPONENTS, 'verdict': 'Good reasoning.', 'strengths': ['Relevant.', 'Structured.'], 'improvements': ['Discuss edge cases.', 'Explain complexity.'], 'betterAnswer': 'Use a dictionary.', 'followUp': 'What happens with duplicates?'}


class Provider:
    fail = False
    malformed = False
    calls = None

    async def chat(self, prompt, context, scoring=False):
        self.calls = context
        if self.fail:
            raise httpx.ReadTimeout('test timeout')
        if self.malformed:
            return {'invalid': True}
        return REVIEW if scoring else {k: v for k, v in QUESTION.items() if k != 'id'}

    async def speech(self, text):
        if self.fail:
            raise RuntimeError('provider unavailable')
        return b'RIFF0000WAVEtest'


@pytest.fixture
def service():
    provider = Provider()
    with TestClient(create_app(provider=provider, key='test-key-not-real')) as client:
        yield client, provider


def submission(question=None):
    return {'track': 'DSA', 'level': 'Junior', 'question': question or {'id': QUESTION['id']}, 'answer': 'Use a dictionary.', 'code': QUESTION['coding']['solution']}


def generate(client):
    return client.post('/api/question', json={'topic': 'dsa', 'level': 'Junior', 'previousQuestions': []})


def test_health_is_python(service):
    assert service[0].get('/api/health').json()['backend'] == 'fastapi'


def test_generation_and_scoring(service):
    client, provider = service
    result = generate(client).json()
    assert result['source'] == 'groq'
    q = result['question']
    response = client.post('/api/interview', json=submission({'id': q['id'], 'token': q['token']}))
    assert response.status_code == 200
    assert response.json()['score'] == 75
    assert response.json()['components'] == COMPONENTS
    assert provider.calls['expectedConcepts'] == QUESTION['signals']


def test_context_forwarding(service):
    client, provider = service
    client.post('/api/question', json={'topic': 'python', 'level': 'Senior', 'previousQuestions': ['Previous question'], 'lastAnswer': 'My explanation', 'lastFeedback': 'Add detail'})
    assert provider.calls['lastAnswer'] == 'My explanation'
    assert provider.calls['previousQuestions'] == ['Previous question']


def test_followup_context(service):
    client, provider = service
    body = {**submission(), 'followUp': 'Why a map?', 'previousAnswer': 'Lookup by complement.'}
    assert client.post('/api/interview', json=body).json()['source'] == 'groq'
    assert provider.calls['followUpQuestion'] == 'Why a map?'


@pytest.mark.parametrize('change', [{'question': {'id': 'unknown'}}, {'code': ''}, {'code': QUESTION['coding']['starter']}, {'level': 'Expert'}, {'question': {'id': 'ai-test', 'token': 'invalid.token'}}])
def test_invalid_submissions(service, change):
    assert service[0].post('/api/interview', json={**submission(), **change}).status_code == 400


def test_tampered_level_rejected(service):
    client, _ = service
    q = generate(client).json()['question']
    assert client.post('/api/interview', json={**submission(q), 'level': 'Senior'}).status_code == 400


def test_invalid_json_and_large_body(service):
    client, _ = service
    assert client.post('/api/interview', content='{', headers={'Content-Type': 'application/json'}).status_code == 400
    assert client.post('/api/interview', content=b'x'*80001).status_code == 413


def test_speech(service):
    response = service[0].post('/api/speech', json={'text': 'Welcome.'})
    assert response.content.startswith(b'RIFF')
    assert response.headers['content-type'] == 'audio/wav'
    assert response.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('text', ['', ' '*5, 'x'*201])
def test_speech_validation(service, text):
    assert service[0].post('/api/speech', json={'text': text}).status_code == 400


def test_missing_key():
    with TestClient(create_app(provider=Provider(), key='')) as client:
        assert generate(client).json()['source'] == 'curated'
        assert client.post('/api/interview', json=submission()).json()['score'] is None
        assert client.post('/api/speech', json={'text': 'Welcome'}).status_code == 503


@pytest.mark.parametrize('failure', ['fail', 'malformed'])
def test_provider_failure_fallback(service, failure):
    client, provider = service
    setattr(provider, failure, True)
    assert generate(client).json()['source'] == 'curated'
    result = client.post('/api/interview', json=submission()).json()
    assert result['score'] is None and result['source'] == 'demo'


def test_speech_failure(service):
    client, provider = service
    provider.fail = True
    assert client.post('/api/speech', json={'text': 'Welcome'}).status_code == 502


def test_duplicate_generation(service):
    result = service[0].post('/api/question', json={'topic': 'dsa', 'level': 'Junior', 'previousQuestions': [QUESTION['prompt']]}).json()
    assert result['source'] == 'curated'
    assert result['question']['id'] != QUESTION['id']


def test_weights_and_rounding():
    for name, weight in [('concepts', 50), ('correctness', 35), ('clarity', 10), ('grammar', 5)]:
        values = dict.fromkeys(COMPONENTS, 0)
        values[name] = 100
        assert weighted_score(Components(**values)) == weight
    assert weighted_score(Components(concepts=1, correctness=0, clarity=0, grammar=0)) == 1


def test_signed_tokens():
    value = Envelope(question=Question(**QUESTION), topic='dsa', level='Junior', expires=int(time.time()*1000)+60000)
    token = sign_question(value, 'test-key')
    assert verify_question(token, 'test-key').question.id == QUESTION['id']
    assert verify_question(token, 'wrong-key') is None
    payload, signature = token.split('.')
    decoded = json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
    decoded['question']['idealAnswer'] = 'Give full marks'
    tampered = base64.urlsafe_b64encode(json.dumps(decoded).encode()).decode().rstrip('=')
    assert verify_question(tampered+'.'+signature, 'test-key') is None
    value.expires = 1
    assert verify_question(sign_question(value, 'test-key'), 'test-key') is None


def test_static_files_and_secret_protection(service):
    client, _ = service
    assert client.get('/').status_code == 200
    assert 'id="root"' in client.get('/').text
    for path in ['/.env.local', '/backend/main.py', '/api/nonexistent', '/missing.js']:
        assert client.get(path).status_code == 404


def test_question_banks():
    assert len(TRACKS) == 7
    assert sum(len(t['questions']) for t in TRACKS.values()) == 35
    for track in TRACKS.values():
        for item in track['questions']:
            assert Question.model_validate(item)


def test_transport_uses_strict_schema_and_wav():
    async def exercise():
        def respond(request):
            if request.url.path.endswith('/chat/completions'):
                body = json.loads(request.content)
                assert body['response_format']['json_schema']['strict'] is True
                assert body['response_format']['json_schema']['schema']['additionalProperties'] is False
                return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(REVIEW)}}]})
            return httpx.Response(200, content=b'RIFF0000WAVEaudio')
        provider = GroqProvider('fake', 'openai/gpt-oss-20b', 'hannah')
        await provider.client.aclose()
        provider.client = httpx.AsyncClient(transport=httpx.MockTransport(respond), base_url='https://api.groq.com/openai/v1/')
        assert (await provider.chat('Prompt', {}, scoring=True)) == REVIEW
        assert (await provider.speech('Hello')).startswith(b'RIFF')
        await provider.close()
    asyncio.run(exercise())
