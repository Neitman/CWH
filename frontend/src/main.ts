import { io } from 'socket.io-client';
import './style.css';

interface Song {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: number;
  addedBy: string;
}

interface PlaybackState {
  isPlaying: boolean;
  progress: number;
}

// DOM Elements
const statusBadge = document.getElementById('connection-status')!;
const statusText = statusBadge.querySelector('.status-text')!;
const socketIdEl = document.getElementById('socket-id')!;
const connectedCountEl = document.getElementById('connected-count')!;
const logsList = document.getElementById('logs-list')!;

// Search Elements
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
const idInput = document.getElementById('id-input') as HTMLInputElement;
const idBtn = document.getElementById('id-btn') as HTMLButtonElement;
const searchResultsList = document.getElementById('search-results-list')!;

// Player Elements
const playerSongTitle = document.getElementById('player-song-title')!;
const playerSongChannel = document.getElementById('player-song-channel')!;
const progressBar = document.getElementById('progress-bar') as HTMLInputElement;
const currentTimeEl = document.getElementById('current-time')!;
const totalTimeEl = document.getElementById('total-time')!;
const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const playIcon = document.getElementById('play-icon')!;
const pauseIcon = document.getElementById('pause-icon')!;

// Playlist Elements
const playlistQueueList = document.getElementById('playlist-queue-list')!;

// Socket.io Connection
const socket = io();

// Local State
let currentSong: Song | null = null;
let playbackState: PlaybackState = { isPlaying: false, progress: 0 };
let playlistQueue: Song[] = [];
let isSeeking = false;
let updateInterval: number | null = null;

// YouTube Iframe Player
let player: any = null;
let playerReady = false;

// Helpers: Time Formatting (e.g. 185 -> 3:05)
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getFormattedClockTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function updateProgressBarUI(value: number, max: number) {
  if (isSeeking) return;
  progressBar.max = max.toString();
  progressBar.value = Math.floor(value).toString();
  currentTimeEl.textContent = formatTime(value);
  totalTimeEl.textContent = formatTime(max);
  
  const percent = max > 0 ? (value / max) * 100 : 0;
  progressBar.style.setProperty('--progress-percent', `${percent}%`);
}

// Helper: Add Event Log
function addLog(message: string, type: 'system' | 'connect' | 'disconnect' | 'update' = 'system') {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = getFormattedClockTime();
  
  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-message';
  msgSpan.textContent = message;
  
  logEntry.appendChild(timeSpan);
  logEntry.appendChild(msgSpan);
  
  logsList.appendChild(logEntry);
  logsList.scrollTop = logsList.scrollHeight;
}

// -------------------------------------------------------------
// YouTube Iframe Player API Setup
// -------------------------------------------------------------
const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

