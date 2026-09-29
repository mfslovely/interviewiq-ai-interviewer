export type TrackId = "python" | "fullstack" | "rag" | "genai" | "frontend" | "aws";

export type Difficulty = "Junior" | "Mid-level" | "Senior";

export type InterviewQuestion = {
  id: string;
  prompt: string;
  followUp: string;
  idealAnswer: string;
  signals: string[];
};

export type Track = {
  id: TrackId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  questions: InterviewQuestion[];
};
