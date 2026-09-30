"""Async Groq transport. No secrets or candidate submissions are logged."""
import httpx
from .models import Review


class GroqProvider:
    def __init__(self, key: str, model: str, voice: str):
        self.key, self.model, self.voice = key, model, voice
        self.client = httpx.AsyncClient(
            base_url='https://api.groq.com/openai/v1/', timeout=25,
            headers={'Authorization': f'Bearer {key}'},
        )

    async def close(self):
        await self.client.aclose()

    async def chat(self, prompt: str, context: dict, scoring: bool = False) -> dict:
        import json
        response_format = {'type': 'json_object'}
        if scoring:
            response_format = {'type': 'json_schema', 'json_schema': {
                'name': 'interview_review', 'strict': True, 'schema': Review.model_json_schema(),
            }}
        response = await self.client.post('chat/completions', json={
            'model': self.model, 'temperature': 0.25 if scoring else 0.7,
            'max_completion_tokens': 3000, 'response_format': response_format,
            'messages': [{'role': 'system', 'content': prompt},
                         {'role': 'user', 'content': json.dumps(context)}],
        })
        response.raise_for_status()
        return json.loads(response.json()['choices'][0]['message']['content'])

    async def speech(self, text: str) -> bytes:
        response = await self.client.post('audio/speech', timeout=20, json={
            'model': 'canopylabs/orpheus-v1-english', 'voice': self.voice,
            'input': text, 'response_format': 'wav',
        })
        response.raise_for_status()
        data = response.content
        if not (data[:4] == b'RIFF' and data[8:12] == b'WAVE'):
            raise ValueError('Invalid speech response')
        return data
