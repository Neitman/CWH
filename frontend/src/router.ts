import { renderProfileDetails, refreshProfileRooms } from './views/profileView';
import { connectToRoom, disconnectRoomSocket } from './views/roomView';

export type ViewMode = 'main' | 'profile' | 'room';

export let currentViewMode: ViewMode = 'main';
export let currentActiveRoomId: string = '';

export function setActiveRoomId(roomId: string) {
  currentActiveRoomId = roomId;
}

export function openRoomInNewTab(roomId: string) {
  const url = new URL(window.location.origin);
  url.searchParams.set('room', roomId);
  window.open(url.toString(), '_blank');
}

export function openProfileInNewTab() {
  const url = new URL(window.location.origin);
  window.open(url.toString(), '_blank');
}


export function switchPage(target: ViewMode, roomId?: string) {
  currentViewMode = target;

  const mainPage = document.getElementById('main-page');
  const profilePage = document.getElementById('profile-page');
  const roomPage = document.getElementById('room-page');
  const connectionStatus = document.getElementById('connection-status');

  const url = new URL(window.location.href);

  if (target === 'room' && roomId) {
    currentActiveRoomId = roomId;
    url.searchParams.set('room', roomId);
    window.history.pushState({}, '', url.toString());

    if (mainPage) { mainPage.classList.add('hidden'); mainPage.setAttribute('style', 'display: none !important;'); }
    if (profilePage) { profilePage.classList.add('hidden'); profilePage.setAttribute('style', 'display: none !important;'); }
    if (roomPage) { roomPage.classList.remove('hidden'); roomPage.setAttribute('style', 'display: grid !important;'); }
    if (connectionStatus) { connectionStatus.classList.remove('hidden'); }

    connectToRoom(roomId);
  } else if (target === 'profile') {
    disconnectRoomSocket();
    currentActiveRoomId = '';
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());

    if (mainPage) { mainPage.classList.add('hidden'); mainPage.setAttribute('style', 'display: none !important;'); }
    if (roomPage) { roomPage.classList.add('hidden'); roomPage.setAttribute('style', 'display: none !important;'); }
    if (profilePage) { profilePage.classList.remove('hidden'); profilePage.setAttribute('style', 'display: block !important;'); }
    if (connectionStatus) { connectionStatus.classList.add('hidden'); }

    renderProfileDetails();
    refreshProfileRooms();
  } else {
    // 'main'
    disconnectRoomSocket();
    currentActiveRoomId = '';
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());

    if (profilePage) { profilePage.classList.add('hidden'); profilePage.setAttribute('style', 'display: none !important;'); }
    if (roomPage) { roomPage.classList.add('hidden'); roomPage.setAttribute('style', 'display: none !important;'); }
    if (mainPage) { mainPage.classList.remove('hidden'); mainPage.setAttribute('style', 'display: flex !important; justify-content: center; align-items: center; min-height: calc(100vh - 120px); padding: 1rem 0;'); }
    if (connectionStatus) { connectionStatus.classList.add('hidden'); }
  }
}
