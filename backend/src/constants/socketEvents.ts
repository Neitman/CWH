export const SOCKET_EVENTS = {
  // Connection Events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  // Room Events
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  ROOM_DELETED: 'room-deleted',

  // Media / Playback Events
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  SYNC_STATE: 'sync-state',
  PLAYLIST_UPDATED: 'playlist-updated',
  REQUEST_STATE: 'request-state',

  // STG / Study Timer Events
  START_STUDY_TIMER: 'start-study-timer',
  PAUSE_STUDY_TIMER: 'pause-study-timer',
  RESET_STUDY_TIMER: 'reset-study-timer',
  STUDY_TIMER_TICK: 'study-timer-tick',

  // Chat / Discussion Events
  SEND_CHAT: 'send-chat',
  CHAT_MESSAGE: 'chat-message',
  REACTION: 'reaction',
  SYSTEM_RESET: 'system-reset',
} as const;
