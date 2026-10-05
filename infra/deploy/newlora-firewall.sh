#!/bin/sh
# Reapply iptables-legacy allowances for Newlora bridges only.
# Docker 29 writes bridge rules to nftables. This host also has a stale
# iptables-legacy FORWARD policy of DROP that only accepts docker0.
# The script never changes the global policy and never names another project.
set -eu

action="${1:-apply}"
if ! command -v iptables-legacy >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
  echo "newlora-firewall: docker or iptables-legacy is missing" >&2
  exit 1
fi

networks() {
  docker network ls --format '{{.Name}}' | awk '/^newlora_/'
}

if [ "$action" = "apply" ]; then
  i=0
  while [ "$(networks | wc -l)" -lt 3 ] && [ "$i" -lt 30 ]; do
    i=$((i + 1))
    sleep 2
  done
fi

found=0
for name in $(networks); do
  found=1
  id=$(docker network inspect -f '{{.Id}}' "$name")
  internal=$(docker network inspect -f '{{.Internal}}' "$name")
  subnet=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' "$name")
  bridge="br-$(printf '%s' "$id" | cut -c1-12)"
  if [ "$action" = "rollback" ]; then
    iptables-legacy -D DOCKER-FORWARD -i "$bridge" -j ACCEPT 2>/dev/null || true
    iptables-legacy -D DOCKER-CT -o "$bridge" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
    if [ -n "$subnet" ]; then
      iptables-legacy -t nat -D POSTROUTING -s "$subnet" ! -o "$bridge" -j MASQUERADE 2>/dev/null || true
    fi
    continue
  fi
  iptables-legacy -C DOCKER-FORWARD -i "$bridge" -j ACCEPT 2>/dev/null \
    || iptables-legacy -I DOCKER-FORWARD -i "$bridge" -j ACCEPT
  if [ "$internal" != "true" ]; then
    iptables-legacy -C DOCKER-CT -o "$bridge" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null \
      || iptables-legacy -I DOCKER-CT -o "$bridge" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    iptables-legacy -t nat -C POSTROUTING -s "$subnet" ! -o "$bridge" -j MASQUERADE 2>/dev/null \
      || iptables-legacy -t nat -A POSTROUTING -s "$subnet" ! -o "$bridge" -j MASQUERADE
  fi
  echo "newlora-firewall $action $name $bridge internal=$internal subnet=$subnet"
done

if [ "$found" -ne 1 ]; then
  echo "newlora-firewall: no newlora_ networks found" >&2
  exit 1
fi
