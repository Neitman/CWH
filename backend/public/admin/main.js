// Admin Dashboard Client Logic

// DOM Elements
const serverPulse = document.getElementById('server-pulse');
const uptimeDisplay = document.getElementById('uptime-display');
const memoryUsage = document.getElementById('memory-usage');
const memoryBar = document.getElementById('memory-bar');
const memoryPercentage = document.getElementById('memory-percentage');
const postgresStatus = document.getElementById('postgres-status');
const postgresSubtext = document.getElementById('postgres-subtext');
const redisStatus = document.getElementById('redis-status');
const redisSubtext = document.getElementById('redis-subtext');
const totalUsers = document.getElementById('total-users');
const activeRoomsCount = document.getElementById('active-rooms-count');
const roomsList = document.getElementById('rooms-list');
const usersListTbody = document.getElementById('users-list-tbody');
const flushRedisBtn = document.getElementById('flush-redis-btn');
const systemActionStatus = document.getElementById('system-action-status');

// Format Uptime (seconds -> HH:MM:SS)
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Format Date string
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString();
}

// Convert bytes to GB
function bytesToGB(bytes) {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

// Fetch stats endpoint
async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    
    const stats = await res.json();
    
    // Server status light
    serverPulse.className = 'pulse-indicator status-online';
    
    // Uptime
    uptimeDisplay.textContent = formatUptime(stats.uptime);
    
    // Memory
    const usedGB = bytesToGB(stats.memory.system.used);
    const totalGB = bytesToGB(stats.memory.system.total);
    memoryUsage.textContent = `${usedGB} / ${totalGB} GB`;
    memoryPercentage.textContent = `${stats.memory.system.usagePercentage}% used`;
    memoryBar.style.width = `${stats.memory.system.usagePercentage}%`;
    
    // Databases
    postgresStatus.textContent = stats.databases.postgresql;
    if (stats.databases.postgresql === 'Connected') {
      postgresStatus.className = 'stat-value text-success';
      postgresSubtext.textContent = 'Operational';
      postgresSubtext.className = 'stat-subtext text-success';
    } else {
      postgresStatus.className = 'stat-value text-danger';
      postgresSubtext.textContent = 'Connection Error';
      postgresSubtext.className = 'stat-subtext text-danger';
    }

    redisStatus.textContent = stats.databases.redis;
    if (stats.databases.redis === 'Connected') {
      redisStatus.className = 'stat-value text-success';
      redisSubtext.textContent = 'Operational';
      redisSubtext.className = 'stat-subtext text-success';
    } else {
      redisStatus.className = 'stat-value text-danger';
      redisSubtext.textContent = 'Connection Error';
      redisSubtext.className = 'stat-subtext text-danger';
    }
    
    // Total Users count
    totalUsers.textContent = stats.userCount.toString();
  } catch (err) {
    console.error('Error fetching admin statistics:', err);
    serverPulse.className = 'pulse-indicator status-offline';
    postgresStatus.className = 'stat-value text-danger';
    postgresStatus.textContent = 'Offline';
    redisStatus.className = 'stat-value text-danger';
    redisStatus.textContent = 'Offline';
  }
}

