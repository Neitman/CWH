import { io, Socket } from 'socket.io-client';
import { refreshAccessToken, fetchWithAuth, currentUser, getUserPlaylists, getPlaylistDetailsAPI, addSongToPlaylistAPI } from '../api';
import { switchPage } from '../router';

let socket: Socket;
let currentRoomId = '';
let ytPlayer: any = null;
let isYtApiReady = false;
let currentPlayingSong: any = null;
let isLooping = false;
let isPlayingLocally = false;
let currentVolume = 100;
let isMuted = false;
let showToastFn: (msg: string, type: 'info' | 'error' | 'success') => void = () => {};

function extractYouTubeId(urlOrId: string): string | null {
  const input = urlOrId.trim();
  if (!input) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = input.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  if (input.length === 11 && !input.includes(' ') && !input.includes('/') && !input.includes(':')) {
    return input;
  }
  return null;
}

async function fetchYouTubeVideoDetails(videoId: string): Promise<{ title: string; channelTitle: string; thumbnail: string }> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || `YouTube Video (${videoId})`,
        channelTitle: data.author_name || 'YouTube',
        thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      };
    }
  } catch (err) {
    console.warn('Failed to fetch oEmbed details for video:', videoId, err);
  }

  return {
    title: `YouTube Video (${videoId})`,
    channelTitle: 'YouTube',
    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  };
}

