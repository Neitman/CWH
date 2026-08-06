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

interface MemberInfo {
  username: string;
  isHost: boolean;
  canWrite: boolean;
}

interface UserPlaylist {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  song_count: number;
}

interface UserPlaylistItem {
  id: number;
  songId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: number;
  position: number;
  added_at: string;
}

// DOM Elements
const statusBadge = document.getElementById('connection-status')!;
const statusText = statusBadge.querySelector('.status-text')!;

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
const seekBackBtn = document.getElementById('seek-back-btn') as HTMLButtonElement;
const seekForwardBtn = document.getElementById('seek-forward-btn') as HTMLButtonElement;
const loopBtn = document.getElementById('loop-btn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const playIcon = document.getElementById('play-icon')!;
const pauseIcon = document.getElementById('pause-icon')!;

// Fullscreen HUD Elements
const hudElement = document.getElementById('fullscreen-hud')!;
const hudTitle = document.getElementById('hud-title')!;
const hudMeta = document.getElementById('hud-meta')!;
const hudPlayBtn = document.getElementById('hud-play-btn') as HTMLButtonElement;
const hudNextBtn = document.getElementById('hud-next-btn') as HTMLButtonElement;
const hudSeekBackBtn = document.getElementById('hud-seek-back-btn') as HTMLButtonElement;
const hudSeekForwardBtn = document.getElementById('hud-seek-forward-btn') as HTMLButtonElement;
const hudLoopBtn = document.getElementById('hud-loop-btn') as HTMLButtonElement;
const hudExitBtn = document.getElementById('hud-exit-btn') as HTMLButtonElement;
const hudCurrentTime = document.getElementById('hud-current-time')!;
const hudTotalTime = document.getElementById('hud-total-time')!;
const hudProgressBar = document.getElementById('hud-progress-bar')!;
const hudProgressWrapper = document.getElementById('hud-progress-wrapper')!;

// Playlist Elements
const playlistQueueList = document.getElementById('playlist-queue-list')!;

// User Playlist Modals & Elements
const openCreatePlaylistBtn = document.getElementById('open-create-playlist-btn');
const createPlaylistModal = document.getElementById('create-playlist-modal');
const closeCreatePlaylistModalBtn = document.getElementById('close-create-playlist-modal-btn');
const createPlaylistForm = document.getElementById('create-playlist-form') as HTMLFormElement;
const playlistTitleInput = document.getElementById('playlist-title-input') as HTMLInputElement;
const playlistDescInput = document.getElementById('playlist-desc-input') as HTMLInputElement;
const createPlaylistError = document.getElementById('create-playlist-error');

const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
const closeAddToPlaylistModalBtn = document.getElementById('close-add-to-playlist-modal-btn');
const modalQuickCreatePlaylistBtn = document.getElementById('modal-quick-create-playlist-btn');

const viewPlaylistModal = document.getElementById('view-playlist-modal');
const closeViewPlaylistModalBtn = document.getElementById('close-view-playlist-modal-btn');
const queueEntirePlaylistBtn = document.getElementById('queue-entire-playlist-btn');

// Socket.io Connection
const socket = io({
  autoConnect: false,
  auth: {
    token: localStorage.getItem('token')
  }
});

// Local State
let currentUser: { id: number; username: string } | null = null;
let currentRoomId = '';
let currentSong: Song | null = null;
let playbackState: PlaybackState = { isPlaying: false, progress: 0 };
let playlistQueue: Song[] = [];
let isSeeking = false;
let isLooping = false;
let updateInterval: number | null = null;
let hudTimeout: number | null = null;
let lastMembersRoster: MemberInfo[] = [];
let playbackStateReceivedAt = 0;
let userPlaylists: UserPlaylist[] = [];
let activeViewingPlaylist: { playlist: UserPlaylist; items: UserPlaylistItem[] } | null = null;
let songSelectedForPlaylist: Omit<Song, 'addedBy'> | null = null;

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



function showToast(message: string, type: 'error' | 'success' | 'info' = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `custom-toast ${type}`;
  toast.style.cssText = `
    min-width: 280px;
    max-width: 400px;
    background: rgba(13, 11, 24, 0.95);
    border: 1px solid ${type === 'error' ? 'rgba(239, 68, 68, 0.4)' : type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(139, 92, 246, 0.4)'};
    color: #f8fafc;
    padding: 14px 20px;
    border-radius: 12px;
    font-size: 0.88rem;
    font-weight: 500;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    gap: 12px;
    transform: translateX(120%);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
    cursor: pointer;
  `;

  let icon = '';
  if (type === 'error') {
    icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else if (type === 'success') {
    icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else {
    icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;">${icon}</div>
    <div style="flex-grow:1;line-height:1.4;">${message}</div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
  });

  const removeToast = () => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 350);
  };

  toast.addEventListener('click', removeToast);
  setTimeout(removeToast, 4000);
}

function updateProgressBarUI(value: number, max: number) {
  if (isSeeking) return;
  progressBar.max = max.toString();
  progressBar.value = Math.floor(value).toString();
  currentTimeEl.textContent = formatTime(value);
  totalTimeEl.textContent = formatTime(max);
  
  const percent = max > 0 ? (value / max) * 100 : 0;
  progressBar.style.setProperty('--progress-percent', `${percent}%`);

  // Update HUD progress details
  if (hudProgressBar) {
    hudProgressBar.style.width = `${percent}%`;
    hudCurrentTime.textContent = formatTime(value);
    hudTotalTime.textContent = formatTime(max);
  }
}

