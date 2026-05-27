# Deploying edwtd with Ansible

One command builds the worker locally and provisions it on the VPS under systemd.

## Prerequisites

- Ansible on your machine (`pipx install ansible` or your package manager).
- SSH access to the VPS as a user that can `sudo` (or root).
- Go toolchain locally (the playbook runs `make build` on the control node).

## Setup

```bash
cd service/deploy/ansible
cp inventory.example.ini inventory.ini   # set ansible_host / ansible_user
cp vars.example.yml vars.yml             # fill in DATABASE_URL + R2_* secrets
ansible-vault encrypt vars.yml           # optional but recommended
```

`inventory.ini` and `vars.yml` are gitignored.

## Run

```bash
ansible-playbook -i inventory.ini playbook.yml            # or --ask-vault-pass if encrypted
```

## What it does

1. **Build** (`localhost`): `make build` → `service/bin/edwtd`.
2. **Deploy** (`edwt` host): creates the `edwtd` system user, installs the binary to
   `/usr/local/bin/edwtd`, renders `/etc/edwtd/edwtd.env` (0640, `no_log`) from
   `vars.yml`, installs the canonical `../edwtd.service`, then `daemon-reload`,
   `enable`, and `start`.

Handlers restart `edwtd` only when the binary, env, or unit actually changed — so
re-running the playbook is the **update path** (rebuilds, ships, restarts if needed).

## Verify

```bash
ssh edwt-vps 'systemctl status edwtd --no-pager'
ssh edwt-vps 'journalctl -u edwtd -n 30 --no-pager'
ssh edwt-vps 'curl -s localhost:8080/readyz'
```