function formatVnTimeString(dateVal: any): string {
  if (!dateVal) return new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
  
  let d: Date;
  if (typeof dateVal === 'string' && !dateVal.endsWith('Z') && !dateVal.includes('+')) {
    d = new Date(dateVal.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(dateVal);
  }

  if (isNaN(d.getTime())) d = new Date();

  return d.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function initRoomView(showToast: (msg: string, type: 'info' | 'error' | 'success') => void) {
  showToastFn = showToast;
  const leaveRoomBtn = document.getElementById('leave-room-btn');
  const copyRoomLinkBtn = document.getElementById('copy-room-link-btn');

  initYouTubeIframeApi();

  // Initialize Socket.IO Client
  socket = io({
    autoConnect: false,
    auth: {
      token: localStorage.getItem('token')
    }
  });

  leaveRoomBtn?.addEventListener('click', () => {
    socket.disconnect();
    currentRoomId = '';
    switchPage('profile');
  });

  const roomCodeDisplay = document.getElementById('room-code-display');

  const handleCopyRoomId = () => {
    if (!currentRoomId) return;
    navigator.clipboard.writeText(currentRoomId).then(() => {
      showToastFn(`Copied Room ID: ${currentRoomId}`, 'success');
      if (copyRoomLinkBtn) {
        const originalContent = copyRoomLinkBtn.innerHTML;
        copyRoomLinkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          copyRoomLinkBtn.innerHTML = originalContent;
        }, 1500);
      }
    }).catch(() => {});
  };

  copyRoomLinkBtn?.addEventListener('click', handleCopyRoomId);
  roomCodeDisplay?.addEventListener('click', handleCopyRoomId);

  // Load Saved Playlists in Room UI
  loadRoomUserPlaylists();
  document.getElementById('refresh-room-playlists-btn')?.addEventListener('click', loadRoomUserPlaylists);

  // Socket event listeners
  socket.on('connect', () => {
    const statusDot = document.querySelector('#connection-status .status-dot');
    const statusText = document.querySelector('#connection-status .status-text');
    const statusBadge = document.getElementById('connection-status');
    if (statusDot) statusDot.className = 'status-dot online';
    if (statusText) statusText.textContent = 'Connected';
    if (statusBadge) statusBadge.className = 'status-badge connected';
  });

  socket.on('disconnect', () => {
    const statusDot = document.querySelector('#connection-status .status-dot');
    const statusText = document.querySelector('#connection-status .status-text');
    const statusBadge = document.getElementById('connection-status');
    if (statusDot) statusDot.className = 'status-dot offline';
    if (statusText) statusText.textContent = 'Disconnected';
    if (statusBadge) statusBadge.className = 'status-badge disconnected';
  });

  socket.on('connect_error', async (err) => {
    console.warn('Socket connect_error:', err.message);
    const newToken = await refreshAccessToken();
    if (newToken && currentRoomId) {
      socket.auth = { token: newToken, roomId: currentRoomId };
      socket.connect();
    }
  });

  socket.on('auth-error', async (data: { error: string }) => {
    const errText = (data.error || '').toLowerCase();
    if (errText.includes('read only') || errText.includes('permission') || errText.includes('only the room host') || errText.includes('denied') || errText.includes('log in')) {
      showToastFn(data.error, 'error');
    } else {
      const newToken = await refreshAccessToken();
      if (newToken && currentRoomId) {
        socket.auth = { token: newToken, roomId: currentRoomId };
        socket.disconnect().connect();
      }
    }
  });

  // Active Members roster update event
  socket.on('room-members-updated', (data: { members: any[]; count: number }) => {
    const listenersList = document.getElementById('listeners-list');
    const usersCountEl = document.getElementById('room-users-count');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    const totalCount = data.count || (Array.isArray(data.members) ? data.members.length : 0);
    if (usersCountEl) {
      usersCountEl.textContent = totalCount.toString();
    }

    const currentDisplayName = currentUser ? (currentUser.display_name || currentUser.username) : '';
    const currentUsername = currentUser ? currentUser.username : '';

    const currentMemberObj = Array.isArray(data.members) 
      ? data.members.find((m: any) => typeof m === 'object' && (
          (m.username && m.username.toLowerCase() === currentUsername.toLowerCase()) ||
          (m.displayName && m.displayName.toLowerCase() === currentDisplayName.toLowerCase()) ||
          (m.username && m.username.toLowerCase() === currentDisplayName.toLowerCase())
        )) 
      : null;

    const isCurrentHost = currentMemberObj ? currentMemberObj.isHost : false;

    if (clearChatBtn) {
      if (isCurrentHost) clearChatBtn.classList.remove('hidden');
      else clearChatBtn.classList.add('hidden');
    }

    if (listenersList && Array.isArray(data.members)) {
      listenersList.innerHTML = '';
      data.members.forEach((member: any) => {
        const item = document.createElement('div');
        item.className = 'listener-item';
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.04);';
        
        const rawUsername = typeof member === 'string' ? member : (member.username || 'Guest');
        const name = typeof member === 'string' 
          ? member 
          : (member.displayName || member.display_name || member.username || 'Guest');
        const memberIsHost = typeof member === 'object' && member.isHost;
        const memberCanWrite = typeof member === 'object' ? member.canWrite : true;

        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden; flex: 1;">
            <span class="status-dot online"></span>
            <span class="listener-name" style="font-size: 0.85rem; color: #fff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${name}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
            ${memberIsHost ? `
              <span class="badge" style="font-size: 0.68rem; padding: 0.15rem 0.45rem; background: rgba(99, 102, 241, 0.25); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); font-weight: 600;">HOST</span>
            ` : (isCurrentHost ? `
              <button class="btn-toggle-perm" data-username="${rawUsername}" style="font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.55rem; border-radius: 6px; border: 1px solid ${memberCanWrite ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}; background: ${memberCanWrite ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${memberCanWrite ? '#4ade80' : '#f87171'}; cursor: pointer; transition: all 0.2s ease;" title="Click to toggle permission">
                ${memberCanWrite ? 'Can Edit' : 'Read Only'}
              </button>
            ` : `
              <span class="badge" style="font-size: 0.68rem; padding: 0.15rem 0.45rem; border-radius: 6px; border: 1px solid ${memberCanWrite ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}; background: ${memberCanWrite ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${memberCanWrite ? '#4ade80' : '#f87171'};">
                ${memberCanWrite ? 'Can Edit' : 'Read Only'}
              </span>
            `)}
          </div>
        `;

        if (isCurrentHost && !memberIsHost) {
          item.querySelector('.btn-toggle-perm')?.addEventListener('click', () => {
            socket.emit('toggle-permission', {
              targetUsername: rawUsername,
              canWrite: !memberCanWrite
            });
          });
        }

        listenersList.appendChild(item);
      });
    }
  });

  // Room state sync & playback events
  socket.on('sync-state', (data: any) => {
    if (data.playlist) {
      renderPlaylistQueue(data.playlist);
    }
    if (data.chatHistory && Array.isArray(data.chatHistory)) {
      renderChatHistory(data.chatHistory);
    }
    if (data.currentSong) {
      loadVideoInPlayer(data.currentSong, data.playback?.progress || 0, data.playback?.isPlaying ?? true);
    } else {
      loadVideoInPlayer(null, 0, false);
    }
  });

  socket.on('playlist-updated', (queue: any[]) => {
    renderPlaylistQueue(queue);
  });

  socket.on('play', (data: any) => {
    if (data.currentSong) {
      loadVideoInPlayer(data.currentSong, data.playback?.progress || 0, data.playback?.isPlaying ?? true);
    } else {
      loadVideoInPlayer(null, 0, false);
    }
  });

  socket.on('playback-updated', (data: { isPlaying: boolean; progress: number }) => {
    const DRIFT_THRESHOLD = 3; // seconds — skip seek if drift is small (routine sync)

    // Get local current time for drift check
    let localTime = 0;
    const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
    if (currentPlayingSong?.type === 'custom') {
      if (html5Video) localTime = html5Video.currentTime || 0;
    } else if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      localTime = ytPlayer.getCurrentTime() || 0;
    }

    const drift = Math.abs(localTime - data.progress);
    const playStateChanged = data.isPlaying !== isPlayingLocally;

    isPlayingLocally = data.isPlaying;

    if (data.isPlaying) {
      // Only seek if drift is significant (manual seek / join) OR play state just changed
      if (drift > DRIFT_THRESHOLD || playStateChanged) {
        seekVideoInPlayer(data.progress);
      }
      // Only call playVideo if not already playing (avoid re-triggering)
      if (!isPlayingLocally || playStateChanged) {
        playVideoInPlayer();
      }
    } else {
      // Always pause with position when explicitly paused
      pauseVideoInPlayer(data.progress);
    }
  });

  // Player controls setup
  setupPlayerControls();

  // Discussion Form setup
  const discussionForm = document.getElementById('discussion-form') as HTMLFormElement;
  const discussionInput = document.getElementById('discussion-input') as HTMLInputElement;
  const clearChatBtn = document.getElementById('clear-chat-btn');

  clearChatBtn?.addEventListener('click', () => {
    if (!currentRoomId || !confirm('Are you sure you want to clear the discussion history for everyone in this room?')) return;
    socket.emit('clear-discussion');
  });

  socket.on('discussion-cleared', () => {
    const list = document.getElementById('discussion-messages-list');
    if (list) {
      list.innerHTML = '<div class="discussion-placeholder">Discussion history was cleared by host.</div>';
    }
  });

  discussionForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = discussionInput.value.trim();
    if (!message || !currentRoomId) return;

    let currentProgress: number | null = null;
    const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
    if (currentPlayingSong?.type === 'custom') {
      if (html5Video && !isNaN(html5Video.currentTime) && html5Video.currentTime > 0) {
        currentProgress = Math.floor(html5Video.currentTime);
      }
    } else if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      const cur = ytPlayer.getCurrentTime();
      if (cur && cur > 0) currentProgress = Math.floor(cur);
    }

    socket.emit('send-discussion-message', {
      roomId: currentRoomId,
      message,
      videoTimestamp: currentProgress
    });

    discussionInput.value = '';
  });

  socket.on('new-discussion-message', (data: any) => {
    const list = document.getElementById('discussion-messages-list');
    if (!list) return;

    const placeholder = list.querySelector('.discussion-placeholder');
    if (placeholder) placeholder.remove();

    const msgEl = createDiscussionMessageElement(data);
    list.appendChild(msgEl);
    list.scrollTop = list.scrollHeight;
  });

  // Custom Video File Upload Setup
  const selectVideoBtn = document.getElementById('select-video-file-btn') as HTMLButtonElement;
  const videoFileInput = document.getElementById('video-file-input') as HTMLInputElement;
  const selectedFileName = document.getElementById('selected-file-name');
  let isUploadingFile = false;

  selectVideoBtn?.addEventListener('click', () => {
    if (isUploadingFile) return;
    videoFileInput?.click();
  });

  videoFileInput?.addEventListener('change', async () => {
    if (!videoFileInput.files || videoFileInput.files.length === 0 || isUploadingFile) return;
    const file = videoFileInput.files[0];
    isUploadingFile = true;

    if (selectVideoBtn) {
      selectVideoBtn.disabled = true;
      selectVideoBtn.textContent = 'Uploading Video...';
    }

    if (selectedFileName) {
      selectedFileName.textContent = `Uploading: ${file.name}...`;
      selectedFileName.classList.remove('hidden');
    }

    const formData = new FormData();
    formData.append('video', file);

    try {
      const res = await fetchWithAuth('/api/videos/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok && data.videoUrl) {
        if (selectedFileName) selectedFileName.classList.add('hidden');

        if (currentRoomId) {
          socket.emit('add-song', {
            id: `song-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            videoId: '',
            videoUrl: data.videoUrl,
            title: data.title || file.name,
            thumbnail: '',
            channelTitle: 'Local File',
            duration: '0:00',
            type: 'custom'
          });
        }
      } else {
        showToastFn(data.error || 'Failed to upload video file', 'error');
      }
    } catch (err: any) {
      showToastFn(err.message || 'Error uploading video file', 'error');
    } finally {
      isUploadingFile = false;
      videoFileInput.value = '';
      if (selectVideoBtn) {
        selectVideoBtn.disabled = false;
        selectVideoBtn.textContent = 'Choose Video File';
      }
    }
  });

  // YouTube Direct Video ID & Search Handlers
  const directVideoInput = document.getElementById('direct-video-input') as HTMLInputElement;
  const addDirectVideoBtn = document.getElementById('add-direct-video-btn') as HTMLButtonElement;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchBtn = document.getElementById('search-btn');
  const searchResultsList = document.getElementById('search-results-list');
  let isAddingDirectVideo = false;

  const addDirectVideo = async () => {
    if (isAddingDirectVideo) return;
    const rawVal = directVideoInput?.value || searchInput?.value || '';
    const videoId = extractYouTubeId(rawVal);
    if (!videoId) {
      showToastFn('Invalid YouTube Video ID or URL.', 'error');
      return;
    }

    if (!currentRoomId) {
      showToastFn('Please enter a room first.', 'error');
      return;
    }

    isAddingDirectVideo = true;
    if (addDirectVideoBtn) {
      addDirectVideoBtn.disabled = true;
      addDirectVideoBtn.textContent = 'Adding...';
    }

    try {
      const details = await fetchYouTubeVideoDetails(videoId);
      socket.emit('add-song', {
        id: `song-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        videoId: videoId,
        title: details.title,
        thumbnail: details.thumbnail,
        channelTitle: details.channelTitle,
        duration: '3:00',
        type: 'youtube'
      });

      if (directVideoInput) directVideoInput.value = '';
      if (searchInput) searchInput.value = '';
    } finally {
      setTimeout(() => {
        isAddingDirectVideo = false;
        if (addDirectVideoBtn) {
          addDirectVideoBtn.disabled = false;
          addDirectVideoBtn.textContent = '+ Add Video';
        }
      }, 1000);
    }
  };

  addDirectVideoBtn?.addEventListener('click', addDirectVideo);

  directVideoInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDirectVideo();
    }
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value.trim();
      const directId = extractYouTubeId(query);
      if (directId) {
        addDirectVideo();
      } else {
        performYouTubeSearch(query);
      }
    }
  });

  searchBtn?.addEventListener('click', () => {
    const query = searchInput?.value.trim() || '';
    if (!query) return;
    const directId = extractYouTubeId(query);
    if (directId) {
      addDirectVideo();
    } else {
      performYouTubeSearch(query);
    }
  });

  // Select Playlist Modal Setup
  const selectPlaylistModal = document.getElementById('select-playlist-modal');
  const closeSelectPlaylistModalBtn = document.getElementById('close-select-playlist-modal-btn');
  const selectPlaylistSongTitle = document.getElementById('select-playlist-song-title');
  const selectPlaylistList = document.getElementById('select-playlist-list');

  const hideSelectPlaylistModal = () => {
    if (selectPlaylistModal) {
      selectPlaylistModal.classList.add('hidden');
      selectPlaylistModal.setAttribute('style', 'display: none !important;');
    }
  };

  closeSelectPlaylistModalBtn?.addEventListener('click', hideSelectPlaylistModal);
  selectPlaylistModal?.addEventListener('click', (e) => {
    if (e.target === selectPlaylistModal) hideSelectPlaylistModal();
  });

  async function openSelectPlaylistModal(video: { id: string; title: string; thumbnail?: string; channelTitle?: string; duration?: number }) {
    if (!currentUser) {
      showToastFn('Please log in to save videos to playlists', 'error');
      return;
    }

    if (selectPlaylistSongTitle) {
      selectPlaylistSongTitle.textContent = video.title;
    }

    if (selectPlaylistList) {
      selectPlaylistList.innerHTML = '<div class="search-placeholder">Loading your playlists...</div>';
    }

    if (selectPlaylistModal) {
      selectPlaylistModal.classList.remove('hidden');
      selectPlaylistModal.setAttribute('style', 'display: flex !important;');
    }

    const playlists = await getUserPlaylists();

    if (!selectPlaylistList) return;

    if (!playlists || playlists.length === 0) {
      selectPlaylistList.innerHTML = `
        <div class="search-placeholder" style="text-align: center;">
          <p style="margin-bottom: 0.75rem;">No saved playlists found.</p>
          <button id="modal-create-playlist-trigger" class="btn btn-primary btn-sm" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">+ Create Playlist</button>
        </div>
      `;
      document.getElementById('modal-create-playlist-trigger')?.addEventListener('click', () => {
        hideSelectPlaylistModal();
        const createPlaylistBtn = document.getElementById('create-playlist-btn');
        createPlaylistBtn?.click();
      });
      return;
    }

    selectPlaylistList.innerHTML = '';
    playlists.forEach(pl => {
      const plItem = document.createElement('div');
      plItem.className = 'user-playlist-item';
      plItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; cursor: pointer;';
      plItem.innerHTML = `
        <div class="playlist-info-meta">
          <div class="playlist-item-title" style="font-weight: 600; color: #fff; font-size: 0.9rem;">${pl.title}</div>
          <div class="playlist-item-count" style="font-size: 0.75rem; color: var(--color-text-muted);">${pl.song_count || 0} Songs</div>
        </div>
        <button class="btn btn-primary btn-sm btn-add-to-this-pl" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; white-space: nowrap;">+ Add Here</button>
      `;

      plItem.querySelector('.btn-add-to-this-pl')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = plItem.querySelector('.btn-add-to-this-pl') as HTMLButtonElement;
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Adding...';
        }

        const res = await addSongToPlaylistAPI(pl.id, {
          id: video.id,
          title: video.title,
          thumbnail: video.thumbnail,
          channelTitle: video.channelTitle,
          duration: video.duration
        });

        if (res.success) {
          showToastFn(`Added to playlist "${pl.title}"!`, 'success');
          hideSelectPlaylistModal();
        } else {
          showToastFn(res.error || 'Failed to add song to playlist', 'error');
          if (btn) {
            btn.disabled = false;
            btn.textContent = '+ Add Here';
          }
        }
      });

      selectPlaylistList.appendChild(plItem);
    });
  }

  async function performYouTubeSearch(query: string) {
    if (searchResultsList) {
      searchResultsList.innerHTML = '<div class="search-placeholder">Searching YouTube...</div>';
    }

    try {
      const res = await fetchWithAuth(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (res.ok && Array.isArray(data) && data.length > 0) {
        searchResultsList!.innerHTML = '';
        data.forEach((video: any) => {
          const item = document.createElement('div');
          item.className = 'search-result-item';
          item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 0.5rem;';
          item.innerHTML = `
            <div style="display: flex; gap: 0.5rem; align-items: center; overflow: hidden; flex: 1;">
              <img src="${video.thumbnail}" style="width: 44px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />
              <div style="overflow: hidden;">
                <h4 style="font-size: 0.8rem; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${video.title}</h4>
                <span style="font-size: 0.7rem; color: var(--color-text-muted);">${video.channelTitle || 'YouTube'}</span>
              </div>
            </div>
            <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
              <button class="btn btn-primary btn-sm btn-add-queue" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" title="Add to Room Queue">+ Queue</button>
              <button class="btn btn-secondary-outline btn-sm btn-add-playlist" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" title="Add to Personal Playlist">+ Playlist</button>
            </div>
          `;

          item.querySelector('.btn-add-queue')?.addEventListener('click', () => {
            if (!currentRoomId) return;
            socket.emit('add-song', {
              id: `song-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              videoId: video.id,
              title: video.title,
              thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
              channelTitle: video.channelTitle || 'YouTube',
              duration: video.duration || '3:00',
              type: 'youtube'
            });
            showToastFn(`Added "${video.title}" to room queue`, 'success');
          });

          item.querySelector('.btn-add-playlist')?.addEventListener('click', () => {
            openSelectPlaylistModal({
              id: video.id,
              title: video.title,
              thumbnail: video.thumbnail || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
              channelTitle: video.channelTitle || 'YouTube',
              duration: 180
            });
          });

          searchResultsList!.appendChild(item);
        });
      } else {
        searchResultsList!.innerHTML = '<div class="search-placeholder">No results found or YouTube API quota reached. Paste direct Video ID above!</div>';
      }
    } catch (err) {
      searchResultsList!.innerHTML = '<div class="search-placeholder">Search failed. Paste direct Video ID above!</div>';
    }
  }
}

