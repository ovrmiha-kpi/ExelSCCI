# Деплой ExelSCCI: staging → prod

## Правило

1. **Нові зміни** завжди спочатку на **staging** (окрема папка + інший порт).
2. **Прод** (`:80`) не чіпати, поки користувач не підтвердить, що staging ок.
3. Після підтвердження — **promote** staging → prod.

| Середовище | Папка | URL | Порт |
|---|---|---|---|
| **Прод (штатний)** | `/var/www/exelscci` | http://79.76.110.80/ | **80** |
| **Staging (нова версія)** | `/var/www/exelscci-staging` | http://79.76.110.80:8080/ | **8080** |

Обидва ходять в той самий API (`:8787` → дані в `/home/opc/exelscci-data/`).

## Команди на сервері

```bash
# 1) Збірка
cd /home/opc/ExelSCCI && npm run build

# 2) Тільки staging
/home/opc/bin/exelscci-deploy-staging.sh

# 3) Після підтвердження користувача — на прод
/home/opc/bin/exelscci-promote-staging.sh
```

Бекап попереднього проду: `/var/www/exelscci-prev`.

## OCI

У Security List / firewall потрібен вхідний **TCP 8080** (локально вже відкрито).

## GitHub Pages

Pages більше не хостить застосунок — лише редірект на прод:
`pages-redirect/` → http://79.76.110.80/

Після push у `main` CI заливає редірект. Робочий вхід завжди через IP (або HTTPS-домен пізніше).
