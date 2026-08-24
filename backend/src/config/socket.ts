import { config } from './env';

export const allowedOrigins = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) return callback(null, true);

  const envOrigins = config.corsOrigin
    ? (config.corsOrigin.includes(',') 
        ? config.corsOrigin.split(',') 
        : [config.corsOrigin])
    : [];

  const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allAllowed = [...envOrigins, ...defaultOrigins];

  const isAllowed = allAllowed.includes('*') || 
                    allAllowed.includes(origin) || 
                    origin.endsWith('.neitman.id.vn') ||
                    origin === 'https://neitman.id.vn';

  if (isAllowed) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};