// -------------------------------------------------------------
// Load User Saved Playlists in Room UI
// -------------------------------------------------------------
async function loadRoomUserPlaylists() {
  const container = document.getElementById('room-user-playlists-list');
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `
      <div class="search-placeholder" style="text-align: center; font-size: 0.8rem;">
        Log in to access & import your saved playlists into the room queue.
      </div>
    `;
    return;
  }

  container.innerHTML = '<div class="search-placeholder">Loading your playlists...</div>';

  try {
    const playlists = await getUserPlaylists();
    if (!playlists || playlists.length === 0) {
      container.innerHTML = `
        <div class="search-placeholder" style="text-align: center; font-size: 0.8rem;">
          No saved playlists yet. Go to your Profile to create one!
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    playlists.forEach(pl => {
      const plCard = document.createElement('div');
      plCard.className = 'user-room-playlist-card';
      plCard.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 0.65rem 0.8rem; display: flex; flex-direction: column; gap: 0.4rem;';

      plCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
          <div style="overflow: hidden; flex: 1;">
            <div style="font-weight: 600; color: #fff; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pl.title}</div>
            <div style="font-size: 0.72rem; color: var(--color-text-muted);">${pl.song_count || 0} Videos</div>
          </div>
          <button class="btn btn-primary btn-sm btn-import-all-queue" style="font-size: 0.75rem; padding: 0.25rem 0.6rem; white-space: nowrap; flex-shrink: 0;" title="Add all videos in this playlist into room queue">
            Add All to Queue
          </button>
        </div>
      `;

      const importBtn = plCard.querySelector('.btn-import-all-queue') as HTMLButtonElement;
      importBtn?.addEventListener('click', async () => {
        if (!currentRoomId) {
          showToastFn('Please enter a room first.', 'error');
          return;
        }

        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';

        try {
          const res = await getPlaylistDetailsAPI(pl.id);
          if (res.success && res.items && res.items.length > 0) {
            const songs = res.items.map((item: any) => ({
              id: `song-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
              videoId: item.songId,
              title: item.title,
              thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.songId}/mqdefault.jpg`,
              channelTitle: item.channelTitle || 'YouTube',
              duration: item.duration || '3:00',
              type: 'youtube'
            }));

            socket.emit('add-songs', songs);
            showToastFn(`Added ${songs.length} videos from "${pl.title}" to room queue!`, 'success');
          } else {
            showToastFn(res.error || 'Playlist is empty. Add videos to playlist first!', 'error');
          }
        } catch (err: any) {
          showToastFn('Failed to import playlist items', 'error');
        } finally {
          importBtn.disabled = false;
          importBtn.textContent = '➕ Add All to Queue';
        }
      });

      container.appendChild(plCard);
    });
  } catch (err) {
    container.innerHTML = '<div class="search-placeholder">Failed to load saved playlists.</div>';
  }
}

