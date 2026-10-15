# Деплой kazna_watcher на VPS с нуля

Схема: Ubuntu 24.04, Node.js 24 из NodeSource. Код лежит в `/opt/kazna-watcher` и принадлежит админ-пользователю `deploy`. Сервис работает под системным пользователем `kazna` через systemd, база — в `/var/lib/kazna-watcher`. Входящие порты приложению не нужны, открыт только SSH.

## 0. Выбор VPS и почты

- **Сервер:** 1 vCPU, 512 МБ–1 ГБ RAM, 10 ГБ диска, Ubuntu 24.04 LTS.
- **Российский IP.** Сайты госорганов часто не открываются из-за рубежа. Доступность проверяется на шаге 2, до установки всего остального.
- **Ящик-отправитель:**
  - **Яндекс:** `smtp.yandex.ru`, порт 465, SSL.
    1. Почта → Все настройки → «Почтовые программы»: включить доступ, способ авторизации — «Пароли приложений и OAuth-токены».
    2. Яндекс ID → Безопасность → «Пароли приложений»: создать пароль типа «Почта».
  - **Gmail:** `smtp.gmail.com`, порт 465. Пароль приложения доступен только при включённой двухэтапной аутентификации.

## 1. Базовая настройка (один раз)

Работайте под root или через `sudo -i`, если хостер выдал пользователя `ubuntu`.

```sh
apt update && apt full-upgrade -y
[ -f /var/run/reboot-required ] && reboot    # обновилось ядро — перезагрузиться и переподключиться
apt install -y git curl ca-certificates ufw unattended-upgrades
timedatectl set-ntp true

adduser deploy
usermod -aG sudo,adm deploy    # adm — читать журнал (journalctl) без sudo
```

SSH-ключ для `deploy`. Если ключа нет, создайте его на своём компьютере: `ssh-keygen -t ed25519`.

- **Вход по паролю работает:** `ssh-copy-id deploy@<IP>`.
- **Хостер пускает только по ключу или у вас Windows:** на сервере выполните

  ```sh
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  echo 'ssh-ed25519 AAAA… you@pc' > /home/deploy/.ssh/authorized_keys   # строка из ~/.ssh/id_ed25519.pub вашего компьютера
  chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
  ```

**В отдельном окне** проверьте, что `ssh deploy@<IP>` пускает и `sudo -v` работает. Только после этого закрывайте вход root и по паролю:

```sh
cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t && systemctl reload ssh
sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication) '   # все три — no

ufw allow OpenSSH
ufw enable
cat /etc/apt/apt.conf.d/20auto-upgrades   # оба значения "1": обновления безопасности ставятся сами
```

Дальше всё делается под `deploy` (заново войдите по SSH, чтобы применилась группа `adm`).

## 2. Проверить сеть до установки

```sh
# Сайт казначейства: 200 или 30x — доступен, 000 — нет (геоблок/фаервол).
# -k только для проверки связи: системный curl не знает сертификатов Минцифры.
curl -sk -o /dev/null -w '%{http_code}\n' https://roskazna.gov.ru/

# Исходящий SMTP (подставьте свой сервер и порт):
nc -vz -w 5 smtp.yandex.ru 465

# npm-реестр (за Cloudflare): ожидается 200 и сотни КБ; обрыв около 16 КБ или таймаут — провайдер душит Cloudflare.
curl -sS -o /dev/null --max-time 30 -w '%{http_code} %{size_download}B\n' https://registry.npmjs.org/nodemailer
```

- **Сайт отдаёт `000`** — нужен VPS с российским IP.
- **SMTP не проходит** — попросите хостера открыть порт или используйте 587 с `SMTP_SECURE=false`.
- **npm-реестр душится** — соберите `node_modules` у себя (`npm ci --omit=dev`, нативных модулей нет) и залейте: `rsync -a node_modules/ deploy@<IP>:/opt/kazna-watcher/node_modules/`.

## 3. Node.js 24

Пакет `nodejs` из репозитория Ubuntu 24.04 слишком старый (18.x), а нужна версия не ниже 20.18.1.

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node -v   # v24.x

# Чтобы обновления безопасности Node из NodeSource тоже ставились автоматически:
echo 'Unattended-Upgrade::Origins-Pattern { "site=deb.nodesource.com"; };' | sudo tee /etc/apt/apt.conf.d/52nodesource-upgrades
```

## 4. Пользователь сервиса и код

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin kazna

sudo install -d -o deploy -g deploy /opt/kazna-watcher
git clone https://github.com/ilyakaverin/node_server.git /opt/kazna-watcher
cd /opt/kazna-watcher
npm ci --omit=dev --no-audit --no-fund
npm test          # итог: fail 0
```

Не запускайте на сервере `npm audit fix`. Он меняет `package-lock.json`, и следующий `git pull --ff-only` откажет. Зависимости обновляются в репозитории.