function updatePermissionsUI(canWrite: boolean) {
  playPauseBtn.disabled = !canWrite;
  nextBtn.disabled = !canWrite;
  progressBar.disabled = !canWrite;
  
  if (hudPlayBtn) hudPlayBtn.disabled = !canWrite;
  if (hudNextBtn) hudNextBtn.disabled = !canWrite;
  
  let readonlyNotice = document.getElementById('readonly-notice');
  const playlistCard = document.querySelector('.playlist-card')!;
  
  if (!canWrite) {
    if (!readonlyNotice) {
      readonlyNotice = document.createElement('div');
      readonlyNotice.id = 'readonly-notice';
      readonlyNotice.className = 'readonly-notice';
      readonlyNotice.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span>Read-only: Ask room host to grant edit permissions to add/skip music.</span>
      `;
      playlistCard.insertBefore(readonlyNotice, playlistCard.querySelector('.playlist-container'));
    }
  } else {
    if (readonlyNotice) {
      readonlyNotice.remove();
    }
  }

  // Toggle pointer events blocker overlay for the YouTube iframe
  const videoContainer = document.querySelector('.video-container');
  if (videoContainer) {
    if (!canWrite) {
      videoContainer.classList.add('readonly-iframe');
    } else {
      videoContainer.classList.remove('readonly-iframe');
    }
  }

  // Update dynamically rendered button states in search result items
  const addButtons = document.querySelectorAll('.add-btn') as NodeListOf<HTMLButtonElement>;
  addButtons.forEach(btn => {
    btn.disabled = !canWrite;
    btn.style.opacity = canWrite ? '1' : '0.4';
    btn.title = canWrite ? 'Add to Playlist' : 'Read-only: Ask host for write access';
  });

  // Update dynamically rendered button states in queue items
  const removeButtons = document.querySelectorAll('.remove-btn') as NodeListOf<HTMLButtonElement>;
  removeButtons.forEach(btn => {
    btn.disabled = !canWrite;
    btn.style.opacity = canWrite ? '1' : '0.4';
    btn.title = canWrite ? 'Remove Song' : 'Read-only: Ask host for write access';
  });
}

// Helper: Add Event Log
function addLog(message: string, type: 'system' | 'connect' | 'disconnect' | 'update' = 'system') {
  console.log(`[${type.toUpperCase()}] ${message}`);
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
    if (isLooping && currentSong) {
      addLog(`Looping song: "${currentSong.title}"`, 'system');
      player.seekTo(0, true);
      socket.emit('set-playback', { isPlaying: true, progress: 0 });
    } else {
      // Request next song
      socket.emit('next-song');
    }
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
    seekBackBtn.disabled = false;
    seekForwardBtn.disabled = false;
    loopBtn.disabled = false;
    fullscreenBtn.disabled = false;

    // Update HUD metadata
    if (hudTitle && hudMeta) {
      hudTitle.textContent = currentSong.title;
      const isAddedByMe = currentUser && currentSong.addedBy === currentUser.username;
      const addedByDisplay = isAddedByMe ? 'You' : (currentSong.addedBy || 'Guest');
      hudMeta.textContent = `${currentSong.channelTitle} • Added by ${addedByDisplay}`;
    }

    const duration = (player && typeof player.getDuration === 'function' && player.getDuration() > 0)
      ? player.getDuration()
      : currentSong.duration;

    // Calculate drift compensated progress
    let targetProgress = playbackState.progress;
    if (playbackState.isPlaying && playbackStateReceivedAt > 0) {
      const elapsed = (Date.now() - playbackStateReceivedAt) / 1000;
      targetProgress = Math.min(playbackState.progress + elapsed, duration);
    }

    updateProgressBarUI(targetProgress, duration);

    // Check if the correct video is loaded
    const loadedUrl = player.getVideoUrl() || '';
    if (!loadedUrl.includes(currentSong.id)) {
      if (playbackState.isPlaying) {
        player.loadVideoById({
          videoId: currentSong.id,
          startSeconds: targetProgress
        });
      } else {
        player.cueVideoById({
          videoId: currentSong.id,
          startSeconds: targetProgress
        });
      }
    } else {
      // Correct video loaded, adjust play/pause and progress
      const playerState = player.getPlayerState();
      const localTime = player.getCurrentTime() || 0;
      const timeDiff = Math.abs(localTime - targetProgress);

      if (playbackState.isPlaying) {
        if (playerState !== 1) {
          player.playVideo();
        }
        if (playerState !== 1 || timeDiff > 2) {
          player.seekTo(targetProgress, true);
        }
      } else {
        if (playerState !== 2) {
          player.pauseVideo();
        }
        if (playerState !== 2 || timeDiff > 2) {
          player.seekTo(targetProgress, true);
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
    
    if (hudTitle && hudMeta) {
      hudTitle.textContent = 'No song playing currently';
      hudMeta.textContent = '';
    }
    
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
    // HUD Play state
    if (hudPlayBtn) {
      hudPlayBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>`;
    }
  } else {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    // HUD Pause state
    if (hudPlayBtn) {
      hudPlayBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
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
      playbackStateReceivedAt = Date.now();
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

  const myInfo = lastMembersRoster.find(m => currentUser && m.username === currentUser.username);
  const canWrite = myInfo ? myInfo.canWrite : true; // Default to true if not loaded yet

  results.forEach(video => {
    const item = document.createElement('div');
    item.className = 'music-item';
    
    item.innerHTML = `
      <img src="${video.thumbnail}" class="item-thumb" alt="thumbnail" />
      <div class="item-details">
        <span class="item-title">${video.title}</span>
        <span class="item-channel">${video.channelTitle}</span>
      </div>
      <div class="search-item-actions">
        <button class="btn-add-playlist" title="Save to Personal Playlist">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          + Playlist
        </button>
        <button class="btn-icon add-btn" title="Add to Room Queue" ${!canWrite ? 'disabled style="opacity: 0.4"' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      </div>
    `;

    const addPlaylistBtn = item.querySelector('.btn-add-playlist') as HTMLButtonElement;
    addPlaylistBtn?.addEventListener('click', () => {
      openAddToPlaylistModal(video);
    });

    const addBtn = item.querySelector('.add-btn') as HTMLButtonElement;
    if (!canWrite) {
      addBtn.title = 'Read-only: Ask host for write access';
    }

    addBtn?.addEventListener('click', () => {
      socket.emit('add-song', video);
      addLog(`Requesting to add song: "${video.title}"`, 'system');
      
      // Premium visual feedback (checkmark animation)
      const originalHTML = addBtn.innerHTML;
      addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      addBtn.disabled = true;
      setTimeout(() => {
        addBtn.innerHTML = originalHTML;
        addBtn.disabled = false;
      }, 1000);
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

  const myInfo = lastMembersRoster.find(m => currentUser && m.username === currentUser.username);
  const canWrite = myInfo ? myInfo.canWrite : true; // Default to true if not loaded yet

  queue.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = 'music-item';
    
    const isAddedByMe = currentUser && song.addedBy === currentUser.username;
    const addedByDisplay = isAddedByMe ? 'You' : (song.addedBy || 'Guest');

    item.innerHTML = `
      <img src="${song.thumbnail}" class="item-thumb" alt="thumbnail" />
      <div class="item-details">
        <span class="item-title">${index + 1}. ${song.title}</span>
        <span class="item-channel">${song.channelTitle}</span>
        <span class="item-added-by">Added by: ${addedByDisplay}</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon danger-hover remove-btn" title="Remove" ${!canWrite ? 'disabled style="opacity: 0.4"' : ''}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    `;

    const removeBtn = item.querySelector('.remove-btn') as HTMLButtonElement;
    if (!canWrite) {
      removeBtn.title = 'Read-only: Ask host for write access';
    }

    removeBtn?.addEventListener('click', () => {
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
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
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
    const response = await fetch(`/api/video-details?id=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
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

// Player Helper Actions
function togglePlayPause() {
  if (!player || !playerReady || !currentSong) return;
  const isPlaying = !playbackState.isPlaying;
  const progress = (player && typeof player.getCurrentTime === 'function') ? player.getCurrentTime() : playbackState.progress;
  
  socket.emit('set-playback', { isPlaying, progress });
  
  // Optimistic local state update
  playbackState.isPlaying = isPlaying;
  playbackState.progress = progress;
  syncPlayerWithState();
}

function seekByAmount(deltaSeconds: number) {
  if (!player || !playerReady || !currentSong) return;
  const current = (player && typeof player.getCurrentTime === 'function') ? player.getCurrentTime() : playbackState.progress;
  const duration = (player && typeof player.getDuration === 'function' && player.getDuration() > 0)
    ? player.getDuration()
    : (currentSong.duration || 100);
    
  const newTime = Math.max(0, Math.min(duration, current + deltaSeconds));

  player.seekTo(newTime, true);
  socket.emit('set-playback', {
    isPlaying: playbackState.isPlaying,
    progress: newTime
  });

  const sign = deltaSeconds > 0 ? '+' : '';
  showToast(`Seek ${sign}${deltaSeconds}s (${formatTime(newTime)})`, 'info');
}

function toggleLoop() {
  isLooping = !isLooping;
  updateLoopUI();
  showToast(isLooping ? 'Loop Video: ON' : 'Loop Video: OFF', 'info');
}

function updateLoopUI() {
  if (isLooping) {
    loopBtn?.classList.add('active');
    hudLoopBtn?.classList.add('active');
  } else {
    loopBtn?.classList.remove('active');
    hudLoopBtn?.classList.remove('active');
  }
}

// Global Keyboard Binds (Space = Play/Pause, ArrowLeft = -5s, ArrowRight = +5s)
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    return;
  }

  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
    e.preventDefault();
    seekByAmount(-5);
  } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
    e.preventDefault();
    seekByAmount(5);
  }
});

// Play/Pause Action
playPauseBtn.addEventListener('click', togglePlayPause);
seekBackBtn.addEventListener('click', () => seekByAmount(-5));
seekForwardBtn.addEventListener('click', () => seekByAmount(5));
loopBtn.addEventListener('click', toggleLoop);

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
  addLog(`Socket connected successfully (ID: ${socket.id})`, 'connect');
});

socket.on('disconnect', (reason) => {
  statusBadge.className = 'status-badge disconnected';
  statusText.textContent = 'Disconnected';
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

socket.on('room-members-updated', (data: { members: MemberInfo[]; count: number }) => {
  document.getElementById('room-users-count')!.textContent = data.count.toString();
  lastMembersRoster = data.members;
  
  // Re-evaluate my permission state
  const myInfo = lastMembersRoster.find(m => currentUser && m.username === currentUser.username);
  const canWrite = myInfo ? myInfo.canWrite : false;
  updatePermissionsUI(canWrite);

  renderListenersList(data.members);
});

socket.on('sync-state', (state: { playlist: Song[]; currentSong: Song | null; playback: PlaybackState }) => {
  playlistQueue = state.playlist;
  currentSong = state.currentSong;
  playbackState = state.playback;
  playbackStateReceivedAt = Date.now();
  
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
  playbackStateReceivedAt = Date.now();
  
  syncPlayerWithState();
  if (currentSong) {
    addLog(`Now playing: "${currentSong.title}"`, 'update');
  } else {
    addLog('Playlist ended, player stopped', 'system');
  }
});

socket.on('playback-updated', (data: PlaybackState) => {
  playbackState = data;
  playbackStateReceivedAt = Date.now();
  syncPlayerWithState();
  addLog(`Playback state updated: ${data.isPlaying ? 'Playing' : 'Paused'} at ${formatTime(data.progress)}`, 'update');
});

function renderListenersList(members: MemberInfo[]) {
  const listenersList = document.getElementById('listeners-list')!;
  listenersList.innerHTML = '';
  
  if (members.length === 0) {
    listenersList.innerHTML = `
      <div class="listener-item">
        <div class="listener-meta">
          <span class="status-dot"></span>
          <span class="listener-name">No active listeners</span>
        </div>
      </div>
    `;
    return;
  }
  
  // Check if I am the room host
  const hostMember = members.find(m => m.isHost);
  const hostUsername = hostMember ? hostMember.username : '';
  const amIHost = currentUser && hostUsername === currentUser.username;
  
  members.forEach(member => {
    const item = document.createElement('div');
    item.className = 'listener-item';
    
    // Metadata segment (Status + Username)
    const metaHTML = `
      <div class="listener-meta">
        <span class="status-dot online"></span>
        <span class="listener-name" title="${member.username}">${member.username}</span>
      </div>
    `;
    
    // Action/Badge segment
    let actionHTML = '<div class="listener-actions">';
    if (member.isHost) {
      actionHTML += `<span class="badge-role host">Host</span>`;
    } else {
      if (amIHost) {
        if (member.canWrite) {
          actionHTML += `<button class="btn-xs btn-revoke toggle-perm-btn" data-username="${member.username}" data-write="false">Revoke Edit</button>`;
        } else {
          actionHTML += `<button class="btn-xs btn-grant toggle-perm-btn" data-username="${member.username}" data-write="true">Grant Edit</button>`;
        }
      } else {
        if (member.canWrite) {
          actionHTML += `<span class="badge-role write">Can Edit</span>`;
        }
      }
    }
    actionHTML += '</div>';
    
    item.innerHTML = metaHTML + actionHTML;
    
    // Setup toggle permission click triggers
    const toggleBtn = item.querySelector('.toggle-perm-btn') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetUser = toggleBtn.getAttribute('data-username')!;
        const shouldWrite = toggleBtn.getAttribute('data-write') === 'true';
        
        socket.emit('toggle-permission', {
          targetUsername: targetUser,
          canWrite: shouldWrite
        });
        
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Updating...';
      });
    }
    
    listenersList.appendChild(item);
  });
}

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

// -------------------------------------------------------------
// Fullscreen Overlay HUD Actions
// -------------------------------------------------------------

function showHUD() {
  if (!hudElement) return;
  hudElement.classList.remove('hud-hidden');
  
  if (hudTimeout) {
    clearTimeout(hudTimeout);
  }
  
  // Hide HUD after 3 seconds of mouse inactivity in fullscreen
  hudTimeout = window.setTimeout(() => {
    if (document.fullscreenElement) {
      hudElement.classList.add('hud-hidden');
    }
  }, 3000);
}

// Show HUD on mouse movement inside the player container
document.getElementById('player-container')?.addEventListener('mousemove', () => {
  if (document.fullscreenElement) {
    showHUD();
  }
});

// Sync HUD visibility class on fullscreenchange
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    hudElement.classList.remove('hidden');
    showHUD();
  } else {
    hudElement.classList.add('hidden');
    hudElement.classList.remove('hud-hidden');
    if (hudTimeout) {
      clearTimeout(hudTimeout);
    }
  }
});

// Exit Fullscreen Button in HUD
hudExitBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
});

// Play/Pause Button in HUD
hudPlayBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlayPause();
});

// Seek Back -5s Button in HUD
hudSeekBackBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  seekByAmount(-5);
});

// Seek Forward +5s Button in HUD
hudSeekForwardBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  seekByAmount(5);
});

// Skip/Next Button in HUD
hudNextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!currentUser) {
    showAuthModal();
    return;
  }
  socket.emit('next-song');
});

// Loop Button in HUD
hudLoopBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleLoop();
});

// Click-to-seek Progress Bar in HUD
hudProgressWrapper.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  if (!playerReady || !currentSong) return;
  
  const rect = hudProgressWrapper.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const percentage = Math.max(0, Math.min(1, clickX / width));
  
  const duration = (player && typeof player.getDuration === 'function' && player.getDuration() > 0)
    ? player.getDuration()
    : currentSong.duration;
    
  const seekTime = percentage * duration;
  
  if (player && typeof player.seekTo === 'function') {
    player.seekTo(seekTime, true);
  }
  
  socket.emit('set-playback', { isPlaying: playbackState.isPlaying, progress: seekTime });
});

// -------------------------------------------------------------
// Authentication Giao diện & Xử lý (Auth UI & Logic)
// -------------------------------------------------------------

// DOM Elements
const authModal = document.getElementById('auth-modal')!;
const openAuthBtn = document.getElementById('open-auth-btn')!;
const logoutBtn = document.getElementById('logout-btn')!;
const closeAuthModalBtn = document.getElementById('close-auth-modal-btn')!;
const tabLogin = document.getElementById('tab-login')!;
const tabRegister = document.getElementById('tab-register')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const registerForm = document.getElementById('register-form') as HTMLFormElement;
const userProfileSection = document.getElementById('user-profile-section')!;
const displayUsername = document.getElementById('display-username')!;

const loginUsernameInput = document.getElementById('login-username') as HTMLInputElement;
const loginPasswordInput = document.getElementById('login-password') as HTMLInputElement;
const registerUsernameInput = document.getElementById('register-username') as HTMLInputElement;
const registerEmailInput = document.getElementById('register-email') as HTMLInputElement;
const registerPasswordInput = document.getElementById('register-password') as HTMLInputElement;

const loginErrorMsg = document.getElementById('login-error-msg')!;
const registerErrorMsg = document.getElementById('register-error-msg')!;

// Forgot Password selectors
const forgotPasswordLink = document.getElementById('forgot-password-link')!;
const forgotForm = document.getElementById('forgot-form') as HTMLFormElement;
const forgotEmailInput = document.getElementById('forgot-email') as HTMLInputElement;
const forgotErrorMsg = document.getElementById('forgot-error-msg')!;
const backToLoginLink = document.getElementById('back-to-login-link')!;

// OTP verification selectors
const otpView = document.getElementById('otp-view')!;
const otpTitle = document.getElementById('otp-title')!;
const otpDescription = document.getElementById('otp-description')!;
const otpCodeInput = document.getElementById('otp-code-input') as HTMLInputElement;
const otpNewPasswordGroup = document.getElementById('otp-new-password-group')!;
const otpNewPasswordInput = document.getElementById('otp-new-password') as HTMLInputElement;
const otpErrorMsg = document.getElementById('otp-error-msg')!;
const otpSubmitBtn = document.getElementById('otp-submit-btn') as HTMLButtonElement;
const otpCancelLink = document.getElementById('otp-cancel-link')!;

// OTP Flow variables
let otpFlowType: 'register' | 'reset' = 'register';
let otpFlowEmail = '';

// Open / Close Modal
const showAuthModal = () => {
  authModal.classList.remove('hidden');
  loginErrorMsg.classList.add('hidden');
  registerErrorMsg.classList.add('hidden');
  showOnlyForm('login');
  
  if (!currentUser) {
    closeAuthModalBtn.classList.add('hidden');
  } else {
    closeAuthModalBtn.classList.remove('hidden');
  }
};

const hideAuthModal = () => {
  authModal.classList.add('hidden');
};

openAuthBtn.addEventListener('click', showAuthModal);
closeAuthModalBtn.addEventListener('click', hideAuthModal);

// Close modal when clicking outside (only if user is logged in)
authModal.addEventListener('click', (e) => {
  if (e.target === authModal && currentUser) {
    hideAuthModal();
  }
});

// Panel Switching Helper
function showOnlyForm(formId: 'login' | 'register' | 'forgot' | 'otp') {
  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  forgotForm.classList.add('hidden');
  otpView.classList.add('hidden');
  
  const tabsContainer = document.querySelector('.modal-tabs')!;
  
  if (formId === 'login') {
    loginForm.classList.remove('hidden');
    tabsContainer.classList.remove('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else if (formId === 'register') {
    registerForm.classList.remove('hidden');
    tabsContainer.classList.remove('hidden');
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
  } else {
    tabsContainer.classList.add('hidden');
    if (formId === 'forgot') {
      forgotForm.classList.remove('hidden');
    } else if (formId === 'otp') {
      otpView.classList.remove('hidden');
    }
  }
}

// Tab Switching
tabLogin.addEventListener('click', () => {
  showOnlyForm('login');
});

tabRegister.addEventListener('click', () => {
  showOnlyForm('register');
});

forgotPasswordLink.addEventListener('click', (e) => {
  e.preventDefault();
  forgotEmailInput.value = '';
  forgotErrorMsg.classList.add('hidden');
  showOnlyForm('forgot');
});

backToLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  showOnlyForm('login');
});

otpCancelLink.addEventListener('click', (e) => {
  e.preventDefault();
  if (otpFlowType === 'register') {
    showOnlyForm('register');
  } else {
    showOnlyForm('forgot');
  }
});

// Update Auth UI state
const updateAuthUI = () => {
  if (currentUser) {
    openAuthBtn.classList.add('hidden');
    userProfileSection.classList.remove('hidden');
    displayUsername.textContent = currentUser.username;
    fetchUserPlaylists();
  } else {
    openAuthBtn.classList.remove('hidden');
    userProfileSection.classList.add('hidden');
    displayUsername.textContent = '';
    fetchUserPlaylists();
  }
};

// -------------------------------------------------------------
// User Playlist API & Logic Functions
// -------------------------------------------------------------
async function fetchUserPlaylists() {
  const token = localStorage.getItem('token');
  const playlistsContainer = document.getElementById('user-playlists-list');
  if (!playlistsContainer) return;
  
  if (!token || !currentUser) {
    playlistsContainer.innerHTML = '<div class="search-placeholder">Log in to view and save personal playlists</div>';
    userPlaylists = [];
    return;
  }

  try {
    const res = await fetch('/api/playlists', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      userPlaylists = data.playlists || [];
      renderUserPlaylists();
    }
  } catch (err) {
    console.error('Failed to fetch user playlists:', err);
  }
}

function renderUserPlaylists() {
  const playlistsContainer = document.getElementById('user-playlists-list');
  if (!playlistsContainer) return;

  if (userPlaylists.length === 0) {
    playlistsContainer.innerHTML = '<div class="search-placeholder">No saved playlists yet. Click "+ New Playlist" to create one!</div>';
    return;
  }

  playlistsContainer.innerHTML = '';
  userPlaylists.forEach(pl => {
    const item = document.createElement('div');
    item.className = 'user-playlist-item';
    item.innerHTML = `
      <div class="playlist-info-meta">
        <span class="playlist-item-title">${pl.title}</span>
        <span class="playlist-item-count">${pl.song_count || 0} song${pl.song_count === 1 ? '' : 's'}</span>
      </div>
      <div class="playlist-actions">
        <button class="btn btn-icon btn-icon-sm btn-view-pl" title="View Songs">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button class="btn btn-icon btn-icon-sm btn-queue-pl" title="Queue to Room">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
        <button class="btn btn-icon btn-icon-sm btn-delete-pl" title="Delete Playlist" style="color: var(--color-danger);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    item.querySelector('.btn-view-pl')?.addEventListener('click', () => openPlaylistDetailsModal(pl.id));
    item.querySelector('.btn-queue-pl')?.addEventListener('click', () => queuePlaylistToRoom(pl.id));
    item.querySelector('.btn-delete-pl')?.addEventListener('click', () => deleteUserPlaylist(pl.id));

    playlistsContainer.appendChild(item);
  });
}

async function openPlaylistDetailsModal(playlistId: number) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`/api/playlists/${playlistId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      activeViewingPlaylist = data;
      renderActiveViewingPlaylist();
      if (viewPlaylistModal) viewPlaylistModal.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to load playlist details:', err);
  }
}

function renderActiveViewingPlaylist() {
  if (!activeViewingPlaylist) return;
  const { playlist, items } = activeViewingPlaylist;

  const titleEl = document.getElementById('view-playlist-title');
  const descEl = document.getElementById('view-playlist-desc');
  const container = document.getElementById('view-playlist-items-container');

  if (titleEl) titleEl.textContent = playlist.title;
  if (descEl) descEl.textContent = playlist.description || `${items.length} song(s)`;

  if (!container) return;
  if (items.length === 0) {
    container.innerHTML = '<div class="playlist-placeholder">No songs in this playlist yet. Search music to add!</div>';
    return;
  }

  container.innerHTML = '';
  items.forEach(song => {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.innerHTML = `
      <img src="${song.thumbnail}" class="item-thumb" alt="thumbnail" />
      <div class="item-details">
        <span class="item-title">${song.title}</span>
        <span class="item-channel">${song.channelTitle || ''}</span>
      </div>
      <div class="item-actions">
        <button class="btn-icon btn-queue-song" title="Add to Room Queue">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
        <button class="btn-icon btn-remove-song" title="Remove Song" style="color: var(--color-danger);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    item.querySelector('.btn-queue-song')?.addEventListener('click', () => {
      socket.emit('add-song', {
        id: song.songId,
        title: song.title,
        thumbnail: song.thumbnail,
        channelTitle: song.channelTitle,
        duration: song.duration
      });
      showToast(`Added "${song.title}" to room queue`, 'success');
    });

    item.querySelector('.btn-remove-song')?.addEventListener('click', async () => {
      await removeSongFromUserPlaylist(playlist.id, song.id);
    });

    container.appendChild(item);
  });
}

async function removeSongFromUserPlaylist(playlistId: number, itemId: number) {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const res = await fetch(`/api/playlists/${playlistId}/items/${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showToast('Removed song from playlist', 'success');
      await openPlaylistDetailsModal(playlistId);
      await fetchUserPlaylists();
    }
  } catch (err) {
    console.error('Error removing song:', err);
  }
}

async function deleteUserPlaylist(playlistId: number) {
  if (!confirm('Are you sure you want to delete this playlist?')) return;
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const res = await fetch(`/api/playlists/${playlistId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      showToast('Playlist deleted successfully', 'success');
      if (activeViewingPlaylist?.playlist.id === playlistId && viewPlaylistModal) {
        viewPlaylistModal.classList.add('hidden');
      }
      await fetchUserPlaylists();
    }
  } catch (err) {
    console.error('Error deleting playlist:', err);
  }
}

async function queuePlaylistToRoom(playlistId: number) {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const res = await fetch(`/api/playlists/${playlistId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const items: UserPlaylistItem[] = data.items || [];
      if (items.length === 0) {
        showToast('Playlist is empty', 'error');
        return;
      }
      items.forEach(song => {
        socket.emit('add-song', {
          id: song.songId,
          title: song.title,
          thumbnail: song.thumbnail,
          channelTitle: song.channelTitle,
          duration: song.duration
        });
      });
      showToast(`Queued ${items.length} song(s) to room!`, 'success');
    }
  } catch (err) {
    console.error('Error queuing playlist:', err);
  }
}

function openAddToPlaylistModal(video: Omit<Song, 'addedBy'>) {
  if (!currentUser) {
    showToast('Please log in to save songs to playlists', 'error');
    showAuthModal();
    return;
  }

  songSelectedForPlaylist = video;
  const preview = document.getElementById('add-to-playlist-song-preview');
  if (preview) preview.textContent = `Song: "${video.title}"`;

  const container = document.getElementById('add-to-playlist-list');
  if (!container) return;

  if (userPlaylists.length === 0) {
    container.innerHTML = '<div class="search-placeholder">No saved playlists. Create one first!</div>';
  } else {
    container.innerHTML = '';
    userPlaylists.forEach(pl => {
      const btn = document.createElement('div');
      btn.className = 'user-playlist-item';
      btn.style.cursor = 'pointer';
      btn.innerHTML = `
        <div class="playlist-info-meta">
          <span class="playlist-item-title">${pl.title}</span>
          <span class="playlist-item-count">${pl.song_count || 0} song(s)</span>
        </div>
        <span style="font-size: 0.8rem; color: var(--color-secondary); font-weight: 600;">+ Add</span>
      `;
      btn.addEventListener('click', () => addSongToSpecificPlaylist(pl.id));
      container.appendChild(btn);
    });
  }

  if (addToPlaylistModal) addToPlaylistModal.classList.remove('hidden');
}

async function addSongToSpecificPlaylist(playlistId: number) {
  if (!songSelectedForPlaylist) return;
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`/api/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(songSelectedForPlaylist)
    });

    if (res.ok) {
      showToast('Song added to playlist!', 'success');
      if (addToPlaylistModal) addToPlaylistModal.classList.add('hidden');
      fetchUserPlaylists();
    } else {
      const err = await res.json();
      showToast(err.error || 'Failed to add song to playlist', 'error');
    }
  } catch (err) {
    console.error('Error adding song to playlist:', err);
  }
}