// -------------------------------------------------------------
// YouTube & HTML5 Player Helper Functions
// -------------------------------------------------------------
function initYouTubeIframeApi() {
  if ((window as any).YT && (window as any).YT.Player) {
    createYtPlayer();
    return;
  }
  if (!document.getElementById('yt-iframe-script')) {
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
  }
  (window as any).onYouTubeIframeAPIReady = () => {
    createYtPlayer();
  };
}

function createYtPlayer() {
  if (ytPlayer) return;
  const container = document.getElementById('youtube-player');
  if (!container) return;

  try {
    ytPlayer = new (window as any).YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1
      },
      events: {
        onReady: () => {
          isYtApiReady = true;
          applyVolumeState();
          if (currentPlayingSong && currentPlayingSong.type !== 'custom') {
            loadVideoInPlayer(currentPlayingSong, 0, true);
          }
        },
        onStateChange: (event: any) => {
          if (event.data === (window as any).YT.PlayerState.ENDED) {
            if (isLooping) {
              if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                ytPlayer.seekTo(0, true);
                ytPlayer.playVideo();
              }
            } else {
              pauseVideoInPlayer(0);
              if (socket && currentRoomId) {
                socket.emit('next-song');
              }
            }
          }
        }
      }
    });
  } catch (e) {
    console.error('Failed to instantiate YT.Player:', e);
  }
}

