import { create } from 'zustand';

import { LOCKED_DISCOVERY_ANSWERS } from '../features/discovery/lockedAnswers';
import { DISCOVERY_QUESTIONS } from '../features/discovery/questions';

const lockedComplete =
  DISCOVERY_QUESTIONS.every((question) => LOCKED_DISCOVERY_ANSWERS[question.id] != null);

export const useDiscoveryStore = create<{
  index: number;
  answers: Record<string, string>;
  answer: (questionId: string, optionId: string) => void;
  back: () => void;
  reset: () => void;
}>((set, get) => ({
  index: lockedComplete ? DISCOVERY_QUESTIONS.length : 0,
  answers: { ...LOCKED_DISCOVERY_ANSWERS },

  answer(questionId, optionId) {
    const nextAnswers = { ...get().answers, [questionId]: optionId };
    const nextIndex = Math.min(get().index + 1, DISCOVERY_QUESTIONS.length);
    set({ answers: nextAnswers, index: nextIndex });
  },

  back() {
    set({ index: Math.max(0, get().index - 1) });
  },

  reset() {
    set({ index: 0, answers: {} });
  },
}));
