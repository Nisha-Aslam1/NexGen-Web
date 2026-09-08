# 🚀 Oracle Cloud VM Single-Command Deployment Guide

Deploy **NexGen Women Empowerment & Youth Leadership Council** with **MongoDB 7.0** on an **Oracle Cloud Infrastructure (OCI) Compute Instance** with a single command.

---

## ⚡ The Single Command (1-Step Automatic Setup)

SSH into your Oracle Cloud VM (Ubuntu 22.04/24.04 or Oracle Linux 8/9), copy and run this single command:

```bash
curl -fsSL https://raw.githubusercontent.com/nexgen-council/portal/main/deploy-oracle.sh | bash
```

*Or if you have cloned this repository:*

```bash
chmod +x deploy-oracle.sh && ./deploy-oracle.sh
```

---

## 🛠️ What the Automated Script Does:

1. **System Detection**: Identifies whether the instance is Ubuntu, Debian, or Oracle Linux.
2. **Installs Docker & Docker Compose**: Configures official Docker repositories and engines with zero interaction.
3. **Opens Oracle Firewall**: Configures host firewall (`iptables`, `firewalld`, `ufw`) to permit ingress on ports `80`, `443`, and `3000`.
4. **Initializes MongoDB 7.0**: Launches a dedicated MongoDB 7 container with automated healthchecks and named Docker persistent volumes (`mongodb_data`).
5. **Generates Secure Secrets**: Auto-generates a cryptographic 48-character `SESSION_SECRET` for secure token signing.
6. **Compiles & Runs Full-Stack App**: Builds the frontend client and Node.js server via `Dockerfile`.
7. **Verifies Health**: Polls `/api/health` and verifies that MongoDB collections are indexed and synchronized.

---

## 🌐 Oracle Cloud VCN Security Rule Requirement

Remember to allow traffic through the **Oracle Cloud Console** firewall:

1. In the Oracle Cloud Console, navigate to **Networking** → **Virtual Cloud Networks (VCN)**.
2. Click your VCN → **Security Lists** → **Default Security List for your VCN**.
3. Under **Ingress Rules**, click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80, 443, 3000`
   - **Description**: `Allow web and application traffic for NexGen Council`
4. Click **Add Ingress Rules**.

---

## 🔑 Accessing Your Deployed App

- **Public Website**: `http://<YOUR_ORACLE_VM_PUBLIC_IP>:3000`
- **Admin Portal**: `http://<YOUR_ORACLE_VM_PUBLIC_IP>:3000/` (Click **Admin Login**)
- **Healthcheck**: `http://<YOUR_ORACLE_VM_PUBLIC_IP>:3000/api/health`
- **Database & System Diagnostics**: `http://<YOUR_ORACLE_VM_PUBLIC_IP>:3000/api/system/database-status`

---

## 📋 Common Management Commands

```bash
# View live logs
docker compose logs -f

# Restart services
docker compose restart

# View running containers & MongoDB status
docker compose ps

# Update to latest code and restart
git pull && docker compose up -d --build
```