function loadVideoInPlayer(song: any, progress = 0, isPlaying = true) {
  currentPlayingSong = song;

  const titleEl = document.getElementById('player-song-title');
  const channelEl = document.getElementById('player-song-channel');
  const youtubeContainer = document.getElementById('youtube-player');
  const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;

  if (!song) {
    if (titleEl) titleEl.textContent = 'No video playing currently';
    if (channelEl) channelEl.textContent = '';
    enablePlayerControls(false);
    return;
  }

  if (titleEl) titleEl.textContent = song.title || 'Playing Video';
  if (channelEl) channelEl.textContent = song.channelTitle || (song.type === 'custom' ? 'Local Custom File' : 'YouTube');

  if (song.type === 'custom' || (song.videoUrl && !song.videoId)) {
    // Stop & pause YouTube Video Player when switching to local video
    if (ytPlayer) {
      try {
        if (typeof ytPlayer.stopVideo === 'function') {
          ytPlayer.stopVideo();
        } else if (typeof ytPlayer.pauseVideo === 'function') {
          ytPlayer.pauseVideo();
        }
      } catch (e) {}
    }
    if (youtubeContainer) {
      const iframe = youtubeContainer.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        } catch (e) {}
      }
      youtubeContainer.classList.add('hidden');
    }

    // HTML5 Video Player Setup
    if (html5Video) {
      html5Video.classList.remove('hidden');
      if (html5Video.src !== song.videoUrl) {
        html5Video.src = song.videoUrl;
      }
      html5Video.currentTime = progress;
      html5Video.muted = isMuted;
      html5Video.volume = isMuted ? 0 : currentVolume / 100;
      html5Video.onended = () => {
        if (isLooping) {
          html5Video.currentTime = 0;
          html5Video.play().catch(() => {});
        } else {
          pauseVideoInPlayer(0);
          if (socket && currentRoomId) {
            socket.emit('next-song');
          }
        }
      };
      if (isPlaying) {
        html5Video.play().catch(() => {
          html5Video.muted = true;
          html5Video.play().catch(() => {});
          showToastFn('Click video or Play button to enable audio', 'info');
        });
      } else {
        html5Video.pause();
      }
    }
  } else {
    // Stop & clear HTML5 Video Player when switching to YouTube video
    if (html5Video) {
      html5Video.pause();
      html5Video.currentTime = 0;
      html5Video.src = '';
      html5Video.load();
      html5Video.classList.add('hidden');
    }
    if (youtubeContainer) youtubeContainer.classList.remove('hidden');

    const videoId = song.videoId || song.id;
    if (videoId) {
      if (ytPlayer && isYtApiReady && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: progress
        });
        applyVolumeState();
        if (!isPlaying) {
          ytPlayer.pauseVideo();
        }
      } else {
        // Fallback IFrame if YT API is loading
        const startSec = Math.floor(progress || 0);
        const iframeHtml = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=${isPlaying ? 1 : 0}&start=${startSec}&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&enablejsapi=1&showinfo=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;"></iframe>`;
        if (youtubeContainer) youtubeContainer.innerHTML = iframeHtml;
      }
    }
  }

  enablePlayerControls(true);
  isPlayingLocally = isPlaying;
  updatePlayPauseButtons(isPlaying);
  startPlayerProgressLoop();
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

let playerProgressInterval: any = null;
let isScrubbingProgressBar = false;
let lastPlaybackSyncTime = 0;

