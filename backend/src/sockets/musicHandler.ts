import { Server, Socket } from 'socket.io';
import * as playlistService from '../services/playlistService';

export const registerMusicHandlers = (io: Server, socket: Socket) => {
  console.log('Client connected to music room:', socket.id);
  
  // Broadcast updated client count
  io.emit('clients-count', io.engine.clientsCount);

  // Sync state with newly connected client
  (async () => {
    try {
      const playlist = await playlistService.getPlaylistQueue();
      const { currentSong, playback } = await playlistService.getPlaybackState();
      
      socket.emit('sync-state', {
        playlist,
        currentSong,
        playback: {
          isPlaying: playback.isPlaying,
          progress: playback.progress
        }
      });
    } catch (error) {
      console.error('Error syncing connection state:', error);
    }
  })();

  // Helper to handle skip/pop to next song
  const playNextSong = async () => {
    try {
      const { currentSong, playback, queue } = await playlistService.playNextSong();
      
      io.emit('playlist-updated', queue);
      io.emit('play', {
        currentSong,
        playback: {
          isPlaying: playback.isPlaying,
          progress: playback.progress
        }
      });
      if (currentSong) {
        console.log(`Playing next song: "${currentSong.title}"`);
      } else {
        console.log('Playlist ended, no more songs to play');
      }
    } catch (error) {
      console.error('Error playing next song:', error);
    }
  };

  // Handle adding a song to playlist queue
  socket.on('add-song', async (songData: Omit<playlistService.Song, 'addedBy'>) => {
    try {
      const song: playlistService.Song = {
        ...songData,
        addedBy: socket.id
      };
      
      const playlist = await playlistService.addSongToQueue(song);
      io.emit('playlist-updated', playlist);
      console.log(`Song added to queue: "${song.title}"`);

      // Auto play if no song is currently playing
      const { currentSong } = await playlistService.getPlaybackState();
      if (!currentSong) {
        await playNextSong();
      }
    } catch (error) {
      console.error('Error adding song to playlist:', error);
    }
  });

  // Handle removing a song from queue
  socket.on('remove-song', async (songId: string) => {
    try {
      const updatedQueue = await playlistService.removeSongFromQueue(songId);
      io.emit('playlist-updated', updatedQueue);
      console.log(`Song removed from queue ID: ${songId}`);
    } catch (error) {
      console.error('Error removing song:', error);
    }
  });

  // Handle manual playback actions (play, pause, seek)
  socket.on('set-playback', async (state: { isPlaying: boolean; progress: number }) => {
    try {
      const playback = await playlistService.setPlaybackState(state.isPlaying, state.progress);
      
      // Broadcast update to all other connected clients
      socket.broadcast.emit('playback-updated', {
        isPlaying: playback.isPlaying,
        progress: playback.progress
      });
      
      console.log(`Playback state updated: isPlaying=${playback.isPlaying}, progress=${playback.progress}s`);
    } catch (error) {
      console.error('Error setting playback state:', error);
    }
  });

  // Handle skip to next song
  socket.on('next-song', async () => {
    await playNextSong();
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    io.emit('clients-count', io.engine.clientsCount);
  });
};