// User Playlist Modal Event Listeners
openCreatePlaylistBtn?.addEventListener('click', () => {
  if (!currentUser) {
    showToast('Please log in to create playlists', 'error');
    showAuthModal();
    return;
  }
  playlistTitleInput.value = '';
  playlistDescInput.value = '';
  if (createPlaylistError) createPlaylistError.classList.add('hidden');
  if (createPlaylistModal) createPlaylistModal.classList.remove('hidden');
});

closeCreatePlaylistModalBtn?.addEventListener('click', () => {
  if (createPlaylistModal) createPlaylistModal.classList.add('hidden');
});

closeAddToPlaylistModalBtn?.addEventListener('click', () => {
  if (addToPlaylistModal) addToPlaylistModal.classList.add('hidden');
});

modalQuickCreatePlaylistBtn?.addEventListener('click', () => {
  if (addToPlaylistModal) addToPlaylistModal.classList.add('hidden');
  if (createPlaylistModal) createPlaylistModal.classList.remove('hidden');
});

closeViewPlaylistModalBtn?.addEventListener('click', () => {
  if (viewPlaylistModal) viewPlaylistModal.classList.add('hidden');
});

queueEntirePlaylistBtn?.addEventListener('click', () => {
  if (activeViewingPlaylist) {
    queuePlaylistToRoom(activeViewingPlaylist.playlist.id);
  }
});

createPlaylistForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = playlistTitleInput.value.trim();
  const description = playlistDescInput.value.trim();

  if (!title) return;
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, description })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Playlist created!', 'success');
      if (createPlaylistModal) createPlaylistModal.classList.add('hidden');
      await fetchUserPlaylists();
      
      // If we came from "Add to Playlist" modal flow, reopen it with the new playlist available!
      if (songSelectedForPlaylist) {
        openAddToPlaylistModal(songSelectedForPlaylist);
      }
    } else {
      if (createPlaylistError) {
        createPlaylistError.textContent = data.error || 'Failed to create playlist.';
        createPlaylistError.classList.remove('hidden');
      }
    }
  } catch (err) {
    console.error('Error creating playlist:', err);
  }
});

// Check User Profile using Token
const checkUserProfile = async () => {
  const storedToken = localStorage.getItem('token');
  if (!storedToken) {
    currentUser = null;
    updateAuthUI();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${storedToken}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      updateAuthUI();
    } else {
      // Token is invalid/expired
      localStorage.removeItem('token');
      currentUser = null;
      updateAuthUI();
    }
  } catch (error) {
    console.error('Failed to verify token:', error);
  }
};

// Login Form Submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorMsg.classList.add('hidden');

  const username = loginUsernameInput.value;
  const password = loginPasswordInput.value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('token', data.token);
      currentUser = data.user;
      updateAuthUI();
      hideAuthModal();
      addLog(`Welcome back, ${data.user.username}!`, 'connect');
      
      // Reconnect Socket with the new auth token
      socket.auth = { token: data.token, roomId: currentRoomId };
      socket.disconnect().connect();
      
      // Auto-join room or show room selection screen if not inside a room
      if (!currentRoomId) {
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
          joinRoom(roomParam);
        } else {
          roomSelectionOverlay.classList.remove('hidden');
        }
      }
      
      // Reset form
      loginUsernameInput.value = '';
      loginPasswordInput.value = '';
    } else {
      loginErrorMsg.textContent = data.error || 'Login failed.';
      loginErrorMsg.classList.remove('hidden');
    }
  } catch (error) {
    loginErrorMsg.textContent = 'Server connection failed.';
    loginErrorMsg.classList.remove('hidden');
  }
});

