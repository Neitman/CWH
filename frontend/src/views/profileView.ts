import { currentUser, getUserRooms, createRoomAPI, updateRoomAPI, deleteRoomAPI, joinRoomAPI, uploadAvatar, updateDisplayName, fetchUserProfile } from '../api';
import { switchPage } from '../router';
import { UserRoom } from '../types';
import { updateAuthHeaderUI } from './homeView';

let userRooms: UserRoom[] = [];
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

  renderProfileDetails();
  refreshProfileRooms();
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
