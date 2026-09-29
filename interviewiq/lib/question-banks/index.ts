import { awsTrack } from "./aws";
import { frontendTrack } from "./frontend";
import { fullstackTrack } from "./fullstack";
import { genaiTrack } from "./genai";
import { pythonTrack } from "./python";
import { ragTrack } from "./rag";
import type { InterviewQuestion, Track, TrackId } from "./types";

export const tracks: Track[] = [pythonTrack, fullstackTrack, ragTrack, genaiTrack, frontendTrack, awsTrack];
export const trackMap = Object.fromEntries(tracks.map((track) => [track.id, track])) as Record<TrackId, Track>;
export const findQuestion = (id: string): InterviewQuestion | undefined => tracks.flatMap((track) => track.questions).find((q) => q.id === id);
export type { Difficulty, InterviewQuestion, Track, TrackId } from "./types";
