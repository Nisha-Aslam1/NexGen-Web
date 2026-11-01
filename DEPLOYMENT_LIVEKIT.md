# NexGen Council — Self-Hosted LiveKit Video Meeting Integration Guide

This guide provides full instructions for deploying, configuring, and operating the self-hosted LiveKit Video Meeting System on your Oracle Cloud Ubuntu 24.04.5 ARM64 server.

---

## 1. System Architecture Overview

```
[ Client Browsers ]
       │
       ├──► https://meet.nexgencouncil.bond (Web UI & Express API on Port 3000)
       └──► wss://livekit.nexgencouncil.bond (LiveKit Signaling on Port 7880)
                │
                └──► UDP Media Streams (Ports 50000-60000)
```

---

## 2. Environment Setup on Oracle Cloud Server

1. SSH into your Oracle Cloud Ubuntu ARM64 server:
   ```bash
   ssh ubuntu@nexgencouncil.bond
   cd ~/NexGen-Web
   ```

2. Verify Docker and Docker Compose support ARM64:
   ```bash
   docker version
   docker compose version
   ```

3. Ensure `.env` contains LiveKit configuration:
   ```env
   LIVEKIT_URL=http://127.0.0.1:7880
   LIVEKIT_API_KEY=devkey
   LIVEKIT_API_SECRET=secret_key_nexgen_livekit_2026
   LIVEKIT_PUBLIC_URL=wss://livekit.nexgencouncil.bond
   ```

---

## 3. Firewall & Oracle Cloud Security Rules

Allow the following ports in Oracle Cloud Security List & Ubuntu `iptables` / `ufw`:

| Port | Protocol | Purpose |
| ---- | -------- | ------- |
| 80 | TCP | HTTP (Nginx) |
| 443 | TCP | HTTPS (Nginx SSL) |
| 7880 | TCP | LiveKit HTTP/WebSocket Signaling |
| 7881 | TCP | LiveKit WebRTC TCP Fallback |
| 50000–60000 | UDP | LiveKit WebRTC Audio/Video Media Streams |

Command for Ubuntu UFW:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7880/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:60000/udp
sudo ufw reload
```

---

## 4. Nginx Reverse Proxy Setup

1. Copy `nginx-meet.conf` to Nginx sites-available:
   ```bash
   sudo cp nginx-meet.conf /etc/nginx/sites-available/nexgen-meet
   sudo ln -s /etc/nginx/sites-available/nexgen-meet /etc/nginx/sites-enabled/
   ```

2. Obtain SSL Certificates via Certbot:
   ```bash
   sudo certbot --nginx -d meet.nexgencouncil.bond -d livekit.nexgencouncil.bond
   ```

3. Test and reload Nginx:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 5. Launch Services via Docker Compose

1. Build and start containers in background:
   ```bash
   docker compose -f docker-compose.livekit.yml up -d --build
   ```

2. Verify running containers:
   ```bash
   docker compose -f docker-compose.livekit.yml ps
   ```

3. Check LiveKit server logs:
   ```bash
   docker logs nexgen-livekit -f
   ```

---

## 6. Testing & Validation Checklist

- [x] **Admin Meeting Management**: Navigate to `https://nexgencouncil.bond/#admin` -> **Video Meetings** tab. Create scheduled meetings or instant meetings.
- [x] **Invitation Link**: Copy link `https://meet.nexgencouncil.bond/room/MEETING_CODE`.
- [x] **Pre-Join Screen**: Verify camera and microphone preview and device selection.
- [x] **Waiting Room**: When enabled, non-host participants are placed in waiting room until host approves in the Participants drawer.
- [x] **Real-Time Video/Audio**: Test camera toggles, microphone mute, and active speaker highlighting.
- [x] **Screen Share**: Test screen sharing.
- [x] **Persistent Chat**: Send messages in meeting; verify persistence in MongoDB.
- [x] **Host Control**: Test Locking/Unlocking meeting and "End Meeting for Everyone".

---

## 7. Troubleshooting Commands

- Restart LiveKit container:
  ```bash
  docker restart nexgen-livekit
  ```
- Check MongoDB connection status:
  ```bash
  curl http://127.0.0.1:3000/api/health
  ```
- Inspect LiveKit room health:
  ```bash
  curl http://127.0.0.1:7880/
  ```