// Register Form Submit (Triggers OTP Send)
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerErrorMsg.classList.add('hidden');

  const username = registerUsernameInput.value;
  const email = registerEmailInput.value;
  const password = registerPasswordInput.value;

  const submitBtn = document.getElementById('register-submit-btn') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending OTP...';

  try {
    const res = await fetch('/api/auth/register-send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();

    if (res.ok) {
      // Transition to OTP verification panel
      otpFlowType = 'register';
      otpFlowEmail = email;
      
      otpTitle.textContent = 'Verify Registration';
      otpDescription.textContent = `We sent a 6-digit registration code to ${email}.`;
      otpCodeInput.value = '';
      otpNewPasswordGroup.classList.add('hidden');
      otpErrorMsg.classList.add('hidden');
      otpSubmitBtn.textContent = 'Verify & Register';
      
      showOnlyForm('otp');
    } else {
      registerErrorMsg.textContent = data.error || 'Registration failed.';
      registerErrorMsg.classList.remove('hidden');
    }
  } catch (error) {
    registerErrorMsg.textContent = 'Server connection failed.';
    registerErrorMsg.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Registration OTP';
  }
});

// Forgot Password Form Submit (Triggers Reset OTP Send)
forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  forgotErrorMsg.classList.add('hidden');

  const email = forgotEmailInput.value;
  const submitBtn = document.getElementById('forgot-submit-btn') as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending Code...';

  try {
    const res = await fetch('/api/auth/forgot-password-send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok) {
      // Transition to OTP password reset panel
      otpFlowType = 'reset';
      otpFlowEmail = email;
      
      otpTitle.textContent = 'Reset Password';
      otpDescription.textContent = `We sent a 6-digit reset code to ${email}.`;
      otpCodeInput.value = '';
      otpNewPasswordInput.value = '';
      otpNewPasswordGroup.classList.remove('hidden');
      otpErrorMsg.classList.add('hidden');
      otpSubmitBtn.textContent = 'Verify & Reset Password';
      
      showOnlyForm('otp');
    } else {
      forgotErrorMsg.textContent = data.error || 'Failed to send reset code.';
      forgotErrorMsg.classList.remove('hidden');
    }
  } catch (error) {
    forgotErrorMsg.textContent = 'Server connection failed.';
    forgotErrorMsg.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Reset Code';
  }
});

