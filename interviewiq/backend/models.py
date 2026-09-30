"""Validated HTTP and provider contracts. Field names match the React client."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Topic = Literal['python', 'fullstack', 'rag', 'genai', 'frontend', 'aws', 'dsa']
Level = Literal['Junior', 'Mid-level', 'Senior']
Text1500 = Annotated[str, StringConstraints(max_length=1500)]
Text1000 = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
Percentage = Annotated[int, Field(strict=True, ge=0, le=100)]


class Coding(BaseModel):
    starter: str = Field(max_length=3000)
    examples: list[Annotated[str, StringConstraints(max_length=500)]] = Field(min_length=1, max_length=5)
    constraints: str = Field(max_length=1500)
    solution: str = Field(max_length=6000)
    complexity: str = Field(max_length=1000)


class GeneratedQuestion(BaseModel):
    prompt: str = Field(min_length=10, max_length=1500)
    followUp: str = Field(min_length=1, max_length=1000)
    idealAnswer: str = Field(min_length=1, max_length=5000)
    signals: list[Annotated[str, StringConstraints(max_length=150)]] = Field(min_length=3, max_length=8)
    coding: Coding | None = None


class Question(GeneratedQuestion):
    id: str = Field(min_length=1, max_length=80)


class QuestionRequest(BaseModel):
    topic: Topic
    level: Level
    previousQuestions: list[Text1500] = Field(default_factory=list, max_length=5)
    lastAnswer: str = Field(default='', max_length=12000)
    lastFeedback: str = Field(default='', max_length=600)


class QuestionReference(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    token: str | None = Field(default=None, max_length=40000)


class Submission(BaseModel):
    track: str = Field(max_length=100)
    level: Level
    question: QuestionReference
    answer: str = Field(default='', max_length=12000)
    code: str | None = Field(default=None, max_length=20000)
    followUp: str | None = Field(default=None, max_length=2000)
    previousAnswer: str | None = Field(default=None, max_length=12000)


class SpeechRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class Components(BaseModel):
    model_config = ConfigDict(extra='forbid')
    concepts: Percentage
    correctness: Percentage
    clarity: Percentage
    grammar: Percentage


class Review(BaseModel):
    model_config = ConfigDict(extra='forbid')
    components: Components
    verdict: str = Field(min_length=1, max_length=600)
    strengths: list[Text1000] = Field(min_length=2, max_length=2)
    improvements: list[Text1000] = Field(min_length=2, max_length=2)
    betterAnswer: str = Field(min_length=1, max_length=6000)
    followUp: str = Field(min_length=1, max_length=2000)


class Envelope(BaseModel):
    question: Question
    topic: Topic
    level: Level
    expires: int
