import { Request, Response } from 'express';

function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 180;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export const searchYouTube = async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey && apiKey.trim() !== '') {
    try {
      console.log(`Searching YouTube API for: "${query}"`);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${apiKey}&maxResults=20`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`YouTube API returned status ${response.status}`);
      }
      
      const data = await response.json();
      const items = data.items || [];
      
      const videoIds = items.map((item: any) => item.id.videoId).filter(Boolean);
      const durationsMap: Record<string, number> = {};
      
      if (videoIds.length > 0) {
        try {
          const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
          const detailsRes = await fetch(detailsUrl);
          if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            const detailItems = detailsData.items || [];
            detailItems.forEach((detailItem: any) => {
              const durationStr = detailItem.contentDetails?.duration;
              if (durationStr) {
                durationsMap[detailItem.id] = parseISO8601Duration(durationStr);
              }
            });
          }
        } catch (err) {
          console.error('Error fetching video durations:', err);
        }
      }
      
      const results = items.map((item: any) => {
        const videoId = item.id.videoId;
        return {
          id: videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          channelTitle: item.snippet.channelTitle,
          duration: durationsMap[videoId] || 180
        };
      });
      
      return res.json(results);
    } catch (error) {
      console.error('Error querying YouTube API, falling back to mock:', error);
    }
  }

  // Fallback mock results when API key is missing or query fails
  console.log(`Returning mock search results for: "${query}"`);
  const mockVideos = [
    { id: 'jfKfPfyJRdk', title: 'Lofi Hip Hop Radio - Beats to Relax/Study to', channelTitle: 'Lofi Girl', duration: 300 },
    { id: 'tntOCGkgt98', title: 'Synthwave Radio - Retro Coding Beats', channelTitle: 'Lofi Girl Synthwave', duration: 240 },
    { id: '5qap5aO4i9A', title: 'Lofi Hip Hop Beats - Chill Study Music', channelTitle: 'Chillhop Music', duration: 180 },
    { id: 'DWcJFNfaw9c', title: 'Ghibli Music Instrumental - Cozy Piano Selection', channelTitle: 'Cozy Cafe', duration: 360 },
    { id: '2atQnvurnLU', title: 'Deep Focus Ambient Music for Programming', channelTitle: 'Ambient Worlds', duration: 420 },
    { id: 'A7g8T_R3X4M', title: 'Coffee Shop Jazz Piano - Chill Background Music', channelTitle: 'Cafe Music BGM channel', duration: 200 }
  ];

  const results = mockVideos.map(video => ({
    ...video,
    title: `${query.toUpperCase()} - ${video.title}`
  }));

  res.json(results);
};

function extractPlaylistId(input: string): string | null {
  const regExp = /[&?]list=([^#\&\?]*)/;
  const match = input.match(regExp);
  if (match && match[1]) {
    return match[1];
  }
  const trimmed = input.trim();
  if (/^(PL|UU|RD|FL)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function extractVideoId(input: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = input.match(regExp);
  if (match && match[2].length === 11) {
    return match[2];
  }
  const trimmed = input.trim();
  if (trimmed.length === 11) {
    return trimmed;
  }
  return null;
}

export const getVideoDetails = async (req: Request, res: Response) => {
  const input = req.query.id as string;
  if (!input) {
    return res.status(400).json({ error: 'Video/Playlist ID or URL is required' });
  }

  const playlistId = extractPlaylistId(input);
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (playlistId) {
    if (apiKey && apiKey.trim() !== '') {
      try {
        console.log(`Fetching YouTube playlist items for ID: "${playlistId}"`);
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`YouTube API returned status ${response.status}`);
        }
        
        const data = await response.json();
        const items = data.items || [];
        
        if (items.length === 0) {
          return res.status(404).json({ error: 'Playlist is empty or not found' });
        }
        
        const videoIds = items.map((item: any) => item.snippet?.resourceId?.videoId).filter(Boolean);
        const durationsMap: Record<string, number> = {};
        
        if (videoIds.length > 0) {
          try {
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
            const detailsRes = await fetch(detailsUrl);
            if (detailsRes.ok) {
              const detailsData = await detailsRes.json();
              const detailItems = detailsData.items || [];
              detailItems.forEach((detailItem: any) => {
                const durationStr = detailItem.contentDetails?.duration;
                if (durationStr) {
                  durationsMap[detailItem.id] = parseISO8601Duration(durationStr);
                }
              });
            }
          } catch (err) {
            console.error('Error fetching video durations for playlist:', err);
          }
        }
        
        const results = items.map((item: any) => {
          const videoId = item.snippet?.resourceId?.videoId;
          return {
            id: videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
            channelTitle: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
            duration: durationsMap[videoId] || 180
          };
        });
        
        return res.json(results);
      } catch (error) {
        console.error('Error fetching YouTube playlist', error);
      }
    }
    
    
  }

  const videoId = extractVideoId(input);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube Video/Playlist ID or URL' });
  }

  if (apiKey && apiKey.trim() !== '') {
    try {
      console.log(`Fetching YouTube video details for ID: "${videoId}"`);
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`YouTube API returned status ${response.status}`);
      }
      
      const data = await response.json();
      const items = data.items || [];
      
      if (items.length === 0) {
        return res.status(404).json({ error: 'Video not found' });
      }
      
      const item = items[0];
      const result = {
        id: videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        channelTitle: item.snippet.channelTitle,
        duration: item.contentDetails?.duration ? parseISO8601Duration(item.contentDetails.duration) : 180
      };
      
      return res.json([result]);
    } catch (error) {
      console.error('Error fetching YouTube video details, falling back to mock:', error);
    }
  }

  

 
  const result = {
    id: videoId,
    title: `Video - ${videoId}`,
    thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=120&fit=crop',
    channelTitle: 'YouTube Video',
    duration: 180
  };

  res.json([result]);
};
