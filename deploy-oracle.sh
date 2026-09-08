#!/usr/bin/env bash
# ==============================================================================
# NexGen Women Empowerment & Youth Leadership Council
# Single-Command Automated Deployment Script for Oracle Cloud Infrastructure (OCI) VM
# ==============================================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${CYAN}${BOLD}"
echo "===================================================================="
echo "    NEXGEN COUNCIL - ORACLE CLOUD VM 1-COMMAND AUTOMATED DEPLOY    "
echo "        Full-Stack App + MongoDB 7.0 + Firewall & Healthchecks     "
echo "===================================================================="
echo -e "${NC}"

# 1. Check Root or Sudo Privilege
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}[!] Warning: Not running as root. Attempting to elevate using sudo...${NC}"
  SUDO="sudo"
else
  SUDO=""
fi

# 2. Detect OS Distribution
echo -e "${CYAN}[1/6] Detecting Operating System...${NC}"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  OS=$(uname -s)
fi
echo -e "${GREEN}✓ Detected OS: ${OS} (${VERSION_ID:-standard})${NC}"

# 3. Install Docker and Docker Compose if not installed
echo -e "${CYAN}[2/6] Verifying Docker and Docker Compose Engine...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}[*] Installing Docker on ${OS}...${NC}"
  if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y ca-certificates curl gnupg lsb-release iptables-persistent ufw
    $SUDO mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$OS/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
      $(lsb_release -cs) stable" | $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
    $SUDO apt-get update -y
    $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif [[ "$OS" == "ol" || "$OS" == "rhel" || "$OS" == "centos" || "$OS" == "fedora" ]]; then
    $SUDO dnf install -y dnf-utils
    $SUDO dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    $SUDO dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    # Fallback to official convenience script
    curl -fsSL https://get.docker.com -o get-docker.sh
    $SUDO sh get-docker.sh
    rm -f get-docker.sh
  fi

  $SUDO systemctl enable docker
  $SUDO systemctl start docker
  echo -e "${GREEN}✓ Docker Engine installed and started.${NC}"
else
  echo -e "${GREEN}✓ Docker is already installed: $(docker --version)${NC}"
fi

# 4. Configure Oracle Cloud Network Firewall (Open Ports 80, 443, 3000)
echo -e "${CYAN}[3/6] Configuring Host Firewall for Oracle Cloud Virtual Machine...${NC}"
# Oracle Cloud VM instances (especially Oracle Linux) have strict default iptables rules
if command -v iptables &> /dev/null; then
  echo -e "${YELLOW}[*] Updating iptables ingress rules for ports 80, 443, 3000...${NC}"
  $SUDO iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || $SUDO iptables -A INPUT -p tcp --dport 80 -j ACCEPT
  $SUDO iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || $SUDO iptables -A INPUT -p tcp --dport 443 -j ACCEPT
  $SUDO iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT 2>/dev/null || $SUDO iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
  
  if command -v netfilter-persistent &> /dev/null; then
    $SUDO netfilter-persistent save 2>/dev/null || true
  fi
fi

if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
  echo -e "${YELLOW}[*] Updating firewalld rules for Oracle Linux...${NC}"
  $SUDO firewall-cmd --zone=public --add-port=80/tcp --permanent 2>/dev/null || true
  $SUDO firewall-cmd --zone=public --add-port=443/tcp --permanent 2>/dev/null || true
  $SUDO firewall-cmd --zone=public --add-port=3000/tcp --permanent 2>/dev/null || true
  $SUDO firewall-cmd --reload 2>/dev/null || true
fi

if command -v ufw &> /dev/null && $SUDO ufw status | grep -q "Status: active"; then
  $SUDO ufw allow 80/tcp
  $SUDO ufw allow 443/tcp
  $SUDO ufw allow 3000/tcp
fi
echo -e "${GREEN}✓ Host ports 80, 443, and 3000 configured successfully.${NC}"