// Fetch Active Rooms
async function fetchRooms() {
  try {
    const res = await fetch('/api/admin/rooms');
    if (!res.ok) throw new Error('Failed to fetch rooms');
    
    const rooms = await res.json();
    activeRoomsCount.textContent = rooms.length.toString();
    
    roomsList.innerHTML = '';
    if (rooms.length === 0) {
      roomsList.innerHTML = '<div class="placeholder-msg">No active listening rooms found.</div>';
      return;
    }

    rooms.forEach(room => {
      const roomCard = document.createElement('div');
      roomCard.className = 'room-card';
      
      const membersText = room.members.length > 0 ? room.members.join(', ') : 'None';
      
      // Current track layout
      let trackHTML = `
        <div class="room-track-info">
          <div class="room-track-details">
            <span class="room-track-title" style="color: var(--color-text-muted);">No active music playing</span>
          </div>
        </div>
      `;

      if (room.currentSong) {
        trackHTML = `
          <div class="room-track-info">
            <img src="${room.currentSong.thumbnail}" class="room-track-thumb" alt="thumb" />
            <div class="room-track-details">
              <span class="room-track-title" title="${room.currentSong.title}">${room.currentSong.title}</span>
              <span class="room-track-subtitle">${room.currentSong.channelTitle} (${Math.round(room.playback.progress)}s)</span>
            </div>
            <span class="room-badge">${room.playback.isPlaying ? 'PLAYING' : 'PAUSED'}</span>
          </div>
        `;
      }

      roomCard.innerHTML = `
        <div class="room-top">
          <span class="room-id-tag">${room.roomId.toUpperCase()}</span>
          <div class="room-badge-group">
            <span class="room-badge listeners">${room.listenersCount} listeners</span>
            <span class="room-badge">${room.queueLength} in queue</span>
          </div>
        </div>
        
        ${trackHTML}
        
        <div class="room-members-roster">
          <strong>Listeners:</strong> ${membersText}
        </div>
        
        <div class="room-actions">
          <button class="btn btn-primary skip-btn" data-room="${room.roomId}" ${!room.currentSong ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
            Skip Song
          </button>
          <button class="btn btn-danger-outline delete-room-btn" data-room="${room.roomId}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
            Close Room
          </button>
        </div>
      `;

      // Event listener: Skip Button
      roomCard.querySelector('.skip-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const rId = btn.getAttribute('data-room');
        btn.disabled = true;
        try {
          const skipRes = await fetch(`/api/admin/rooms/${rId}/next`, { method: 'POST' });
          if (skipRes.ok) {
            fetchRooms();
          }
        } catch (err) {
          console.error(`Error skipping track in room ${rId}:`, err);
        } finally {
          btn.disabled = false;
        }
      });

      // Event listener: Delete Room Button
      roomCard.querySelector('.delete-room-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const rId = btn.getAttribute('data-room');
        if (confirm(`Are you sure you want to completely delete room ${rId.toUpperCase()} and kick out all listeners?`)) {
          btn.disabled = true;
          try {
            const delRes = await fetch(`/api/admin/rooms/${rId}`, { method: 'DELETE' });
            if (delRes.ok) {
              fetchRooms();
              fetchStats();
            }
          } catch (err) {
            console.error(`Error deleting room ${rId}:`, err);
          } finally {
            btn.disabled = false;
          }
        }
      });

      roomsList.appendChild(roomCard);
    });
  } catch (err) {
    console.error('Error fetching rooms roster:', err);
    roomsList.innerHTML = '<div class="placeholder-msg text-danger">Failed to load active rooms.</div>';
  }
}

// Fetch Users List
async function fetchUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error('Failed to fetch users');
    
    const users = await res.json();
    usersListTbody.innerHTML = '';
    
    if (users.length === 0) {
      usersListTbody.innerHTML = `
        <tr>
          <td colspan="5" class="placeholder-cell">No registered user accounts found.</td>
        </tr>
      `;
      return;
    }

    users.forEach(user => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="code">${user.id}</td>
        <td><strong>${user.username}</strong></td>
        <td>${user.email || '<span style="opacity: 0.5; font-style: italic;">N/A</span>'}</td>
        <td>${formatDate(user.created_at)}</td>
        <td>
          <button class="btn btn-danger-outline btn-icon-only delete-user-btn" data-id="${user.id}" data-username="${user.username}" title="Delete User Account">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      `;

      // Event listener: Delete User account
      row.querySelector('.delete-user-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const uId = btn.getAttribute('data-id');
        const uName = btn.getAttribute('data-username');
        
        if (confirm(`WARNING: Are you sure you want to delete user account "${uName}" (ID: ${uId})? This action is irreversible.`)) {
          btn.disabled = true;
          try {
            const delRes = await fetch(`/api/admin/users/${uId}`, { method: 'DELETE' });
            if (delRes.ok) {
              fetchUsers();
              fetchStats();
            }
          } catch (err) {
            console.error(`Error deleting user ID ${uId}:`, err);
          } finally {
            btn.disabled = false;
          }
        }
      });

      usersListTbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error fetching users registry:', err);
    usersListTbody.innerHTML = `
      <tr>
        <td colspan="4" class="placeholder-cell text-danger">Failed to load users database.</td>
      </tr>
    `;
  }
}

// Flush Redis action
flushRedisBtn.addEventListener('click', async () => {
  if (confirm('CRITICAL ACTION: Are you sure you want to delete ALL playlist queues, playing songs, and playback states across ALL rooms? Sockets will be notified.')) {
    flushRedisBtn.disabled = true;
    systemActionStatus.className = 'status-msg hidden';
    
    try {
      const res = await fetch('/api/admin/redis/flush', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        systemActionStatus.textContent = data.message || 'Redis flushed successfully.';
        systemActionStatus.className = 'status-msg success';
        
        fetchRooms();
        fetchStats();
      } else {
        throw new Error(data.error || 'Flushing failed');
      }
    } catch (err) {
      console.error('Error flushing Redis:', err);
      systemActionStatus.textContent = `Error: ${err.message}`;
      systemActionStatus.className = 'status-msg error';
    } finally {
      flushRedisBtn.disabled = false;
      
      // Auto-hide status message after 4 seconds
      setTimeout(() => {
        systemActionStatus.className = 'status-msg hidden';
      }, 4000);
    }
  }
});

// Initializations
fetchStats();
fetchRooms();
fetchUsers();

// Schedules (Polling)
setInterval(fetchStats, 3000); // Poll metrics every 3s
setInterval(fetchRooms, 3000); // Poll active rooms list every 3s
setInterval(fetchUsers, 10000); // Poll users list every 10s
