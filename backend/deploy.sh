#!/usr/bin/env bash
set -euo pipefail
umask 027
DOMAIN=pokernights.duckdns.org
SOURCE=/root/pokernights-upload
test -f "$SOURCE/backend/server.js"
test -f "$SOURCE/settlement.js"
test ! -e /etc/nginx/sites-available/$DOMAIN
test ! -e /etc/nginx/sites-enabled/$DOMAIN
test ! -e /opt/pokernights
test ! -e /etc/systemd/system/pokernights.service
if ss -lntH '( sport = :5010 )' | grep -q .; then echo 'Port 5010 is in use; stopped'; exit 1; fi
nginx -t
BACKUP=/root/pokernights-backup-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$BACKUP"
tar -czf "$BACKUP/nginx-before.tar.gz" /etc/nginx 2>/dev/null
sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/api.cricfantasypros.com /etc/nginx/sites-available/cricfantasypros.com /etc/nginx/sites-available/default > "$BACKUP/cricket-nginx.sha256"
systemctl show -p MainPID -p ActiveEnterTimestamp cricfantasy-preview cricfantasy-staging-web cricfantasy-staging pm2-root postgresql@16-main > "$BACKUP/cricket-services-before.txt"
sudo -u postgres psql -Atc 'SELECT datname, pg_get_userbyid(datdba) FROM pg_database ORDER BY datname' > "$BACKUP/databases-before.txt"
if id pokernights >/dev/null 2>&1; then echo 'Existing poker account; inspect before continuing'; exit 1; fi
if sudo -u postgres psql -Atc "SELECT 1 FROM pg_roles WHERE rolname='pokernights'" | grep -q 1; then echo 'Existing poker role; stopped'; exit 1; fi
useradd --system --home-dir /opt/pokernights --shell /usr/sbin/nologin pokernights
install -d -o root -g pokernights -m 750 /opt/pokernights /opt/pokernights/backend /etc/pokernights
cp "$SOURCE/backend/"{app.js,history.js,server.js,app.test.js,schema.sql,package.json,package-lock.json} /opt/pokernights/backend/
cp "$SOURCE/settlement.js" /opt/pokernights/settlement.js
cd /opt/pokernights/backend
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
chown -R root:pokernights /opt/pokernights
chmod -R g+rX,o-rwx /opt/pokernights
sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'CREATE ROLE pokernights LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
sudo -u postgres createdb --owner=pokernights pokernights
sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'REVOKE ALL ON DATABASE pokernights FROM PUBLIC'
sudo -u pokernights psql -v ON_ERROR_STOP=1 -d pokernights -f /opt/pokernights/backend/schema.sql
cat > /etc/pokernights/api.env <<'ENV'
NODE_ENV=production
PORT=5010
PGHOST=/var/run/postgresql
PGUSER=pokernights
PGDATABASE=pokernights
FRONTEND_ORIGIN=https://rsr0001.github.io
GOOGLE_CLIENT_ID=
ENV
chown root:pokernights /etc/pokernights/api.env
chmod 640 /etc/pokernights/api.env
cat > /etc/systemd/system/pokernights.service <<'UNIT'
[Unit]
Description=Poker Nights accounts and saved groups API
After=network.target postgresql@16-main.service
Wants=postgresql@16-main.service
[Service]
Type=simple
User=pokernights
Group=pokernights
WorkingDirectory=/opt/pokernights/backend
EnvironmentFile=/etc/pokernights/api.env
ExecStart=/usr/bin/node /opt/pokernights/backend/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
UMask=0077
MemoryMax=192M
CPUQuota=50%
[Install]
WantedBy=multi-user.target
UNIT
sudo -u pokernights env 'TEST_DATABASE_URL=postgresql://pokernights@localhost/pokernights?host=/var/run/postgresql' node --test /opt/pokernights/backend/app.test.js
install -d -m 755 /var/www/pokernights/.well-known/acme-challenge
cat > /etc/nginx/sites-available/$DOMAIN <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name pokernights.duckdns.org;
    root /var/www/pokernights;
    location /.well-known/acme-challenge/ { try_files $uri =404; }
    location / {
        proxy_pass http://127.0.0.1:5010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 20s;
        client_max_body_size 16k;
    }
}
NGINX
ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
if ! nginx -t; then rm /etc/nginx/sites-enabled/$DOMAIN; exit 1; fi
systemctl daemon-reload
systemctl enable --now pokernights.service
for attempt in $(seq 1 15); do if curl -fsS http://127.0.0.1:5010/health; then break; fi; sleep 1; done
curl -fsS http://127.0.0.1:5010/health
systemctl reload nginx
certbot certonly --webroot -w /var/www/pokernights -d "$DOMAIN" --cert-name "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
cp /etc/nginx/sites-available/$DOMAIN "$BACKUP/poker-http.conf"
cat > /etc/nginx/sites-available/$DOMAIN <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name pokernights.duckdns.org;
    root /var/www/pokernights;
    location /.well-known/acme-challenge/ { try_files $uri =404; }
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name pokernights.duckdns.org;
    ssl_certificate /etc/letsencrypt/live/pokernights.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pokernights.duckdns.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:5010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 20s;
        client_max_body_size 16k;
    }
}
NGINX
if ! nginx -t; then cp "$BACKUP/poker-http.conf" /etc/nginx/sites-available/$DOMAIN; exit 1; fi
systemctl reload nginx
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/pokernights-nginx <<'HOOK'
#!/bin/sh
case "$RENEWED_DOMAINS" in
  *pokernights.duckdns.org*) /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx ;;
esac
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/pokernights-nginx
sha256sum -c "$BACKUP/cricket-nginx.sha256"
systemctl show -p MainPID -p ActiveEnterTimestamp cricfantasy-preview cricfantasy-staging-web cricfantasy-staging pm2-root postgresql@16-main > "$BACKUP/cricket-services-after.txt"
diff -u "$BACKUP/cricket-services-before.txt" "$BACKUP/cricket-services-after.txt"
curl -fsS https://pokernights.duckdns.org/health
echo "Poker Nights API deployed; backup: $BACKUP"