// OTP Verification Form Submit
otpSubmitBtn.addEventListener('click', async () => {
  otpErrorMsg.classList.add('hidden');
  const otp = otpCodeInput.value.trim();

  if (otp.length !== 6 || isNaN(parseInt(otp, 10))) {
    otpErrorMsg.textContent = 'Please enter a valid 6-digit OTP code.';
    otpErrorMsg.classList.remove('hidden');
    return;
  }

  otpSubmitBtn.disabled = true;
  otpSubmitBtn.textContent = 'Verifying...';

  try {
    if (otpFlowType === 'register') {
      const res = await fetch('/api/auth/register-verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpFlowEmail, otp })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        updateAuthUI();
        hideAuthModal();
        addLog(`Welcome to CWH Jamming, ${data.user.username}!`, 'connect');
        
        // Reconnect Socket
        socket.auth = { token: data.token, roomId: currentRoomId };
        socket.disconnect().connect();
        
        // Join room logic
        if (!currentRoomId) {
          const urlParams = new URLSearchParams(window.location.search);
          const roomParam = urlParams.get('room');
          if (roomParam) {
            joinRoom(roomParam);
          } else {
            roomSelectionOverlay.classList.remove('hidden');
          }
        }
        
        // Clear inputs
        registerUsernameInput.value = '';
        registerEmailInput.value = '';
        registerPasswordInput.value = '';
      } else {
        otpErrorMsg.textContent = data.error || 'Email verification failed.';
        otpErrorMsg.classList.remove('hidden');
      }
    } else {
      // Reset password verify
      const newPassword = otpNewPasswordInput.value;
      if (newPassword.length < 6) {
        otpErrorMsg.textContent = 'Password must be at least 6 characters.';
        otpErrorMsg.classList.remove('hidden');
        otpSubmitBtn.disabled = false;
        otpSubmitBtn.textContent = 'Verify & Reset Password';
        return;
      }

      const res = await fetch('/api/auth/reset-password-verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpFlowEmail, otp, newPassword })
      });

      const data = await res.json();

      if (res.ok) {
        showToast('Password reset successfully! You can now log in with your new credentials.', 'success');
        showOnlyForm('login');
        loginUsernameInput.value = '';
        loginPasswordInput.value = '';
      } else {
        otpErrorMsg.textContent = data.error || 'Password reset failed.';
        otpErrorMsg.classList.remove('hidden');
      }
    }
  } catch (error) {
    otpErrorMsg.textContent = 'Server connection failed.';
    otpErrorMsg.classList.remove('hidden');
  } finally {
    otpSubmitBtn.disabled = false;
    otpSubmitBtn.textContent = otpFlowType === 'register' ? 'Verify & Register' : 'Verify & Reset Password';
  }
});

