#!/bin/bash
# Crowny Watchdog — nginx + node server 자동 복구
while true; do
    # nginx 체크
    if ! pgrep -x nginx > /dev/null; then
        echo "[$(date)] nginx down — restarting"
        nginx
    fi
    # node server 체크
    if ! pgrep -f "node server.js" > /dev/null; then
        echo "[$(date)] node server down — restarting"
        cd /Users/ef/Downloads/CrownyTVM
        nohup node server.js >> /tmp/crowny-server.log 2>&1 &
    fi
    sleep 30
done
