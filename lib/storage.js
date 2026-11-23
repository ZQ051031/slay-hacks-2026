const KEY = 'quizforge-v1';

export function loadState(storage) {
  try {
    const state = JSON.parse(storage.getItem(KEY));
    if (state && typeof state.notes === 'string' && Array.isArray(state.cards) && Array.isArray(state.reviewDays)) {
      return state;
    }
  } catch {
    // Private browsing or disabled storage can make persistence unavailable.
  }
  return { notes: '', cards: [], reviewDays: [] };
}

export function saveState(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