## 5. Настройки (`.env`)

```sh
cd /opt/kazna-watcher
sudo install -m 640 -o deploy -g kazna /dev/null .env   # файл сразу с правильными правами
nano .env
```

```ini
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<ящик>@yandex.ru
SMTP_PASS=<пароль приложения>
MAIL_FROM=<ящик>@yandex.ru
MAIL_TO=<адрес1>,<адрес2>
DB_PATH=/var/lib/kazna-watcher/database.json
```

`MAIL_FROM` должен совпадать с `SMTP_USER`, иначе Яндекс отклонит письмо.

```sh
sudo install -d -o kazna -g kazna -m 750 /var/lib/kazna-watcher
```

**Почему база вне репозитория.** В репозитории лежит `database.json` из июля 2026 года с теми же id разделов. Если сервис возьмёт его (нет `DB_PATH` или опечатка), он разошлёт письма по изменившимся разделам. Сохранить базу в `/opt` он при этом не сможет и будет повторять ту же рассылку каждые 5 минут. Поэтому путь закреплён ещё и в unit-файле (шаг 7).

С новой пустой базой первый запуск только запоминает текущие файлы, без писем.

**Переезд со старого сервера.**

1. Сначала остановите бота там (`systemctl stop` / `pm2 stop` / завершите процесс). Два работающих бота — это каждое письмо дважды.
2. До шага 7 заберите базу:

   ```sh
   scp старый-сервер:/путь/к/database.json /tmp/database.json
   sudo install -o kazna -g kazna -m 640 /tmp/database.json /var/lib/kazna-watcher/database.json
   rm /tmp/database.json
   ```

3. Старый `.env` целиком не переносите, возьмите из него только `SMTP_*` и `MAIL_*`.

## 6. Проверка вручную до запуска сервиса

```sh
cd /opt/kazna-watcher

# 1) Сервис видит настройки:
sudo -u kazna node --input-type=module -e "import './utils/load-env.js'; console.log('DB_PATH=' + process.env.DB_PATH, 'MAIL_TO=' + process.env.MAIL_TO, 'SMTP_HOST=' + process.env.SMTP_HOST)"

# 2) Парсер видит страницы и проходит проверку TLS (в базу ничего не пишет):
sudo -u kazna node --input-type=module -e "import './utils/load-env.js'; import { scrapeWebsite } from './utils/scraper.js'; import { loadScraperConfig } from './commands/run-resources.js'; for (const r of loadScraperConfig().resources) console.log(r.id, await scrapeWebsite(r.url, r.selectors));"

# 3) Тестовое письмо всем из MAIL_TO:
sudo -u kazna node --input-type=module -e "import './utils/load-env.js'; import { sendMail, getRecipients } from './utils/mailer.js'; for (const to of getRecipients()) console.log(to, await sendMail({ to, subject: 'kazna_watcher: тест', html: '<p>Тестовое письмо</p>' }));"
```

Что должно получиться:

1. **Настройки:** ваши значения, а не `undefined`. Если `undefined`, `kazna` не может прочитать `.env` (нужно `deploy:kazna 640`).
2. **Парсер:** для каждого раздела объект с `title`, `date`, `fileUrls`.
3. **Почта:** для каждого адреса `true`, и письмо пришло. Если команда ничего не вывела, `MAIL_TO` пуст.

## 7. Сервис systemd

`sudo nano /etc/systemd/system/kazna-watcher.service`:

```ini
[Unit]
Description=kazna_watcher — уведомления об обновлениях разделов roskazna.gov.ru
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kazna
Group=kazna
WorkingDirectory=/opt/kazna-watcher
ExecStart=/usr/bin/node /opt/kazna-watcher/index.js
# Перекрывает .env: база никогда не окажется в репозитории
Environment=DB_PATH=/var/lib/kazna-watcher/database.json
Restart=on-failure
RestartSec=10
# Остановка ждёт окончания текущей проверки (SMTP-таймауты до ~2 минут)
TimeoutStopSec=180
StateDirectory=kazna-watcher
StateDirectoryMode=0750
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true

[Install]
WantedBy=multi-user.target
```

