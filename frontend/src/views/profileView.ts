import { currentUser, getUserRooms, createRoomAPI, updateRoomAPI, deleteRoomAPI, joinRoomAPI, uploadAvatar, updateDisplayName, fetchUserProfile, getUserPlaylists, createPlaylistAPI, getPlaylistDetailsAPI, deletePlaylistAPI, removeSongFromPlaylistAPI } from '../api';
import { switchPage } from '../router';
import { UserRoom, UserPlaylist } from '../types';
import { updateAuthHeaderUI } from './homeView';

let userRooms: UserRoom[] = [];
let userPlaylists: UserPlaylist[] = [];
let showToastFn: (msg: string, type: 'info' | 'error' | 'success') => void = () => {};

export function initProfileView(showToast: (msg: string, type: 'info' | 'error' | 'success') => void) {
  showToastFn = showToast;
  const profileDisplayName = document.getElementById('profile-display-name');
  
  const avatarFileInput = document.getElementById('avatar-file-input') as HTMLInputElement;
  const toggleEditNameBtn = document.getElementById('toggle-edit-name-btn');
  const editDisplayNameForm = document.getElementById('edit-display-name-form') as HTMLFormElement;
  const displayNameInput = document.getElementById('display-name-input') as HTMLInputElement;
  const cancelEditNameBtn = document.getElementById('cancel-edit-name-btn');

  const profileCreateRoomBtn = document.getElementById('profile-create-room-btn');
  const profileJoinRoomBtn = document.getElementById('profile-join-room-btn');
  const createRoomModal = document.getElementById('create-room-modal');
  const closeCreateRoomModalBtn = document.getElementById('close-create-room-modal-btn');
  const createRoomForm = document.getElementById('create-room-form') as HTMLFormElement;
  const roomNameInput = document.getElementById('room-name-input') as HTMLInputElement;
  const roomDescInput = document.getElementById('room-desc-input') as HTMLInputElement;
  const createRoomError = document.getElementById('create-room-error');

  const joinRoomModal = document.getElementById('join-room-modal');
  const closeJoinRoomModalBtn = document.getElementById('close-join-room-modal-btn');
  const joinRoomForm = document.getElementById('join-room-form') as HTMLFormElement;
  const joinRoomCodeInput = document.getElementById('join-room-code-input') as HTMLInputElement;
  const joinRoomLookupBtn = document.getElementById('join-room-lookup-btn') as HTMLButtonElement;
  const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn') as HTMLButtonElement;
  const joinRoomPreview = document.getElementById('join-room-preview');
  const joinRoomPreviewName = document.getElementById('join-room-preview-name');
  const joinRoomPreviewHost = document.getElementById('join-room-preview-host');
  const joinRoomPreviewDesc = document.getElementById('join-room-preview-desc');
  const joinRoomError = document.getElementById('join-room-error');

  const editRoomModal = document.getElementById('edit-room-modal');
  const closeEditRoomModalBtn = document.getElementById('close-edit-room-modal-btn');
  const editRoomForm = document.getElementById('edit-room-form') as HTMLFormElement;
  const editRoomIdInput = document.getElementById('edit-room-id-input') as HTMLInputElement;
  const editRoomNameInput = document.getElementById('edit-room-name-input') as HTMLInputElement;
  const editRoomDescInput = document.getElementById('edit-room-desc-input') as HTMLInputElement;
  const editRoomError = document.getElementById('edit-room-error');

  const hideModal = (modal: HTMLElement | null) => {
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('style', 'display: none !important;');
    }
  };

  const showModal = (modal: HTMLElement | null) => {
    if (modal) {
      modal.classList.remove('hidden');
      modal.setAttribute('style', 'display: flex !important;');
    }
  };

  // Avatar Upload Listener
  avatarFileInput?.addEventListener('change', async () => {
    if (!avatarFileInput.files || avatarFileInput.files.length === 0) return;
    const res = await uploadAvatar(avatarFileInput.files[0]);
    if (res.success) {
      renderProfileDetails();
      updateAuthHeaderUI();
    } else {
      showToast(res.error || 'Failed to upload avatar', 'error');
    }
  });

  // Edit Display Name Listeners
  toggleEditNameBtn?.addEventListener('click', () => {
    if (!currentUser) return;
    if (displayNameInput) displayNameInput.value = currentUser.display_name || currentUser.username;
    if (profileDisplayName) profileDisplayName.classList.add('hidden');
    if (editDisplayNameForm) editDisplayNameForm.classList.remove('hidden');
  });

  cancelEditNameBtn?.addEventListener('click', () => {
    if (editDisplayNameForm) editDisplayNameForm.classList.add('hidden');
    if (profileDisplayName) profileDisplayName.classList.remove('hidden');
  });

  editDisplayNameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = displayNameInput.value.trim();
    if (!name) return;
    const res = await updateDisplayName(name);
    if (res.success) {
      if (editDisplayNameForm) editDisplayNameForm.classList.add('hidden');
      if (profileDisplayName) profileDisplayName.classList.remove('hidden');
      renderProfileDetails();
    } else {
      showToast(res.error || 'Failed to update name', 'error');
    }
  });

  // Create Room Modal Listeners
  profileCreateRoomBtn?.addEventListener('click', () => {
    if (!currentUser) {
      showToast('Please log in to create rooms', 'error');
      return;
    }
    if (roomNameInput) roomNameInput.value = '';
    if (roomDescInput) roomDescInput.value = '';
    if (createRoomError) createRoomError.classList.add('hidden');
    showModal(createRoomModal);
  });

  closeCreateRoomModalBtn?.addEventListener('click', () => hideModal(createRoomModal));

  createRoomModal?.addEventListener('click', (e) => {
    if (e.target === createRoomModal) hideModal(createRoomModal);
  });

  createRoomForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = roomNameInput.value.trim();
    const description = roomDescInput.value.trim();
    if (!name) return;

    const res = await createRoomAPI(name, description);
    if (res.success && res.room) {
      hideModal(createRoomModal);
      await refreshProfileRooms();
      switchPage('room', res.room.room_id);
    } else {
      if (createRoomError) {
        createRoomError.textContent = res.error || 'Failed to create room.';
        createRoomError.classList.remove('hidden');
      }
    }
  });

  // Edit Room Modal Listeners
  // Join Room Modal Listeners
  let verifiedRoomCode = '';

  const resetJoinModal = () => {
    if (joinRoomCodeInput) joinRoomCodeInput.value = '';
    if (joinRoomPreview) joinRoomPreview.classList.add('hidden');
    if (joinRoomError) joinRoomError.classList.add('hidden');
    if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = true;
    verifiedRoomCode = '';
  };

  profileJoinRoomBtn?.addEventListener('click', () => {
    if (!currentUser) {
      showToast('Please log in to join rooms', 'error');
      return;
    }
    resetJoinModal();
    showModal(joinRoomModal);
    joinRoomCodeInput?.focus();
  });

  closeJoinRoomModalBtn?.addEventListener('click', () => hideModal(joinRoomModal));
  joinRoomModal?.addEventListener('click', (e) => {
    if (e.target === joinRoomModal) hideModal(joinRoomModal);
  });

  // Typing in room code resets the verified state
  joinRoomCodeInput?.addEventListener('input', () => {
    if (joinRoomPreview) joinRoomPreview.classList.add('hidden');
    if (joinRoomError) joinRoomError.classList.add('hidden');
    if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = true;
    verifiedRoomCode = '';
  });

  joinRoomLookupBtn?.addEventListener('click', async () => {
    const code = joinRoomCodeInput?.value?.trim();
    if (!code) {
      if (joinRoomError) {
        joinRoomError.textContent = 'Please enter a room code.';
        joinRoomError.classList.remove('hidden');
      }
      return;
    }

    joinRoomLookupBtn.disabled = true;
    joinRoomLookupBtn.textContent = 'Looking up...';
    if (joinRoomPreview) joinRoomPreview.classList.add('hidden');
    if (joinRoomError) joinRoomError.classList.add('hidden');
    if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = true;

    const res = await joinRoomAPI(code);

    joinRoomLookupBtn.disabled = false;
    joinRoomLookupBtn.textContent = 'Look Up Room';

    if (res.success && res.room) {
      verifiedRoomCode = res.room.room_id;
      if (joinRoomPreviewName) joinRoomPreviewName.textContent = `🟢 ${res.room.name}`;
      if (joinRoomPreviewHost) joinRoomPreviewHost.textContent = `Host: @${res.room.owner_username}`;
      if (joinRoomPreviewDesc) joinRoomPreviewDesc.textContent = res.room.description ? `${res.room.description}` : '';
      if (joinRoomPreview) joinRoomPreview.classList.remove('hidden');
      if (joinRoomSubmitBtn) joinRoomSubmitBtn.disabled = false;
    } else {
      if (joinRoomError) {
        joinRoomError.textContent = res.error || 'Room not found.';
        joinRoomError.classList.remove('hidden');
      }
    }
  });

  // Allow pressing Enter in the input to trigger lookup first, then join
  joinRoomCodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (verifiedRoomCode) {
        joinRoomForm?.requestSubmit();
      } else {
        joinRoomLookupBtn?.click();
      }
    }
  });

  joinRoomForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!verifiedRoomCode) return;
    hideModal(joinRoomModal);
    switchPage('room', verifiedRoomCode);
  });

  // Edit Room Modal Listeners
  closeEditRoomModalBtn?.addEventListener('click', () => hideModal(editRoomModal));

  editRoomModal?.addEventListener('click', (e) => {
    if (e.target === editRoomModal) hideModal(editRoomModal);
  });

  editRoomForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(editRoomIdInput.value, 10);
    const name = editRoomNameInput.value.trim();
    const description = editRoomDescInput.value.trim();
    if (!id || !name) return;

    const res = await updateRoomAPI(id, name, description);
    if (res.success) {
      hideModal(editRoomModal);
      refreshProfileRooms();
    } else {
      if (editRoomError) {
        editRoomError.textContent = res.error || 'Failed to update room.';
        editRoomError.classList.remove('hidden');
      }
    }
  });

  // Create Playlist Modal Listeners
  const createPlaylistBtn = document.getElementById('create-playlist-btn');
  const createPlaylistModal = document.getElementById('create-playlist-modal');
  const closeCreatePlaylistModalBtn = document.getElementById('close-create-playlist-modal-btn');
  const createPlaylistForm = document.getElementById('create-playlist-form') as HTMLFormElement;
  const playlistTitleInput = document.getElementById('playlist-title-input') as HTMLInputElement;
  const playlistDescInput = document.getElementById('playlist-desc-input') as HTMLInputElement;
  const createPlaylistError = document.getElementById('create-playlist-error');

  const managePlaylistModal = document.getElementById('manage-playlist-modal');
  const closeManagePlaylistModalBtn = document.getElementById('close-manage-playlist-modal-btn');

  createPlaylistBtn?.addEventListener('click', () => {
    if (!currentUser) {
      showToast('Please log in to create playlists', 'error');
      return;
    }
    if (playlistTitleInput) playlistTitleInput.value = '';
    if (playlistDescInput) playlistDescInput.value = '';
    if (createPlaylistError) createPlaylistError.classList.add('hidden');
    showModal(createPlaylistModal);
  });

  closeCreatePlaylistModalBtn?.addEventListener('click', () => hideModal(createPlaylistModal));
  createPlaylistModal?.addEventListener('click', (e) => {
    if (e.target === createPlaylistModal) hideModal(createPlaylistModal);
  });

  closeManagePlaylistModalBtn?.addEventListener('click', () => hideModal(managePlaylistModal));
  managePlaylistModal?.addEventListener('click', (e) => {
    if (e.target === managePlaylistModal) hideModal(managePlaylistModal);
  });

  createPlaylistForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = playlistTitleInput.value.trim();
    const description = playlistDescInput.value.trim();
    if (!title) return;

    const res = await createPlaylistAPI(title, description);
    if (res.success) {
      hideModal(createPlaylistModal);
      showToast('Playlist created successfully!', 'success');
      refreshProfilePlaylists();
    } else {
      if (createPlaylistError) {
        createPlaylistError.textContent = res.error || 'Failed to create playlist.';
        createPlaylistError.classList.remove('hidden');
      }
    }
  });

  renderProfileDetails();
  refreshProfileRooms();
  refreshProfilePlaylists();
}