(window as any).onYouTubeIframeAPIReady = () => {
  player = new (window as any).YT.Player('youtube-player', {
    height: '100%',
    width: '100%',
    videoId: '',
    playerVars: {
      playsinline: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

function onPlayerReady() {
  playerReady = true;
  addLog('YouTube Player API initialized successfully', 'system');
  syncPlayerWithState();
  
  // Start polling player position
  startPollingProgress();
}

function onPlayerStateChange(event: any) {
  // YT.PlayerState.ENDED is 0
  if (event.data === 0) {
    addLog(`Song ended: "${currentSong?.title || 'Unknown'}"`, 'system');
    // Request next song
    socket.emit('next-song');
  }
}

// -------------------------------------------------------------
// Sync Player Local Actions
// -------------------------------------------------------------
function syncPlayerWithState() {
  if (!playerReady || !player) return;

  if (currentSong) {
    playerSongTitle.textContent = currentSong.title;
    playerSongChannel.textContent = currentSong.channelTitle;
    
    playPauseBtn.disabled = false;
    nextBtn.disabled = false;
    fullscreenBtn.disabled = false;

    const duration = (player && typeof player.getDuration === 'function' && player.getDuration() > 0)
      ? player.getDuration()
      : currentSong.duration;

    updateProgressBarUI(playbackState.progress, duration);

    // Check if the correct video is loaded
    const loadedUrl = player.getVideoUrl() || '';
    if (!loadedUrl.includes(currentSong.id)) {
      if (playbackState.isPlaying) {
        player.loadVideoById({
          videoId: currentSong.id,
          startSeconds: playbackState.progress
        });
      } else {
        player.cueVideoById({
          videoId: currentSong.id,
          startSeconds: playbackState.progress
        });
      }
    } else {
      // Correct video loaded, adjust play/pause and progress
      const playerState = player.getPlayerState();
      const localTime = player.getCurrentTime() || 0;
      const timeDiff = Math.abs(localTime - playbackState.progress);

      if (playbackState.isPlaying) {
        if (playerState !== 1) {
          player.playVideo();
        }
        if (playerState !== 1 || timeDiff > 2) {
          player.seekTo(playbackState.progress, true);
        }
      } else {
        if (playerState !== 2) {
          player.pauseVideo();
        }
        if (playerState !== 2 || timeDiff > 2) {
          player.seekTo(playbackState.progress, true);
        }
      }
    }
  } else {
    // No song
    playerSongTitle.textContent = 'No song playing currently';
    playerSongChannel.textContent = '';
    
    updateProgressBarUI(0, 100);
    
    playPauseBtn.disabled = true;
    nextBtn.disabled = true;
    fullscreenBtn.disabled = true;
    
    if (player && player.stopVideo) {
      player.stopVideo();
    }
  }

  updatePlayPauseButtonUI();
}

function updatePlayPauseButtonUI() {
  if (playbackState.isPlaying) {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  }
}

function startPollingProgress() {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = window.setInterval(() => {
    if (!player || !playerReady || !currentSong || isSeeking) return;
    
    const playerState = player.getPlayerState();
    if (playerState === 1) { // Playing
      const time = player.getCurrentTime();
      playbackState.progress = time;
      const duration = player.getDuration() || currentSong.duration;
      updateProgressBarUI(time, duration);
    }
  }, 500);
}

// -------------------------------------------------------------
// UI Rendering: Search Results & Playlist Queue
// -------------------------------------------------------------
function renderSearchResults(results: Omit<Song, 'addedBy'>[]) {
  searchResultsList.innerHTML = '';
  if (results.length === 0) {
    searchResultsList.innerHTML = '<div class="search-placeholder">No results found.</div>';
    return;
  }

  results.forEach(video => {
    const item = document.createElement('div');
    item.className = 'music-item';
    
    item.innerHTML = `
      <img src="${video.thumbnail}" class="item-thumb" alt="thumbnail" />
      <div class="item-details">
        <span class="item-title">${video.title}</span>
        <span class="item-channel">${video.channelTitle}</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon add-btn" title="Add to Playlist">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    `;

    item.querySelector('.add-btn')?.addEventListener('click', () => {
      socket.emit('add-song', video);
      addLog(`Requesting to add song: "${video.title}"`, 'system');
      // Clear search
      searchInput.value = '';
      searchResultsList.innerHTML = '<div class="search-placeholder">Type keywords and click Search...</div>';
    });

    searchResultsList.appendChild(item);
  });
}

function renderPlaylistQueue(queue: Song[]) {
  playlistQueueList.innerHTML = '';
  if (queue.length === 0) {
    playlistQueueList.innerHTML = '<div class="playlist-placeholder">Queue is empty. Search and add some music!</div>';
    return;
  }

  queue.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = 'music-item';
    
    const isAddedByMe = song.addedBy === socket.id;
    const addedByDisplay = isAddedByMe ? 'You' : `Client ${song.addedBy.slice(0, 4)}`;

    item.innerHTML = `
      <img src="${song.thumbnail}" class="item-thumb" alt="thumbnail" />
      <div class="item-details">
        <span class="item-title">${index + 1}. ${song.title}</span>
        <span class="item-channel">${song.channelTitle}</span>
        <span class="item-added-by">Added by: ${addedByDisplay}</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon danger-hover remove-btn" title="Remove">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    `;

    item.querySelector('.remove-btn')?.addEventListener('click', () => {
      socket.emit('remove-song', song.id);
      addLog(`Requesting to remove song: "${song.title}"`, 'system');
    });

    playlistQueueList.appendChild(item);
  });
}

// -------------------------------------------------------------
// Interactive Controls & Form Event Listeners
// -------------------------------------------------------------
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  searchBtn.disabled = true;
  searchResultsList.innerHTML = '<div class="search-placeholder">Searching YouTube...</div>';

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Search failed');
    const results = await response.json();
    renderSearchResults(results);
  } catch (error) {
    addLog(`Search failed: ${(error as Error).message}`, 'disconnect');
    searchResultsList.innerHTML = '<div class="search-placeholder">Failed to retrieve search results.</div>';
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch();
});

