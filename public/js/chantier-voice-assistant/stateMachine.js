const ALLOWED_TRANSITIONS = {
  idle: ['listening', 'speaking', 'processing', 'preview_ready', 'error', 'success'],
  listening: ['processing', 'idle', 'error', 'speaking', 'awaiting_user_answer'],
  speaking: ['awaiting_user_answer', 'preview_ready', 'idle', 'error', 'success'],
  processing: ['awaiting_user_answer', 'preview_ready', 'error', 'idle'],
  awaiting_user_answer: ['listening', 'speaking', 'processing', 'idle', 'error'],
  preview_ready: ['executing', 'idle', 'speaking', 'error'],
  executing: ['success', 'error', 'idle'],
  success: ['idle', 'listening', 'speaking'],
  error: ['idle', 'listening', 'speaking', 'processing']
};

export function createVoiceAssistantStateMachine({
  initialState = 'idle',
  onTransition = () => {}
} = {}) {
  let currentState = initialState;

  return {
    getState() {
      return currentState;
    },
    transition(nextState, payload = {}) {
      if (!nextState || nextState === currentState) {
        return currentState;
      }

      const allowed = ALLOWED_TRANSITIONS[currentState] || [];
      if (!allowed.includes(nextState)) {
        console.warn(`[voice] invalid transition ${currentState} -> ${nextState}`);
      }

      const previousState = currentState;
      currentState = nextState;
      onTransition({
        previousState,
        nextState,
        ...payload
      });
      return currentState;
    }
  };
}
