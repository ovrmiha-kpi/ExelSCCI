# ExelSCCI на Oracle Cloud (Always Free VM)

Спільне збереження даних **по групі** (люди, види нарядів, журнал, налаштування, акаунти)
на одній VM. Фронт і API в одному Docker-контейнері.

## Архітектура

- **Node (Express)** — REST `/api/...`, JWT-логін, bcrypt-паролі
- **Файлове сховище** — `DATA_DIR/groups/<group>.json` + `accounts.json` (простіше за SQLite на Always Free)
- **Статика** — зібраний Vite `dist/` роздається тим самим процесом (`STATIC_DIR`)

Клієнт при доступному `/api/health` працює в **API mode**: завантаження/збереження bundle групи,
локальний IndexedDB лишається кешем.

## 1. VM на Oracle Cloud

1. Compute → Create instance (Always Free: Ampere A1 або AMD).
2. Image: **Ubuntu 22.04** (або новіша).
3. Networking: відкрити **ingress** TCP **80**, **443**, за потреби **8787** для перевірки.
4. Підключитись: `ssh ubuntu@<PUBLIC_IP>` (ключ з консолі).

## 2. Встановити Docker

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER"
# перелогінитись, щоб група docker застосувалась
```

## 3. Деплой з репозиторію

```bash
git clone <ваш-репо> exelscci
cd exelscci
cp .env.example .env   # якщо є; або експорт змінних нижче
# Обовʼязково змініть секрети:
export JWT_SECRET="$(openssl rand -hex 32)"
export ADMIN_PASSWORD="ваш-надійний-пароль"

docker compose up -d --build
```

Перевірка: `curl http://127.0.0.1:8787/api/health` → `{"ok":true,...}`

Відкрити в браузері: `http://<PUBLIC_IP>:8787/`

Логін за замовчуванням: `ADMIN_LOGIN` / `ADMIN_PASSWORD` (див. `docker-compose.yml`).

## 4. HTTPS (рекомендовано)

Варіант A — **Caddy** як reverse proxy на 80/443:

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
your.domain.com {
  reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo systemctl reload caddy
```

Після HTTPS можна закрити порт 8787 у Security List і лишити лише 80/443.

Варіант B — nginx + certbot (аналогічно: proxy_pass на `127.0.0.1:8787`).

## 5. Змінні середовища

| Змінна | Призначення |
|--------|-------------|
| `JWT_SECRET` | Підпис токенів (обовʼязково змінити) |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Перший журналіст (якщо ще немає в `accounts.json`) |
| `DATA_DIR` | Каталог даних (у Docker: `/data`, volume `exelscci-data`) |
| `STATIC_DIR` | Каталог фронту (у образі: `/app/public`) |
| `VITE_API_URL` | При збірці фронту: порожньо = same-origin `/api` |

## 6. Міграція з локального браузера

1. На старій (локальній / GitHub Pages) версії: **Налаштування → Завантажити резервну копію**.
2. На сервері: увійти → обрати **робочу групу** в канцелярії.
3. **Відновити з файлу** — люди/наряди/журнал/settings підуть у серверний bundle цієї групи.
4. З іншого браузера/ПК: логін + та сама група → ті самі дані.

## 7. Локальна розробка з API

```bash
# термінал 1
npm install --prefix server
npm run dev:api

# термінал 2
npm install
npm run dev
```

Vite проксує `/api` → `http://127.0.0.1:8787`. Фронт сам виявить API через `/api/health`.

Примусово: створити `.env.local` з `VITE_USE_API=1`.

## 8. Бекапи

Дані — volume `exelscci-data` (або файли в `/data` на хості).

```bash
docker compose exec app ls /data/groups
# або скопіювати volume:
docker run --rm -v exelscci_exelscci-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/exelscci-data.tgz -C /data .
```

## Важливо

Поки сайт лише на **GitHub Pages** без цієї VM — спільного серверного сховища немає.
Після деплою на Oracle Cloud джерело істини — API на VM, не IndexedDB браузера.
