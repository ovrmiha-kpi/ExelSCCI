# ExelSCCI: GitHub Pages (фронт) + Oracle VM (API)

Продакшен-схема:

| Що | Де |
|----|-----|
| UI | GitHub Pages `https://ovrmiha-kpi.github.io/ExelSCCI/` |
| API | Oracle Always Free VM, порт **8787** (краще HTTPS через Caddy на 443) |
| Дані | на VM, напр. `/home/opc/exelscci-data/` |

Статичний python на `:80` на VM **не** є основним фронтом.

## Критично: HTTPS

Pages завжди **HTTPS**. Браузер **блокує** `fetch` на `http://IP:8787` (mixed content).
Тому `VITE_API_URL` має бути **`https://…`**, не `http://…:8787`.

Рекомендовано: Caddy на VM (80/443) → `reverse_proxy 127.0.0.1:8787`, а в GitHub Variable:

`VITE_API_URL=https://exelscci.<IP-з-дефісами>.sslip.io`

приклад IP `1.2.3.4` → `https://exelscci.1-2-3-4.sslip.io`

## 1. Oracle Console — Public IP + Ingress

Зараз без Public IP API з інтернету недоступний (`publicIp=None`).

### Public IP

1. **Compute → Instances** → ваш інстанс.
2. **Resources → Attached VNICs** → VNIC.
3. **IPv4 Addresses** → **Edit** / **Create public IPv4 address** (Ephemeral або Reserved).
4. Скопіюйте **Public IP**.

Альтернатива: **Networking → IP Management → Reserved Public IPs** → Create → Assign to private IP інстанса.

### Security List / NSG

**Networking → VCN → Security Lists** (або NSG інстанса) → Ingress:

| Source | Protocol | Port |
|--------|----------|------|
| `0.0.0.0/0` | TCP | **8787** (тимчасово / перевірка) |
| `0.0.0.0/0` | TCP | **80** |
| `0.0.0.0/0` | TCP | **443** |
| ваш IP / `0.0.0.0/0` | TCP | **22** (SSH) |

На самій VM (`firewalld`) порт 8787 уже відкритий — цього мало без Security List.

Перевірка з вашого ПК:

```bash
curl http://<PUBLIC_IP>:8787/api/health
# → {"ok":true,"service":"exelscci"}
```

## 2. HTTPS перед Pages (Caddy + sslip.io)

На VM (після SSH `opc@<PUBLIC_IP>` або `ubuntu@…`):

```bash
# Oracle Linux / opc — приклад для dnf; на Ubuntu: apt install caddy
sudo dnf install -y caddy   # або https://caddyserver.com/docs/install

IP=$(curl -4 -s ifconfig.me)
HOST="exelscci.${IP//./-}.sslip.io"
echo "API host: https://$HOST"

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$HOST {
  reverse_proxy 127.0.0.1:8787
}
EOF

sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl -sS "https://$HOST/api/health"
```

Відкрийте в OCI Ingress **80** і **443** (Let's Encrypt).

## 3. Фронт на Pages → адреса API

У репозиторії GitHub:

**Settings → Secrets and variables → Actions → Variables**

- Name: `VITE_API_URL`
- Value: `https://exelscci.<IP-з-дефісами>.sslip.io` (без `/` в кінці)

Workflow `.github/workflows/deploy.yml` підставляє це в збірку.
Після зміни Variable: **Actions → Deploy to GitHub Pages → Run workflow** (або push у `main`).

Без `VITE_API_URL` Pages шукає `/api` на `github.io` і лишається в IndexedDB.

## 4. Перевірка end-to-end

1. `curl https://<API_HOST>/api/health`
2. Відкрити https://ovrmiha-kpi.github.io/ExelSCCI/
3. Увійти `ovrmiha` / пароль адміна
4. Обрати групу → зміни мають писатись на VM (`/home/opc/exelscci-data/`)

У логіні має з’явитись мітка **«сервер»** (apiMode).

## 5. Локальна розробка

```bash
npm install --prefix server
npm run dev:api   # :8787
npm run dev       # Vite proxy /api → 8787
```

## 6. Бекапи даних на VM

```bash
tar czf exelscci-data-$(date +%F).tgz -C /home/opc/exelscci-data .
```

## Автооновлення коду з GitHub на VM

Якщо з VM немає HTTPS egress до GitHub — `git pull` ламається; API можна оновлювати окремо (scp архіву / bastion). Поки `exelscci-api.service` крутиться — для даних це ок.

## Docker (опційно, all-in-one на VM)

Якщо колись захочете роздавати і фронт з VM — див. `docker-compose.yml`. Для поточної схеми Pages + API достатньо systemd на :8787 + Caddy на :443.