export async function renderProfileDetails() {
  const profileAvatarImg = document.getElementById('profile-avatar-img') as HTMLImageElement;
  const profileDisplayName = document.getElementById('profile-display-name');
  const profileUsername = document.getElementById('profile-username');
  const profileEmail = document.getElementById('profile-email');

  let user = currentUser;
  if (!user) {
    user = await fetchUserProfile();
  }

  if (user) {
    const nameToShow = user.display_name || user.username;
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameToShow)}&background=6366f1&color=fff`;

    if (profileAvatarImg) profileAvatarImg.src = user.avatar_url || defaultAvatar;
    if (profileDisplayName) profileDisplayName.textContent = nameToShow;
    if (profileUsername) profileUsername.textContent = `@${user.username}`;
    if (profileEmail) profileEmail.textContent = user.email || 'N/A';
  }
}

export async function refreshProfileRooms() {
  const roomsContainer = document.getElementById('profile-rooms-grid');
  const roomsCountBadge = document.getElementById('my-rooms-count-badge');
  if (!roomsContainer) return;

  let user = currentUser;
  if (!user) {
    user = await fetchUserProfile();
  }

  if (!user) {
    roomsContainer.innerHTML = '<div class="search-placeholder">Log in to view your created rooms</div>';
    return;
  }

  roomsContainer.innerHTML = '<div class="search-placeholder">Loading your created rooms...</div>';

  userRooms = await getUserRooms();

  if (roomsCountBadge) {
    roomsCountBadge.textContent = `${userRooms.length} Room${userRooms.length === 1 ? '' : 's'}`;
  }

  if (userRooms.length === 0) {
    roomsContainer.innerHTML = '<div class="search-placeholder">No created rooms yet. Click "Create New Room" to get started!</div>';
    return;
  }

  roomsContainer.innerHTML = '';
  userRooms.forEach(room => {
    const item = document.createElement('div');
    item.className = 'room-card-item';
    item.innerHTML = `
      <div class="room-card-header">
        <h3 class="room-card-title">${room.name}</h3>
        <span class="room-card-code">${room.room_id}</span>
      </div>
      <p class="room-card-desc">${room.description || 'No description provided.'}</p>
      <div class="room-card-footer">
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-primary btn-sm btn-join-room" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
            🟢 Enter Room
          </button>
          <button class="btn btn-secondary-outline btn-sm btn-edit-room" style="font-size: 0.8rem; padding: 0.35rem 0.5rem;" title="Edit Room">
            ✏️
          </button>
        </div>
        <button class="btn btn-icon btn-icon-sm btn-delete-room" title="Delete Room" style="color: var(--color-danger);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    item.querySelector('.btn-join-room')?.addEventListener('click', () => {
      switchPage('room', room.room_id);
    });

    item.querySelector('.btn-edit-room')?.addEventListener('click', () => {
      const editRoomIdInput = document.getElementById('edit-room-id-input') as HTMLInputElement;
      const editRoomNameInput = document.getElementById('edit-room-name-input') as HTMLInputElement;
      const editRoomDescInput = document.getElementById('edit-room-desc-input') as HTMLInputElement;
      const editRoomModal = document.getElementById('edit-room-modal');
      if (editRoomIdInput) editRoomIdInput.value = room.id.toString();
      if (editRoomNameInput) editRoomNameInput.value = room.name;
      if (editRoomDescInput) editRoomDescInput.value = room.description || '';
      if (editRoomModal) {
        editRoomModal.classList.remove('hidden');
        editRoomModal.setAttribute('style', 'display: flex !important;');
      }
    });

    item.querySelector('.btn-delete-room')?.addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete room "${room.name}"?`)) return;
      const res = await deleteRoomAPI(room.id);
      if (res.success) {
        refreshProfileRooms();
      } else {
        showToastFn(res.error || 'Failed to delete room', 'error');
      }
    });

    roomsContainer.appendChild(item);
  });
}

export async function refreshProfilePlaylists() {
  const container = document.getElementById('profile-playlists-grid');
  if (!container) return;

  let user = currentUser;
  if (!user) {
    user = await fetchUserProfile();
  }

  if (!user) {
    container.innerHTML = '<div class="search-placeholder">Log in to view your playlists</div>';
    return;
  }

  container.innerHTML = '<div class="search-placeholder">Loading your playlists...</div>';
  userPlaylists = await getUserPlaylists();

  if (userPlaylists.length === 0) {
    container.innerHTML = '<div class="search-placeholder">No saved playlists yet. Click "+ Create Playlist" to start building your library!</div>';
    return;
  }

  container.innerHTML = '';
  userPlaylists.forEach(playlist => {
    const item = document.createElement('div');
    item.className = 'room-card-item';
    item.innerHTML = `
      <div class="room-card-header">
        <h3 class="room-card-title">🎵 ${playlist.title}</h3>
        <span class="badge" style="font-size: 0.75rem;">${playlist.song_count || 0} Songs</span>
      </div>
      <p class="room-card-desc">${playlist.description || 'No description provided.'}</p>
      <div class="room-card-footer">
        <button class="btn btn-primary btn-sm btn-view-playlist" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;">
          View / Edit Songs
        </button>
        <button class="btn btn-icon btn-icon-sm btn-delete-playlist" title="Delete Playlist" style="color: var(--color-danger);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    item.querySelector('.btn-view-playlist')?.addEventListener('click', async () => {
      openManagePlaylistModal(playlist);
    });

    item.querySelector('.btn-delete-playlist')?.addEventListener('click', async () => {
      if (!confirm(`Are you sure you want to delete playlist "${playlist.title}"?`)) return;
      const res = await deletePlaylistAPI(playlist.id);
      if (res.success) {
        showToastFn('Playlist deleted successfully!', 'success');
        refreshProfilePlaylists();
      } else {
        showToastFn(res.error || 'Failed to delete playlist', 'error');
      }
    });

    container.appendChild(item);
  });
}