# 5. Generate Environment Variables
echo -e "${CYAN}[4/6] Setting up environment configuration...${NC}"
if [ ! -f .env ]; then
  SECRET=$(openssl rand -hex 24 2>/dev/null || head /dev/urandom | tr -dc A-Za-z0-9 | head -c 48)
  cat > .env <<EOF
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://mongodb:27017/nexgen_council
MONGODB_DB_NAME=nexgen_council
SESSION_SECRET=${SECRET}
EOF
  echo -e "${GREEN}✓ Created fresh .env with secured random SESSION_SECRET.${NC}"
else
  echo -e "${GREEN}✓ Existing .env file detected and preserved.${NC}"
fi

# 6. Build and Launch Containers
echo -e "${CYAN}[5/6] Building and launching NexGen Council & MongoDB 7 with Docker Compose...${NC}"
if docker compose version &> /dev/null; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo -e "${RED}[✗] Error: Docker Compose could not be found.${NC}"
  exit 1
fi

$SUDO $DOCKER_COMPOSE_CMD up -d --build

# 7. Verification & Healthcheck Loop
echo -e "${CYAN}[6/6] Verifying deployment health status...${NC}"
HEALTHY=false
for i in {1..30}; do
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  echo -e "${YELLOW}[*] Waiting for application and MongoDB to initialize (attempt $i/30)...${NC}"
  sleep 3
done

PUBLIC_IP=$(curl -s -4 ifconfig.me 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
if [ "$HEALTHY" = true ]; then
  echo -e "${GREEN}${BOLD}====================================================================${NC}"
  echo -e "${GREEN}${BOLD}    🎉 SUCCESS! NEXGEN COUNCIL HAS BEEN DEPLOYED ON ORACLE VM!     ${NC}"
  echo -e "${GREEN}${BOLD}====================================================================${NC}"
  echo -e "${BOLD}Access URLs:${NC}"
  echo -e "  • ${CYAN}Public Website:${NC}      http://${PUBLIC_IP}:3000"
  echo -e "  • ${CYAN}Administrative Portal:${NC} http://${PUBLIC_IP}:3000/ (Click Admin Login)"
  echo -e "  • ${CYAN}Live Health Endpoint:${NC}  http://${PUBLIC_IP}:3000/api/health"
  echo -e "  • ${CYAN}MongoDB Status:${NC}        http://${PUBLIC_IP}:3000/api/system/database-status"
  echo ""
  echo -e "${BOLD}Database Details:${NC}"
  echo -e "  • Engine: MongoDB 7.0 (Container: nexgen_mongodb)"
  echo -e "  • Database Name: nexgen_council"
  echo -e "  • Persistent Volume: mongodb_data"
  echo ""
  echo -e "${BOLD}Quick Management Commands:${NC}"
  echo -e "  • View Live Logs:     ${YELLOW}$DOCKER_COMPOSE_CMD logs -f${NC}"
  echo -e "  • Restart Services:   ${YELLOW}$DOCKER_COMPOSE_CMD restart${NC}"
  echo -e "  • Stop Services:      ${YELLOW}$DOCKER_COMPOSE_CMD down${NC}"
  echo -e "  • Check Status:       ${YELLOW}$DOCKER_COMPOSE_CMD ps${NC}"
  echo ""
  echo -e "${YELLOW}Note for Oracle Cloud Ingress:${NC}"
  echo -e "Ensure your Oracle Cloud Virtual Cloud Network (VCN) Security List has an Ingress Rule:"
  echo -e "  Source: 0.0.0.0/0 | IP Protocol: TCP | Destination Port Range: 80, 443, 3000"
  echo "===================================================================="
else
  echo -e "${RED}[✗] Healthcheck timed out. Containers may still be starting.${NC}"
  echo -e "Inspect status with: ${YELLOW}$DOCKER_COMPOSE_CMD ps && $DOCKER_COMPOSE_CMD logs${NC}"
fi
