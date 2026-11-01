import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export interface LiveKitTokenOptions {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  isHost?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
}

export function getLiveKitCredentials() {
  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret_key_nexgen_livekit_2026';
  const livekitUrl = process.env.LIVEKIT_URL || 'http://127.0.0.1:7880';
  const publicUrl = process.env.LIVEKIT_PUBLIC_URL || process.env.VITE_LIVEKIT_URL || 'wss://livekit.nexgencouncil.bond';

  return { apiKey, apiSecret, livekitUrl, publicUrl };
}

export async function generateLiveKitAccessToken(options: LiveKitTokenOptions): Promise<string> {
  const { apiKey, apiSecret } = getLiveKitCredentials();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: options.participantIdentity,
    name: options.participantName,
    ttl: '6h'
  });

  token.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: options.canPublish ?? true,
    canSubscribe: options.canSubscribe ?? true,
    canPublishData: options.canPublishData ?? true,
    roomAdmin: options.isHost ?? false,
    roomCreate: options.isHost ?? false
  });

  return await token.toJwt();
}

export function getRoomServiceClient(): RoomServiceClient | null {
  try {
    const { livekitUrl, apiKey, apiSecret } = getLiveKitCredentials();
    return new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  } catch (err: any) {
    console.error('[LiveKit] RoomServiceClient error:', err.message);
    return null;
  }
}