function startPlayerProgressLoop() {
  if (playerProgressInterval) clearInterval(playerProgressInterval);

  playerProgressInterval = setInterval(() => {
    let currentTime = 0;
    let duration = 0;

    const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;

    if (currentPlayingSong?.type === 'custom') {
      if (html5Video && !isNaN(html5Video.duration)) {
        currentTime = html5Video.currentTime || 0;
        duration = html5Video.duration || 0;
      }
    } else if (ytPlayer) {
      if (typeof ytPlayer.getCurrentTime === 'function') {
        currentTime = ytPlayer.getCurrentTime() || 0;
      }
      if (typeof ytPlayer.getDuration === 'function') {
        duration = ytPlayer.getDuration() || 0;
      }
    }

    // Periodically sync playback progress with Redis every 10 seconds ONLY if currently playing and within valid duration
    const now = Date.now();
    const isNearEnd = duration > 0 && currentTime >= (duration - 1);
    if (isPlayingLocally && !isNearEnd && now - lastPlaybackSyncTime > 10000 && currentTime > 0 && socket && currentRoomId && !isScrubbingProgressBar) {
      lastPlaybackSyncTime = now;
      socket.emit('set-playback', {
        isPlaying: true,
        progress: Math.floor(currentTime)
      });
    }

    // Update Main Player Time & Progress Bar
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const progressBar = document.getElementById('progress-bar') as HTMLInputElement;

    if (currentTimeEl) currentTimeEl.textContent = formatDuration(currentTime);
    if (totalTimeEl) totalTimeEl.textContent = formatDuration(duration);

    if (progressBar && duration > 0 && !isScrubbingProgressBar) {
      progressBar.max = Math.floor(duration).toString();
      progressBar.value = Math.floor(currentTime).toString();
    }

    // Update Fullscreen HUD Controls
    const hudCurrentTimeEl = document.getElementById('hud-current-time');
    const hudTotalTimeEl = document.getElementById('hud-total-time');
    const hudProgressBar = document.getElementById('hud-progress-bar');

    if (hudCurrentTimeEl) hudCurrentTimeEl.textContent = formatDuration(currentTime);
    if (hudTotalTimeEl) hudTotalTimeEl.textContent = formatDuration(duration);

    if (hudProgressBar && duration > 0) {
      const percentage = Math.min(100, Math.max(0, (currentTime / duration) * 100));
      hudProgressBar.style.width = `${percentage}%`;
    }
  }, 250);
}

function applyVolumeState() {
  const volumeIcon = document.getElementById('volume-icon');
  const muteIcon = document.getElementById('mute-icon');
  const volumeBar = document.getElementById('volume-bar') as HTMLInputElement;

  if (isMuted || currentVolume === 0) {
    volumeIcon?.classList.add('hidden');
    muteIcon?.classList.remove('hidden');
    if (volumeBar) volumeBar.value = '0';
  } else {
    volumeIcon?.classList.remove('hidden');
    muteIcon?.classList.add('hidden');
    if (volumeBar) volumeBar.value = currentVolume.toString();
  }

  // HTML5 Video Player
  const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
  if (html5Video) {
    html5Video.muted = isMuted;
    html5Video.volume = isMuted ? 0 : currentVolume / 100;
  }

  // YouTube Player
  if (ytPlayer && isYtApiReady) {
    try {
      if (typeof ytPlayer.unMute === 'function' && typeof ytPlayer.setVolume === 'function') {
        if (isMuted || currentVolume === 0) {
          ytPlayer.mute();
        } else {
          ytPlayer.unMute();
          ytPlayer.setVolume(currentVolume);
        }
      }
    } catch (e) {}
  }
}

function playVideoInPlayer() {
  applyVolumeState();
  const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
  if (currentPlayingSong?.type === 'custom') {
    // Ensure YouTube player is completely paused/stopped
    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
      try { ytPlayer.stopVideo(); } catch (e) {}
    } else if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    if (html5Video) {
      html5Video.play().catch(() => {
        html5Video.muted = true;
        html5Video.play().catch(() => {});
        showToastFn('Click video or Play button to enable audio', 'info');
      });
    }
  } else {
    // Ensure HTML5 video player is paused
    if (html5Video) {
      html5Video.pause();
    }
    if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
      try {
        if (!isMuted) {
          ytPlayer.unMute();
          ytPlayer.setVolume(currentVolume);
        }
      } catch (e) {}
      ytPlayer.playVideo();
    } else {
      const container = document.getElementById('youtube-player');
      const iframe = container?.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
        iframe.contentWindow.postMessage(`{"event":"command","func":"setVolume","args":[${currentVolume}]}`, '*');
        iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      }
    }
  }
  isPlayingLocally = true;
  updatePlayPauseButtons(true);
}

function pauseVideoInPlayer(progress?: number) {
  const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
  if (currentPlayingSong?.type === 'custom') {
    if (html5Video) {
      if (progress !== undefined) html5Video.currentTime = progress;
      html5Video.pause();
    }
  } else {
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      if (progress !== undefined && typeof ytPlayer.seekTo === 'function') {
        ytPlayer.seekTo(progress, true);
      }
      ytPlayer.pauseVideo();
    } else {
      const container = document.getElementById('youtube-player');
      const iframe = container?.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        if (progress !== undefined) {
          iframe.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${progress}, true]}`, '*');
        }
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      }
    }
  }
  isPlayingLocally = false;
  updatePlayPauseButtons(false);
}

function seekVideoInPlayer(progress = 0) {
  const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
  if (currentPlayingSong?.type === 'custom') {
    if (html5Video) html5Video.currentTime = progress;
  } else {
    if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
      ytPlayer.seekTo(progress, true);
    } else {
      const container = document.getElementById('youtube-player');
      const iframe = container?.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${progress}, true]}`, '*');
      }
    }
  }
}