// Logout action
logoutBtn.addEventListener('click', () => {
  const loggedOutUser = currentUser?.username;
  localStorage.removeItem('token');
  currentUser = null;
  updateAuthUI();
  
  if (loggedOutUser) {
    addLog(`${loggedOutUser} logged out.`, 'disconnect');
  }

  // Disconnect Socket entirely
  socket.disconnect();
  
  // Clear room UI
  currentRoomId = '';
  document.getElementById('room-code-display')!.textContent = 'N/A';
  document.getElementById('room-users-count')!.textContent = '0';
  document.getElementById('listeners-list')!.innerHTML = `
    <div class="listener-item">
      <span class="status-dot"></span>
      <span class="listener-name">Awaiting connection...</span>
    </div>
  `;
  
  // Hide room selector overlay when forcing login
  roomSelectionOverlay.classList.add('hidden');
  
  // Force show auth modal (no close button)
  showAuthModal();
});

// Handle authentication errors from socket server
socket.on('auth-error', (data: { error: string }) => {
  addLog(`Access Blocked: ${data.error}`, 'disconnect');
  
  const errText = data.error.toLowerCase();
  if (errText.includes('permission denied') || errText.includes('write access') || errText.includes('only the room host')) {
    showToast(data.error, 'error');
  } else {
    showAuthModal();
  }
});