export async function openManagePlaylistModal(playlist: UserPlaylist) {
  const modal = document.getElementById('manage-playlist-modal');
  const titleEl = document.getElementById('manage-playlist-title');
  const descEl = document.getElementById('manage-playlist-desc');
  const itemsContainer = document.getElementById('manage-playlist-items-list');

  if (titleEl) titleEl.textContent = playlist.title;
  if (descEl) descEl.textContent = playlist.description || 'No description provided.';
  if (itemsContainer) itemsContainer.innerHTML = '<div class="search-placeholder">Loading playlist songs...</div>';

  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('style', 'display: flex !important;');
  }

  const res = await getPlaylistDetailsAPI(playlist.id);
  if (!res.success || !res.items) {
    if (itemsContainer) itemsContainer.innerHTML = '<div class="search-placeholder">Failed to load playlist items.</div>';
    return;
  }

  if (res.items.length === 0) {
    if (itemsContainer) itemsContainer.innerHTML = '<div class="search-placeholder">This playlist is empty. Add songs while searching videos!</div>';
    return;
  }

  if (itemsContainer) {
    itemsContainer.innerHTML = '';
    res.items.forEach((item: any) => {
      const el = document.createElement('div');
      el.className = 'playlist-item';
      el.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 0.5rem;';
      const thumb = item.thumbnail || (item.songId ? `https://img.youtube.com/vi/${item.songId}/mqdefault.jpg` : '');

      el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden; flex: 1;">
          ${thumb ? `<img src="${thumb}" style="width: 44px; height: 30px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" />` : ''}
          <div style="overflow: hidden; flex: 1;">
            <h4 style="font-size: 0.85rem; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</h4>
            <span style="font-size: 0.7rem; color: var(--color-text-muted);">${item.channelTitle || ''}</span>
          </div>
        </div>
        <button class="btn-remove-playlist-item" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.4rem;" title="Remove song">✕</button>
      `;

      el.querySelector('.btn-remove-playlist-item')?.addEventListener('click', async () => {
        const delRes = await removeSongFromPlaylistAPI(playlist.id, item.id);
        if (delRes.success) {
          showToastFn('Song removed from playlist', 'info');
          openManagePlaylistModal(playlist);
          refreshProfilePlaylists();
        } else {
          showToastFn(delRes.error || 'Failed to remove song', 'error');
        }
      });

      itemsContainer.appendChild(el);
    });
  }
}
