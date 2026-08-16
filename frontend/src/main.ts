import './style.css';
import { fetchUserProfile, currentUser } from './api';
import { switchPage } from './router';
import { initHomeView, updateAuthHeaderUI } from './views/homeView';
import { initProfileView, refreshProfileRooms, renderProfileDetails } from './views/profileView';
import { initRoomView, connectToRoom } from './views/roomView';

// Global Toast Notification System
export function showToast(message: string, type: 'info' | 'error' | 'success' = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
  };

  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type]}</div>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Global Header Navigation Listeners
const goToProfileBtn = document.getElementById('go-to-profile-btn');
const headerLogoBtn = document.getElementById('header-logo-btn');

goToProfileBtn?.addEventListener('click', () => {
  if (currentUser) {
    switchPage('profile');
    refreshProfileRooms();
  } else {
    switchPage('main');
  }
});

headerLogoBtn?.addEventListener('click', () => {
  if (currentUser) {
    switchPage('profile');
    refreshProfileRooms();
  } else {
    switchPage('main');
  }
});

// App Initialization Flow
async function initApp() {
  // Initialize views & handlers
  initHomeView(showToast);
  initProfileView(showToast);
  initRoomView(showToast);

  // Authenticate user with token
  await fetchUserProfile();
  updateAuthHeaderUI();
  renderProfileDetails();

  // Hide global preloader
  const preloader = document.getElementById('global-preloader');
  if (preloader) {
    preloader.style.opacity = '0';
    preloader.style.visibility = 'hidden';
    setTimeout(() => preloader.remove(), 400);
  }

  // Parse URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');

  if (roomParam) {
    switchPage('room', roomParam);
    connectToRoom(roomParam);
  } else if (currentUser) {
    switchPage('profile');
    refreshProfileRooms();
  } else {
    switchPage('main');
  }
}

initApp();