async function performIdFetch() {
  const query = idInput.value.trim();
  if (!query) return;

  idBtn.disabled = true;
  searchResultsList.innerHTML = '<div class="search-placeholder">Fetching video details...</div>';

  try {
    const response = await fetch(`/api/video-details?id=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Fetching details failed');
    const results = await response.json();
    renderSearchResults(results);
  } catch (error) {
    addLog(`Fetch failed: ${(error as Error).message}`, 'disconnect');
    searchResultsList.innerHTML = '<div class="search-placeholder">Failed to retrieve video details. Make sure the ID or URL is correct.</div>';
  } finally {
    idBtn.disabled = false;
  }
}

idBtn.addEventListener('click', performIdFetch);
idInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performIdFetch();
});

// Play/Pause Action
playPauseBtn.addEventListener('click', () => {
  if (!player || !playerReady || !currentSong) return;
  const isPlaying = !playbackState.isPlaying;
  const progress = player.getCurrentTime() || 0;
  
  socket.emit('set-playback', { isPlaying, progress });
  
  // Optimistic local state update
  playbackState.isPlaying = isPlaying;
  playbackState.progress = progress;
  syncPlayerWithState();
});

// Next/Skip Action
nextBtn.addEventListener('click', () => {
  socket.emit('next-song');
});

// Progress Bar Range Inputs
progressBar.addEventListener('input', () => {
  isSeeking = true;
  const val = parseFloat(progressBar.value);
  currentTimeEl.textContent = formatTime(val);
  const max = parseFloat(progressBar.max) || 100;
  const percent = max > 0 ? (val / max) * 100 : 0;
  progressBar.style.setProperty('--progress-percent', `${percent}%`);
});

progressBar.addEventListener('change', () => {
  if (!player || !playerReady || !currentSong) return;
  const val = parseFloat(progressBar.value);
  
  player.seekTo(val, true);
  socket.emit('set-playback', {
    isPlaying: playbackState.isPlaying,
    progress: val
  });
  
  isSeeking = false;
});

// -------------------------------------------------------------
// Socket Event Listeners
// -------------------------------------------------------------
socket.on('connect', () => {
  statusBadge.className = 'status-badge connected';
  statusText.textContent = 'Connected';
  socketIdEl.textContent = socket.id || 'N/A';
  addLog(`Socket connected successfully (ID: ${socket.id})`, 'connect');
});

socket.on('disconnect', (reason) => {
  statusBadge.className = 'status-badge disconnected';
  statusText.textContent = 'Disconnected';
  socketIdEl.textContent = 'Not connected';
  connectedCountEl.textContent = '0';
  playPauseBtn.disabled = true;
  nextBtn.disabled = true;
  fullscreenBtn.disabled = true;
  addLog(`Socket disconnected: ${reason}`, 'disconnect');
});

socket.on('connect_error', (error) => {
  statusBadge.className = 'status-badge disconnected';
  statusText.textContent = 'Connection Error';
  addLog(`Connection error: ${error.message}`, 'disconnect');
});

socket.on('clients-count', (count: number) => {
  connectedCountEl.textContent = count.toString();
});

socket.on('sync-state', (state: { playlist: Song[]; currentSong: Song | null; playback: PlaybackState }) => {
  playlistQueue = state.playlist;
  currentSong = state.currentSong;
  playbackState = state.playback;
  
  renderPlaylistQueue(playlistQueue);
  syncPlayerWithState();
  
  addLog('Synchronized workspace state from Redis', 'system');
});

socket.on('playlist-updated', (queue: Song[]) => {
  playlistQueue = queue;
  renderPlaylistQueue(playlistQueue);
  addLog('Playlist queue updated', 'update');
});

socket.on('play', (data: { currentSong: Song | null; playback: PlaybackState }) => {
  currentSong = data.currentSong;
  playbackState = data.playback;
  
  syncPlayerWithState();
  if (currentSong) {
    addLog(`Now playing: "${currentSong.title}"`, 'update');
  } else {
    addLog('Playlist ended, player stopped', 'system');
  }
});

socket.on('playback-updated', (data: PlaybackState) => {
  playbackState = data;
  syncPlayerWithState();
  addLog(`Playback state updated: ${data.isPlaying ? 'Playing' : 'Paused'} at ${formatTime(data.progress)}`, 'update');
});

function toggleFullscreen() {
  if (!playerReady || !currentSong) return;
  const container = document.querySelector('.video-container')!;
  
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);

// Also toggle fullscreen on double clicking the video container
document.querySelector('.video-container')?.addEventListener('dblclick', toggleFullscreen);