function enablePlayerControls(enabled: boolean) {
  const btns = ['play-pause-btn', 'next-btn', 'seek-back-btn', 'seek-forward-btn', 'loop-btn', 'fullscreen-btn', 'volume-mute-btn', 'volume-bar'];
  btns.forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLButtonElement;
    if (el) el.disabled = !enabled;
  });
}

function updatePlayPauseButtons(isPlaying: boolean) {
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  if (isPlaying) {
    playIcon?.classList.add('hidden');
    pauseIcon?.classList.remove('hidden');
  } else {
    playIcon?.classList.remove('hidden');
    pauseIcon?.classList.add('hidden');
  }

  const hudPlayBtn = document.getElementById('hud-play-btn');
  if (hudPlayBtn) {
    if (isPlaying) {
      hudPlayBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
      hudPlayBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
  }
}

function setupPlayerControls() {
  const playPauseBtn = document.getElementById('play-pause-btn');
  const hudPlayBtn = document.getElementById('hud-play-btn');
  const nextBtn = document.getElementById('next-btn');
  const hudNextBtn = document.getElementById('hud-next-btn');
  const seekBackBtn = document.getElementById('seek-back-btn');
  const hudSeekBackBtn = document.getElementById('hud-seek-back-btn');
  const seekForwardBtn = document.getElementById('seek-forward-btn');
  const hudSeekForwardBtn = document.getElementById('hud-seek-forward-btn');
  const loopBtn = document.getElementById('loop-btn');
  const hudLoopBtn = document.getElementById('hud-loop-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const volumeMuteBtn = document.getElementById('volume-mute-btn');
  const volumeBar = document.getElementById('volume-bar') as HTMLInputElement;
  const playerContainer = document.getElementById('player-container');

  volumeMuteBtn?.addEventListener('click', () => {
    isMuted = !isMuted;
    applyVolumeState();
  });

  volumeBar?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    currentVolume = isNaN(val) ? 100 : val;
    isMuted = currentVolume === 0;
    applyVolumeState();
  });

  let lastPlayPauseClickTime = 0;
  let lastNextClickTime = 0;
  let lastSeekClickTime = 0;

  const handlePlayPauseToggle = () => {
    if (!currentRoomId) return;

    const now = Date.now();
    if (now - lastPlayPauseClickTime < 350) return; // 350ms throttle
    lastPlayPauseClickTime = now;

    let currentProgress = 0;
    if (currentPlayingSong?.type === 'custom') {
      const vid = document.getElementById('html5-video-player') as HTMLVideoElement;
      if (vid) currentProgress = vid.currentTime;
    } else if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      currentProgress = ytPlayer.getCurrentTime();
    }

    const newIsPlaying = !isPlayingLocally;

    // Apply locally immediately (sender does NOT receive playback-updated back from server)
    if (newIsPlaying) {
      playVideoInPlayer();
    } else {
      pauseVideoInPlayer();
    }

    socket.emit('set-playback', {
      isPlaying: newIsPlaying,
      progress: Math.floor(currentProgress)
    });
  };

  playPauseBtn?.addEventListener('click', handlePlayPauseToggle);
  hudPlayBtn?.addEventListener('click', handlePlayPauseToggle);

  // Click on video screen container toggles Play/Pause
  playerContainer?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.hud-bottom-bar, .hud-top-bar, .hud-control-btn, button, input')) return;
    handlePlayPauseToggle();
  });

  const handleNextSong = () => {
    if (!currentRoomId) return;
    const now = Date.now();
    if (now - lastNextClickTime < 1500) return; // 1.5s Cooldown on next song
    lastNextClickTime = now;
    socket.emit('next-song');
  };

  nextBtn?.addEventListener('click', handleNextSong);
  hudNextBtn?.addEventListener('click', handleNextSong);

  const handleSeekBack = () => {
    if (!currentRoomId) return;
    const now = Date.now();
    if (now - lastSeekClickTime < 300) return; // 300ms throttle
    lastSeekClickTime = now;

    let current = 0;
    if (currentPlayingSong?.type === 'custom') {
      const vid = document.getElementById('html5-video-player') as HTMLVideoElement;
      if (vid) current = vid.currentTime;
    } else if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      current = ytPlayer.getCurrentTime();
    }
    const target = Math.max(0, current - 5);
    seekVideoInPlayer(target);
    socket.emit('set-playback', { isPlaying: true, progress: Math.floor(target) });
  };

  seekBackBtn?.addEventListener('click', handleSeekBack);
  hudSeekBackBtn?.addEventListener('click', handleSeekBack);

  const handleSeekForward = () => {
    if (!currentRoomId) return;
    const now = Date.now();
    if (now - lastSeekClickTime < 300) return; // 300ms throttle
    lastSeekClickTime = now;

    let current = 0;
    if (currentPlayingSong?.type === 'custom') {
      const vid = document.getElementById('html5-video-player') as HTMLVideoElement;
      if (vid) current = vid.currentTime;
    } else if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      current = ytPlayer.getCurrentTime();
    }
    const target = current + 5;
    seekVideoInPlayer(target);
    socket.emit('set-playback', { isPlaying: true, progress: Math.floor(target) });
  };

  seekForwardBtn?.addEventListener('click', handleSeekForward);
  hudSeekForwardBtn?.addEventListener('click', handleSeekForward);

  const handleToggleLoop = () => {
    isLooping = !isLooping;
    if (isLooping) {
      loopBtn?.classList.add('active');
      hudLoopBtn?.classList.add('active');
      if (loopBtn) loopBtn.style.color = '#818cf8';
      if (hudLoopBtn) hudLoopBtn.style.color = '#818cf8';
    } else {
      loopBtn?.classList.remove('active');
      hudLoopBtn?.classList.remove('active');
      if (loopBtn) loopBtn.style.color = '';
      if (hudLoopBtn) hudLoopBtn.style.color = '';
    }
  };

  loopBtn?.addEventListener('click', handleToggleLoop);
  hudLoopBtn?.addEventListener('click', handleToggleLoop);

  fullscreenBtn?.addEventListener('click', () => {
    if (!playerContainer) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      playerContainer.requestFullscreen().catch(() => {});
    }
  });

  // Progress Bar Range Input & Scrubbing
  const progressBar = document.getElementById('progress-bar') as HTMLInputElement;
  progressBar?.addEventListener('input', () => {
    isScrubbingProgressBar = true;
    const seekTime = parseFloat(progressBar.value);
    const currentTimeEl = document.getElementById('current-time');
    if (currentTimeEl) currentTimeEl.textContent = formatDuration(seekTime);
  });

  progressBar?.addEventListener('change', () => {
    isScrubbingProgressBar = false;
    const seekTime = parseFloat(progressBar.value);
    if (!currentRoomId) return;
    seekVideoInPlayer(seekTime);
    socket.emit('set-playback', { isPlaying: true, progress: Math.floor(seekTime) });
  });

  // Fullscreen HUD Progress Click Seek
  const hudProgressWrapper = document.getElementById('hud-progress-wrapper');
  hudProgressWrapper?.addEventListener('click', (e) => {
    const rect = hudProgressWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));

    let duration = 0;
    const html5Video = document.getElementById('html5-video-player') as HTMLVideoElement;
    if (currentPlayingSong?.type === 'custom') {
      if (html5Video) duration = html5Video.duration || 0;
    } else if (ytPlayer && typeof ytPlayer.getDuration === 'function') {
      duration = ytPlayer.getDuration() || 0;
    }

    if (duration > 0 && currentRoomId) {
      const seekTime = Math.floor(fraction * duration);
      seekVideoInPlayer(seekTime);
      socket.emit('set-playback', { isPlaying: true, progress: seekTime });
    }
  });
}