// App initialization is handled in initApp() at the bottom of the file

// -------------------------------------------------------------
// Room Selector & Join / Leave Room Flow
// -------------------------------------------------------------

const roomSelectionOverlay = document.getElementById('room-selection-overlay')!;
const createRoomBtn = document.getElementById('create-room-btn')!;
const joinRoomBtn = document.getElementById('join-room-btn')!;
const roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
const roomErrorMsg = document.getElementById('room-error-msg')!;
const copyRoomLinkBtn = document.getElementById('copy-room-link-btn')!;
const leaveRoomBtn = document.getElementById('leave-room-btn')!;

// Handle joining a room
function joinRoom(roomId: string) {
  const cleanRoomId = roomId.trim().toLowerCase();
  if (!cleanRoomId) return;

  // Update URL query parameter without reloading page
  const url = new URL(window.location.href);
  url.searchParams.set('room', cleanRoomId);
  window.history.pushState({}, '', url.toString());

  // Connect socket
  connectSocket(cleanRoomId);

  // Hide room selector
  roomSelectionOverlay.classList.add('hidden');
}

// Generate random room code (room-xxxxxx)
function generateRoomCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'room-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Socket Connection with Room Info
function connectSocket(roomId: string) {
  currentRoomId = roomId;
  document.getElementById('room-code-display')!.textContent = roomId.toUpperCase();
  
  socket.auth = {
    token: localStorage.getItem('token'),
    roomId: roomId
  };
  
  socket.disconnect().connect();
}

// Create Room Action
createRoomBtn.addEventListener('click', () => {
  const newRoomId = generateRoomCode();
  joinRoom(newRoomId);
});

// Join Room Action
joinRoomBtn.addEventListener('click', () => {
  roomErrorMsg.classList.add('hidden');
  const code = roomCodeInput.value.trim();
  if (!code) {
    roomErrorMsg.textContent = 'Please enter a room code.';
    roomErrorMsg.classList.remove('hidden');
    return;
  }
  joinRoom(code);
});

roomCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoomBtn.click();
});

// Leave Room Action
leaveRoomBtn.addEventListener('click', () => {
  // Clear URL parameter
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.pushState({}, '', url.toString());

  // Disconnect socket
  socket.disconnect();
  currentRoomId = '';

  // Reset UI
  document.getElementById('room-code-display')!.textContent = 'N/A';
  document.getElementById('room-users-count')!.textContent = '0';
  document.getElementById('listeners-list')!.innerHTML = `
    <div class="listener-item">
      <span class="status-dot"></span>
      <span class="listener-name">Awaiting connection...</span>
    </div>
  `;

  // Show Room Selector
  roomCodeInput.value = '';
  roomSelectionOverlay.classList.remove('hidden');
});

// Copy Invite Link Action
copyRoomLinkBtn.addEventListener('click', async () => {
  const inviteUrl = window.location.href;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    // Show temporary feedback on button
    const originalHTML = copyRoomLinkBtn.innerHTML;
    copyRoomLinkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    copyRoomLinkBtn.setAttribute('title', 'Copied!');
    setTimeout(() => {
      copyRoomLinkBtn.innerHTML = originalHTML;
      copyRoomLinkBtn.setAttribute('title', 'Copy Invite Link');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy link:', err);
  }
});

// Page Load Initialization Flow
async function initApp() {
  await checkUserProfile();
  
  // Hide global preloader once page load and user verification completes
  const preloader = document.getElementById('global-preloader');
  if (preloader) {
    preloader.style.opacity = '0';
    preloader.style.visibility = 'hidden';
    setTimeout(() => preloader.remove(), 400);
  }
  
  if (!currentUser) {
    showAuthModal();
    return;
  }
  
  // Page Load: check if room is in URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    joinRoom(roomParam);
  } else {
    roomSelectionOverlay.classList.remove('hidden');
  }
}

initApp();