Запускается именно `node index.js`, а не `npm start`: так сигналы остановки доходят до приложения.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now kazna-watcher
systemctl status kazna-watcher
journalctl -u kazna-watcher -b --no-pager | grep -E '\[(Первый запуск|Рассылка|Ошибка)\]'
```

- **Новая установка:** для каждого раздела только строки `[Первый запуск] Раздел …: запомнено файлов: N, письма не отправляются.`. Дальше раз в 5 минут — `[Пропуск] Изменений … не обнаружено`.
- **Перенос базы:** вместо этого будут `[Пропуск]` или `[Рассылка]`, если за время переезда появилось новое.
- **`[Ошибка] … EACCES` / `EROFS`:** сразу выполните `sudo systemctl stop kazna-watcher` и проверьте `DB_PATH`. Иначе одно и то же письмо будет повторяться каждые 5 минут.

Логи в реальном времени: `journalctl -u kazna-watcher -f`.

## 8. Обновление

```sh
cd /opt/kazna-watcher
git pull --ff-only
npm ci --omit=dev --no-audit --no-fund
npm test && sudo systemctl restart kazna-watcher
journalctl -u kazna-watcher -n 30 --no-pager
```

- **Разделы.** `configuration/resources.json` перечитывается на каждой проверке, поэтому разделы меняйте через репозиторий и `git pull`, перезапуск не нужен.
- **Код и сертификаты.** Изменения кода и `certs/` подхватываются только после перезапуска, его делает команда выше.
- **Раз в месяц:** `sudo apt update && sudo apt full-upgrade`, затем `sudo systemctl restart kazna-watcher` (новый Node подхватывается только после перезапуска). Если есть `/var/run/reboot-required`, выполните `sudo reboot`.

## 9. Что поглядывать

`journalctl -u kazna-watcher --since today`:

- **`Заголовок не найден` / `Файлы не найдены`.** Сайт поменял вёрстку, нужно править селекторы.
- **`сертификат сайта не прошёл проверку`.** Смотрите таблицу ниже.
- **`[Mailer Ошибка]`.** Проблемы с SMTP, тоже в таблице.
- **`[Mailer] Отсутствуют переменные окружения` при старте.** `kazna` не прочитал `.env`.
- **`[Ошибка] Сбой при обработке раздела … EACCES` / `EROFS`.** Сервис не может записать базу: остановите его и проверьте `DB_PATH`.

**Сертификаты Минцифры в `certs/`:**

| Сертификат | Действует до |
| --- | --- |
| Промежуточный 2022 г. | 06.03.2027 |
| Промежуточный 2024 г. | 19.07.2029 |
| Корневой | 27.02.2032 |

`npm test` упадёт, когда истекут все промежуточные.

**Резервная копия базы** нужна на случай переустановки или переезда. Без неё первый запуск на новой машине молча запомнит всё, что появилось на сайте за время простоя, и письма об этом не уйдут. Достаточно иногда копировать `/var/lib/kazna-watcher/database.json`, и обязательно — перед переустановкой.

## Если что-то не так

| Симптом | Что сделать |
| --- | --- |
| `сертификат сайта не прошёл проверку` | Сравните, кем выдан сертификат сайта, с тем, что лежит в `certs/` (см. ниже). |
| Парсер: `timeout of 15000ms exceeded` / `ECONNRESET` / `ENOTFOUND` / `status code 403` | Сайт недоступен с этого IP — нужен российский VPS. |
| `[Mailer Ошибка] … Connection timeout` / `Greeting never received` / `connect ECONNREFUSED` | Хостер закрыл SMTP-порт или неверны `SMTP_PORT`/`SMTP_SECURE`. |
| `[Mailer Ошибка] … 535` | Неверный логин или пароль, нужен пароль приложения. Если в тексте `does not have access rights to this service` — в Яндекс Почте не включены «Почтовые программы». |
| `[Mailer Ошибка] … 553 … not owned by auth user` | `MAIL_FROM` должен совпадать с `SMTP_USER`. |
| Сервис перезапускается по кругу | `journalctl -u kazna-watcher -n 100 --no-pager`. Ошибки `.env` и прав на базу сервис не роняют, они видны только в логе. |

**Сертификат не прошёл проверку.**

```sh
openssl s_client -connect roskazna.gov.ru:443 -servername roskazna.gov.ru </dev/null 2>/dev/null | openssl x509 -noout -issuer -enddate -ext authorityKeyIdentifier
for f in /opt/kazna-watcher/certs/*.pem; do echo "$f"; openssl x509 -in "$f" -noout -enddate -ext subjectKeyIdentifier; done
```

Если Authority Key Identifier сайта не совпадает ни с одним Subject Key Identifier из `certs/` или совпавший сертификат просрочен, нужен новый сертификат с gosuslugi.ru/crt. Сравнивать нужно ключи: CN у всех промежуточных одинаковый. Добавьте его в репозиторий (файл в `certs/` плюс отпечаток в `test/certs.test.js`, см. `certs/README.md`) и выполните шаг 8.

**Сервис перезапускается по кругу** — что искать в выводе `journalctl`:

| В журнале | Причина |
| --- | --- |
| `status=203/EXEC` | Нет `/usr/bin/node`. |
| `status=200/CHDIR` | Нет `/opt/kazna-watcher`. |
| `ERR_MODULE_NOT_FOUND` | Не выполнен `npm ci`. |
| Ошибка в `utils/paths.js` | Node старше 20.18.1. |