function renderPlaylistQueue(queue: any[]) {
  const container = document.getElementById('playlist-queue-list');
  if (!container) return;

  if (!queue || queue.length === 0) {
    container.innerHTML = '<div class="playlist-placeholder">Queue is empty. Search YouTube or upload a video file to get started!</div>';
    return;
  }

  container.innerHTML = '';
  queue.forEach((item: any, idx: number) => {
    const el = document.createElement('div');
    el.className = 'playlist-item';
    el.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 0.5rem;';
    
    const thumbUrl = item.thumbnail || (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg` : '');

    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden; flex: 1;">
        <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); width: 18px; flex-shrink: 0;">#${idx + 1}</span>
        ${thumbUrl ? `<img src="${thumbUrl}" style="width: 48px; height: 32px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />` : ''}
        <div style="overflow: hidden; flex: 1;">
          <h4 style="font-size: 0.85rem; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title || item.videoId || 'Video'}</h4>
          <span style="font-size: 0.7rem; color: var(--color-text-muted);">${item.duration || '0:00'} ${item.addedBy ? `• ${item.addedBy}` : ''}</span>
        </div>
      </div>
      <button class="btn-remove-song" data-id="${item.id}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 1rem; padding: 0.2rem 0.4rem; flex-shrink: 0;" title="Remove video">✕</button>
    `;

    el.querySelector('.btn-remove-song')?.addEventListener('click', () => {
      if (socket && currentRoomId) {
        socket.emit('remove-song', item.id);
      }
    });

    container.appendChild(el);
  });
}

function createDiscussionMessageElement(data: any): HTMLElement {
  const msgEl = document.createElement('div');
  msgEl.className = 'discussion-msg-item';
  
  const rawTs = data.videoTimestamp !== undefined && data.videoTimestamp !== null ? data.videoTimestamp : data.video_timestamp;
  const ts = typeof rawTs === 'number' ? rawTs : (typeof rawTs === 'string' ? parseInt(rawTs, 10) : null);
  const hasTs = typeof ts === 'number' && !isNaN(ts) && ts >= 0;
  const formattedTs = hasTs ? formatDuration(ts!) : '';

  msgEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
      <div style="display: flex; align-items: center; gap: 0.35rem;">
        <strong style="color: #fff; font-size: 0.85rem;">${data.displayName || data.display_name || data.username}</strong>
        ${hasTs ? `<button class="btn-seek-timestamp" data-ts="${ts}" style="font-size: 0.65rem; background: rgba(99,102,241,0.25); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.4); border-radius: 4px; padding: 0.05rem 0.35rem; cursor: pointer;" title="Jump to ${formattedTs}">⏱️ ${formattedTs}</button>` : ''}
      </div>
      <span style="font-size: 0.7rem; color: var(--color-text-muted);">${formatVnTimeString(data.createdAt || data.created_at)}</span>
    </div>
    <p style="font-size: 0.85rem; margin: 0; color: var(--color-text-main); word-break: break-word;">${data.message}</p>
  `;

  if (hasTs) {
    msgEl.querySelector('.btn-seek-timestamp')?.addEventListener('click', () => {
      seekVideoInPlayer(ts!);
      if (socket && currentRoomId) {
        socket.emit('set-playback', { isPlaying: true, progress: ts! });
      }
    });
  }

  return msgEl;
}

function renderChatHistory(messages: any[]) {
  const list = document.getElementById('discussion-messages-list');
  if (!list) return;

  list.innerHTML = '';
  if (messages.length === 0) {
    list.innerHTML = '<div class="discussion-placeholder">No discussion messages yet. Send the first message!</div>';
    return;
  }

  messages.forEach((data: any) => {
    const msgEl = createDiscussionMessageElement(data);
    list.appendChild(msgEl);
  });
  list.scrollTop = list.scrollHeight;
}

export function connectToRoom(roomId: string) {
  currentRoomId = roomId;
  const codeDisplay = document.getElementById('room-code-display');
  if (codeDisplay) codeDisplay.textContent = roomId.toUpperCase();
  
  socket.auth = {
    token: localStorage.getItem('token'),
    roomId: roomId
  };
  
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

export function disconnectRoomSocket() {
  if (socket) {
    socket.disconnect();
  }
  currentRoomId = '';
}
