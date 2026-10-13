import { create } from 'zustand';

interface TutorState {
  /** Selected textbook filter (empty = all published books). */
  subject: string;
  bookId: string;
  /** Guest mode: true when no auth token is present. */
  isGuest: boolean;
  guestUsed: number;
  setSubject: (subject: string) => void;
  setBookId: (bookId: string) => void;
  setGuest: (guest: boolean) => void;
  bumpGuestUsed: () => void;
  resetTutor: () => void;
}

/** Client-independent tutor preferences. Original learner input is never rewritten. */
export const useTutorStore = create<TutorState>((set) => ({
  subject: localStorage.getItem('tutor_subject') || '',
  bookId: localStorage.getItem('tutor_book') || '',
  isGuest: !localStorage.getItem('nf_access_token'),
  guestUsed: 0,

  setSubject(subject) {
    localStorage.setItem('tutor_subject', subject);
    set({ subject });
  },
  setBookId(bookId) {
    localStorage.setItem('tutor_book', bookId);
    set({ bookId });
  },
  setGuest(guest) {
    set({ isGuest: guest });
  },
  bumpGuestUsed() {
    set((s) => ({ guestUsed: s.guestUsed + 1 }));
  },
  resetTutor() {
    localStorage.removeItem('tutor_subject');
    localStorage.removeItem('tutor_book');
    set({ subject: '', bookId: '', guestUsed: 0 });
  },
}));
