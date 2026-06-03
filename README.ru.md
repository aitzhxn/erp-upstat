# АРХИТЕКТУРНЫЙ РЕГЛАМЕНТ И РУКОВОДСТВО ПО СИСТЕМЕ ERP-UPSTAT

Данный документ представляет собой исчерпывающее техническое описание архитектуры, бизнес-логики, алгоритмов безопасности, структуры реляционной базы данных и механизмов разграничения доступа (RBAC) корпоративного портала администрирования. Предназначен для системных архитекторов, ведущих разработчиков, инспекторов безопасности и инженеров по развертыванию.

---

## СОДЕРЖАНИЕ
1. [Введение: Квалификационные требования к разработчику](#введение-квалификационные-требования-к-разработчику)
2. [Раздел 1: Подробное описание реляционной схемы базы данных (Спецификация SQL)](#раздел-1-подробное-описание-реляционной-схемы-базы-данных-спецификация-sql)
3. [Раздел 2: Подсистема авторизации, сессий и OTP-верификации](#раздел-2-подсистема-авторизации-сессий-и-otp-верификации)
4. [Раздел 3: Иерархическая модель доступа (RBAC) и алгоритм Allowed Subtree](#раздел-3-иерархическая-модель-доступа-rbac-и-алгоритм-allowed-subtree)
5. [Раздел 4: Модуль Инструкций и Регламентов (Жизненный цикл и ознакомление)](#раздел-4-модуль-инструкций-и-регламентов-жизненный-цикл-и-ознакомление)
6. [Раздел 5: Статистика и показатели (Математика WoW и Учет)](#раздел-5-статистика-и-показатели-математика-wow-и-учет)
7. [Раздел 6: Планы работ и Kanban (Бизнес-процесс и парсинг задач)](#раздел-6-планы-работ-и-kanban-бизнес-процесс-и-парсинг-задач)
8. [Раздел 7: Финансовое планирование и управление бюджетами](#раздел-7-финансовое-планирование-и-управление-бюджетами)
9. [Раздел 8: Внутренняя почта и безопасность загрузки вложений (Multer, Path Traversal)](#раздел-8-внутренняя-почта-и-безопасность-загрузки-вложений-multer-path-traversal)
10. [Раздел 9: Низкоуровневый аудит действий и структура JSON-логов](#раздел-9-низкоуровневый-аудит-действий-и-структура-json-логов)
11. [Раздел 10: Полная спецификация API-эндпоинтов системы](#раздел-10-полная-спецификация-api-эндпоинтов-системы)
12. [Раздел 11: Структура каталогов и компонентов (Фронтенд и Бэкенд)](#раздел-11-структура-каталогов-и-компонентов-фронтенд-и-бэкенд)
13. [Раздел 12: Инструкции по развертыванию, миграциям и администрированию](#раздел-12-инструкции-по-развертыванию-миграциям-и-администрированию)

---

## Введение: Квалификационные требования к разработчику

Для эффективного сопровождения, рефакторинга или расширения кодовой базы ERP-Upstat от специалиста требуется профессиональное владение следующими дисциплинами и паттернами разработки программного обеспечения:

### 1. Теория графов и иерархические модели данных
- **Ациклические графы:** Организационная структура компании и дерево департаментов представляют собой древовидные графы. Разработчику необходимо понимать алгоритмы поиска в ширину (`BFS`) и глубину (`DFS`), вычисление путей предков (Ancestors) и потомков (Descendants), а также алгоритмы детекции циклов для предотвращения бесконечной рекурсии при смене родительских узлов.
- **Декларативное вычисление дочернего поддерева:** Логика авторизации руководителей опирается на рекурсивный сбор подчиненных должностей.

### 2. Управление базами данных (PostgreSQL)
- **Транзакции и конкурентность (ACID):** Понимание уровней изоляции транзакций (`Read Committed`, `Repeatable Read`, `Serializable`), использование блокировок строк для исключения состояния гонки (например, при расходовании бюджетов или сохранении статистики).
- **Схема и ограничения:** Проектирование связей с использованием внешних ключей, индексов (составных и уникальных) и каскадных триггеров очистки данных (`ON DELETE CASCADE`, `ON DELETE SET NULL`).

### 3. Веб-безопасность и криптография
- **Сессии и JWT:** Криптографическая подпись токенов (HMAC-SHA256), управление временем жизни (TTL), защита полезной нагрузки и организация бесшовной ротации токенов при смене должностей.
- **Безопасность ввода/вывода:** Защита от классических векторов атак, включая `Path Traversal` (обход каталогов при скачивании вложений), `XSS` (через обязательную фильтрацию и санитарию строк) и контроль переполнения буфера при обработке Multipart-данных.

### 4. Архитектура стейта SPA (React 19)
- **Глобальный стейт:** Нормализация структур данных в Redux Toolkit, организация асинхронных Thunks для сетевых запросов.
- **Интерцепторы запросов:** Перехватчики Axios для автоматического обновления токенов авторизации и обработки системных заголовков.

---

## Раздел 1: Подробное описание реляционной схемы базы данных (Спецификация SQL)

База данных построена на СУБД PostgreSQL 16. Ниже приведена детальная спецификация всех таблиц, полей и ограничений в виде SQL DDL.

### 1. Таблица Должностей (`posts`)
Хранит структуру позиций компании, иерархическую подчиненность и роли RBAC.
```sql
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  parent_post_id TEXT REFERENCES posts(id),
  department_id  TEXT NOT NULL,
  role          TEXT NOT NULL,  -- Admin, Inspector, Department Head, Section Head, Employee
  level         INTEGER NOT NULL DEFAULT 0,
  order_index   INTEGER NOT NULL DEFAULT 0,
  card_color    TEXT,            -- optional card color key: default, blue, green, amber, violet
  card_notes    TEXT,            -- optional text shown on org chart card
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_post_id);
```

### 2. Таблица Пользователей (`users`)
Хранит учетные записи сотрудников и данные OTP-верификации.
```sql
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  avatar_url      TEXT,
  password_hash   TEXT,
  post_id         TEXT REFERENCES posts(id),  -- primary position (for role/JWT)
  is_verified     BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  verification_token_expires_at TIMESTAMP,
  verification_attempts INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_post ON users(post_id);
```

### 3. Связующая таблица должностей (`user_posts`)
Обеспечивает связь "многие-ко-многим", позволяя одному сотруднику совмещать несколько должностей.
```sql
CREATE TABLE IF NOT EXISTS user_posts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id),
  UNIQUE (post_id)
);
```

### 4. Таблица Инструкций (`instructions`)
Хранит регламенты и стандарты должностей.
```sql
CREATE TABLE IF NOT EXISTS instructions (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  post_id        TEXT NOT NULL REFERENCES posts(id),
  owner_post_id  TEXT NOT NULL REFERENCES posts(id),
  status         TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  content        TEXT,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_instructions_post ON instructions(post_id);
```

### 5. Таблица Шагов Инструкций (`instruction_steps`)
```sql
CREATE TABLE IF NOT EXISTS instruction_steps (
  id              TEXT PRIMARY KEY,
  instruction_id  TEXT NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  text            TEXT,
  link            TEXT,
  deadline        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_instruction_steps_instruction ON instruction_steps(instruction_id);
```

### 6. Таблица Ознакомлений (`instruction_acknowledgements`)
Фиксирует факт прочтения инструкций сотрудниками.
```sql
CREATE TABLE IF NOT EXISTS instruction_acknowledgements (
  id              TEXT PRIMARY KEY,
  instruction_id  TEXT NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instruction_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_acknowledgements_instruction ON instruction_acknowledgements(instruction_id);
```

### 7. Таблица Записей Статистики (`post_statistics`)
Хранит фактически достигнутые результаты деятельности по должностям.
```sql
CREATE TABLE IF NOT EXISTS post_statistics (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id),
  period      TEXT NOT NULL,
  metric_code TEXT NOT NULL,
  value       REAL NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_statistics_post ON post_statistics(post_id);
```

### 8. Таблица Описания Метрик (`metric_definitions`)
```sql
CREATE TABLE IF NOT EXISTS metric_definitions (
  id         TEXT PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9. Таблица Квот и Планов (`statistic_quotas`)
```sql
CREATE TABLE IF NOT EXISTS statistic_quotas (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  metric_code  TEXT NOT NULL,
  period       TEXT NOT NULL,
  target_value REAL NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (post_id, metric_code, period)
);
CREATE INDEX IF NOT EXISTS idx_statistic_quotas_lookup ON statistic_quotas(post_id, metric_code, period);
```

### 10. Таблица Назначений Метрик должностям (`metric_to_post`)
```sql
CREATE TABLE IF NOT EXISTS metric_to_post (
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  metric_code  TEXT NOT NULL,
  responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  daily_target REAL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, metric_code)
);
CREATE INDEX IF NOT EXISTS idx_metric_to_post_post ON metric_to_post(post_id);
CREATE INDEX IF NOT EXISTS idx_metric_to_post_metric ON metric_to_post(metric_code);
```

### 11. Таблица Финансовых Бюджетов (`budgets`)
```sql
CREATE TABLE IF NOT EXISTS budgets (
  id                 TEXT PRIMARY KEY,
  department_id      TEXT NOT NULL,
  responsible_post_id TEXT REFERENCES posts(id),
  category           TEXT NOT NULL,
  period             TEXT NOT NULL,
  planned            REAL NOT NULL,
  approved           REAL NOT NULL DEFAULT 0,
  spent              REAL NOT NULL DEFAULT 0,
  remaining          REAL NOT NULL,
  limits             REAL NOT NULL,
  approval_status    TEXT NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 12. Таблица Департаментов (`departments`)
```sql
CREATE TABLE IF NOT EXISTS departments (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  parent_id        TEXT REFERENCES departments(id),
  manager_post_id  TEXT REFERENCES posts(id),
  organization_id  TEXT NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 13. Таблица Планов Работ (`work_plans`)
```sql
CREATE TABLE IF NOT EXISTS work_plans (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  post_id     TEXT NOT NULL REFERENCES posts(id),
  department  TEXT,
  status      TEXT NOT NULL,
  due_date    TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_work_plans_post ON work_plans(post_id);
```

---

## Раздел 2: Подсистема авторизации, сессий и OTP-верификации

Процесс регистрации и авторизации спроектирован с учетом защиты от спам-регистраций и перебора паролей.

### Хеширование паролей
- Применяется библиотека `bcryptjs`. Пароль хешируется асинхронно с солью в 10 раундов. 
- Полученный хеш содержит соль и зашифрованный пароль, что исключает необходимость хранить соль в отдельном поле БД.
- Функция авторизации проверяет пароль методом `compareSync`, который работает за постоянное время для предотвращения timing-атак.

### Жизненный цикл OTP-кодов
- OTP-код представляет собой 6-значную комбинацию цифр.
- При генерации бэкенд записывает код в базу данных в поля `verification_token` и `verification_token_expires_at` (текущее время плюс 15 минут).
- Поле `verification_attempts` сбрасывается в `0`.
- При вводе неверного OTP счетчик попыток инкрементируется. При достижении 5 неудачных попыток код аннулируется для защиты от перебора (Brute-Force).

### Сессии на основе JWT
- Подпись выполняется HMAC-SHA256 с использованием секретного ключа длиной не менее 32 символов.
- В токен упаковываются: `id`, `email`, `role`, `postId`.
- Время жизни токена — 7 дней.
- Перевод пользователя на другую должность (`POST /api/org/posts/:id/assign`) вызывает возврат заголовка `X-Token-Refresh-Required: true`.
- Фронтенд-интерцептор ловит этот заголовок и запрашивает новый JWT-токен без сброса интерфейса.

---

## Раздел 3: Иерарческая модель доступа (RBAC) и алгоритм Allowed Subtree

Система авторизации ERP-Upstat жестко контролирует действия пользователей не только по типу их ролей, но и по положению в дереве оргструктуры.

### Роли и вычисление привилегий
Система поддерживает следующие роли:
1. **Admin** — полный доступ без ограничений.
2. **Inspector** — просмотр всех данных системы без возможности изменения.
3. **Department Head** — управление в рамках закрепленного отделения.
4. **Section Head** — управление в рамках своего отдела.
5. **Employee** — базовый доступ к личной статистике, почте и планам.

### Алгоритм Allowed Subtree (Разрешенная ветка оргструктуры)
Для руководителей (`Department Head` / `Section Head`) доступ к изменению данных подчиненных ограничен их локальной веткой. Это реализуется через бэкенд-функцию `getAllowListForUser(user)`:
1. Если роль пользователя `Admin` или `Inspector`, функция возвращает `null` (нет ограничений).
2. Если роль иная, бэкенд делает запрос всех должностей, занимаемых пользователем (`getPostsForUser`).
3. Для каждой должности запускается рекурсивный поиск подчиненных узлов вниз по дереву:
   ```typescript
   const collect = async (pid: string) => {
     const children = await clientAll('SELECT id FROM posts WHERE parent_post_id = ?', [pid]);
     for (const c of children) {
       allowedIds.push(c.id);
       await collect(c.id); // Рекурсивный спуск по дереву подчинения
     }
   };
   ```
4. Полученный массив `allowedIds` используется как фильтр во всех запросах изменения данных. При попытке совершить несанкционированное действие бэкенд вернет ошибку `403 Forbidden`.

---

## Раздел 4: Модуль Инструкций и Регламентов (Жизненный цикл и ознакомление)

Модуль инструкций автоматизирует процесс обучения и контроля выполнения стандартов сотрудниками.

### Архитектура регламентов
Каждая инструкция (`instructions`) привязана к определенной должности (`postId`).
- Инструкция содержит шаги (`instruction_steps`), которые сортируются по полю `order_index`.
- Жизненный цикл состоит из двух статусов: `draft` (черновик, виден только автору) и `active` (активная инструкция, видна сотрудникам и требует ознакомления).
- Редактировать инструкцию могут только суперадминистраторы или владелец инструкции (`owner_post_id`).

### Механизм ознакомления (Acknowledge)
1. Сотрудник изучает действующую инструкцию и нажимает кнопку «Ознакомлен».
2. На сервер отправляется запрос `POST /api/instructions/:id/acknowledge`.
3. Бэкенд делает запись в таблицу `instruction_acknowledgements`, фиксируя `instruction_id`, `user_id` и время `acknowledged_at`.
4. Руководитель должности видит таблицу ознакомления сотрудников со временем прочтения и общим процентом охвата регламента.
5. При изменении версии инструкции (`version`) все старые записи ознакомлений аннулируются, требуя повторного ознакомления.

---

## Раздел 5: Метрики, Статистика и WoW-Математический аппарат контроля

Модуль предназначен для оцифровки результатов работы сотрудников на основе числовых показателей.

### Расчет понедельника начала недели (Monday-Start)
Для синхронизации дат СУБД, бэкенда и фронтенда используется алгоритм нормализации даты к понедельнику текущей недели (`getDefaultWeekStart`):
1. Метод принимает строку даты `YYYY-MM-DD` или текущую дату сервера.
2. Определяется день недели: `day = d.getDay()` (где 0 — воскресенье, 1 — понедельник, 6 — суббота).
3. Вычисляется смещение относительно понедельника: `diff = day === 0 ? -6 : 1 - day`.
4. Дата смещается назад на количество дней `diff`.
5. Возвращается нормализованная строка даты понедельника в формате `YYYY-MM-DD`.

### Математическая модель расчета WoW (Week-over-Week) роста
Для анализа тренда бэкенд вычисляет темп прироста текущей недели относительно предыдущей.
1. Суммируются фактические значения метрики за текущую неделю (от `weekStart` до `weekStart + 6 дней`). Обозначим сумму как $S_{current}$.
2. Суммируются значения за предыдущую неделю (от `weekStart - 7 дней` до `weekStart - 1 день`). Обозначим сумму как $S_{previous}$.
3. Расчет процента WoW-роста выполняется по следующему алгоритму:
   - Если $S_{previous} = 0$ и $S_{current} = 0$, рост равен `0%`.
   - Если $S_{previous} = 0$, а $S_{current} > 0$, рост принимается за `100%` (появление результатов с нуля).
   - В стандартном случае расчет идет по формуле:
     $$WoW = \frac{S_{current} - S_{previous}}{S_{previous}} \times 100$$
4. Полученное значение возвращается бэкендом как округленное число с плавающей точкой и используется для подсветки трендов в интерфейсе.

---

## Раздел 6: Планы работ и Kanban (Бизнес-процесс и парсинг задач)

Модуль планов работ организует деятельность подразделений по периодам времени.

### Алгоритм регулярных выражений парсинга задач (Task Sync)
Для быстрого составления планов реализован парсер текстового блока задач `syncTasksFromMessageText` в `backend/src/routes/workPlans.ts`:
1. Пользователь пишет список задач в единое поле ввода, разделяя их переносом строки:
   ```text
   1. Провести аудит серверов
   - Настроить резервное копирование
   * Обновить SSL-сертификаты
   ```
2. Функция на бэкенде принимает этот текст, очищает от пустых строк и делит на массив строк по разделителю `\n`.
3. Для каждой строки последовательно применяются регулярные выражения:
   - Для цифровых списков: `/^\d+[\.\)]\s*(.*)$/` (ищет числа с точкой или скобкой).
   - Для маркированных списков: `/^[\-\*]\s*(.*)$/` (ищет дефис или звездочку в начале строки).
4. Если регулярное выражение сработало, выделенная группа `taskTitle` очищается от пробелов и сохраняется в базу.

### Ограничение выбора согласующего (Ancestor Validation)
При отправке плана на согласование пользователь должен выбрать руководителя.
- Бэкенд вызывает функцию `getAncestorPostIds(plan.postId)`, которая выполняет рекурсивный подъем вверх по дереву оргструктуры от должности создателя плана до самого верха.
- Полученный массив содержит только прямых начальников. Если переданный `approverPostId` не входит в этот массив, запрос блокируется с ошибкой `400 Выберите руководителя из списка вышестоящих должностей`.

---

## Раздел 7: Финансовый учет, Бюджетирование и Лимиты Расходов

Модуль бюджетирования контролирует финансовую дисциплину организации на уровне отделов.

### Структура бюджета
Бюджеты хранятся в таблице `budgets` и содержат:
- `planned` — плановая сумма, которую отдел запрашивает на период.
- `limits` — лимит расходов (максимум, который департамент имеет право потратить). По умолчанию равен `planned`, но может быть изменен администратором.
- `approved` — фактически утвержденная руководством сумма.
- `spent` — сумма, уже потраченная отделом.
- `remaining` — доступный остаток средств.

На фронтенде остаток рассчитывается по формуле:
$$\text{Remaining} = \text{Approved} - \text{Spent}$$

---

## Раздел 8: Внутренняя почта и безопасность загрузки вложений (Multer, Path Traversal)

Внутренняя почта ERP-Upstat спроектирована как закрытый контур обмена сообщениями между должностными позициями.

### Пайплайн обработки загрузки файлов (Multer)
Когда пользователь отправляет сообщение с файлами, запрос обрабатывается middleware `multer` на бэкенде:
1. **Multer diskStorage:** Файлы временно сохраняются в директорию `backend/uploads/`.
2. **Генерация уникального имени:** Во избежание перезаписи файлов файлы получают уникальное имя с префиксом `att_`, таймстампом и случайным хэшем. Кириллические имена декодируются из `latin1` в `utf-8`.
3. **Ограничение по размеру:** В конфигурации Multer установлен жесткий лимит 10 МБ на файл.
4. **Фильтрация по MIME-типам:** Сервер разрешает только безопасные форматы документов и картинок из белого списка.

### Алгоритм защиты от Path Traversal (Обход путей)
При скачивании вложений бэкенд проверяет абсолютные пути для исключения возможности чтения несанкционированных файлов ОС:
1. Вычисляется абсолютный путь к запрашиваемому файлу на основе папки загрузок.
2. Оба пути приводятся к каноническому виду без переходов (разрешаются все ссылки `.` и `..` через `path.resolve`).
3. Выполняется префиксное сравнение строк. Если канонический путь к файлу не начинается с пути к папке загрузок, запрос блокируется.

---

## Раздел 9: Низкоуровневый аудит действий и структура JSON-логов

Лог аудита фиксирует все мутации данных в системе для последующего анализа безопасности.

### Структура таблицы и сериализация изменений
Каждая запись в таблице `audit_log` содержит поле `changes` типа `TEXT`. В это поле бэкенд записывает сериализованный JSON-объект, содержащий детальный слепок изменений (старые и новые значения полей).

### Ограничение доступа к логам на основе Allowed Subtree
Для предотвращения утечки конфиденциальной информации руководители видят логи изменений только для тех объектов, которые входят в их разрешенное дерево подчинения (`allowedPostIds`). Фильтрация выполняется на уровне SQL-запроса.

---

## Раздел 10: Полная спецификация API-эндпоинтов системы

Все запросы к API (за исключением авторизационных) требуют передачи токена `Authorization: Bearer <JWT>` в заголовках.

### 1. Модуль Аутентификации (`/api/auth`)

#### Регистрация новой учетной записи
- **Эндпоинт:** `POST /api/auth/signup`
- **Запрос:**
  ```json
  {
    "email": "user@example.com",
    "name": "Иван Иванов",
    "password": "securepassword123"
  }
  ```
- **Успешный ответ (201 Created):**
  ```json
  {
    "message": "Verification code sent to email",
    "email": "user@example.com"
  }
  ```
- **Ошибка (400 Bad Request):**
  ```json
  {
    "error": "Email, name and password are required"
  }
  ```

#### Вход в систему (Авторизация)
- **Эндпоинт:** `POST /api/auth/login`
- **Запрос:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123"
  }
  ```
- **Успешный ответ (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "u_user1",
      "email": "user@example.com",
      "name": "Иван Иванов",
      "role": "Employee",
      "organizationId": "1",
      "organizationName": "Main Organization",
      "postId": "p_employee1"
    }
  }
  ```
- **Ошибка (401 Unauthorized):**
  ```json
  {
    "error": "Invalid credentials"
  }
  ```
- **Ошибка (403 Forbidden - Email не верифицирован):**
  ```json
  {
    "error": "Email not verified",
    "isVerified": false,
    "email": "user@example.com"
  }
  ```

#### Подтверждение почты OTP-кодом
- **Эндпоинт:** `POST /api/auth/verify-email`
- **Запрос:**
  ```json
  {
    "email": "user@example.com",
    "code": "123456"
  }
  ```
- **Успешный ответ (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "u_user1",
      "email": "user@example.com",
      "name": "Иван Иванов",
      "role": "Employee",
      "organizationId": "1",
      "postId": "p_employee1"
    }
  }
  ```
- **Ошибка (400 Bad Request):**
  ```json
  {
    "error": "Invalid or expired verification code"
  }
  ```

### 2. Модуль Организационной структуры (`/api/org`)

#### Получение дерева оргструктуры
- **Эндпоинт:** `GET /api/org/posts`
- **Успешный ответ (200 OK):**
  ```json
  [
    {
      "id": "p1",
      "title": "Исполнительный директор",
      "description": "Руководитель организации",
      "parentPostId": null,
      "departmentId": "d1",
      "role": "Admin",
      "level": 0,
      "orderIndex": 0,
      "code": "CEO",
      "cardColor": "blue",
      "cardNotes": "Основной кабинет",
      "createdBy": "u1",
      "currentHolder": {
        "userId": "u1",
        "name": "Королева Анастасия",
        "email": "a@example.com",
        "avatarUrl": "/avatars/ceo.png"
      }
    }
  ]
  ```

#### Создание должности
- **Эндпоинт:** `POST /api/org/posts`
- **Запрос:**
  ```json
  {
    "title": "Начальник отдела разработки",
    "description": "Управление командой программистов",
    "parentPostId": "p2",
    "departmentId": "d3",
    "role": "Section Head",
    "orderIndex": 1,
    "code": "HEAD_DEV"
  }
  ```
- **Успешный ответ (201 Created):**
  ```json
  {
    "id": "p1717409000000",
    "title": "Начальник отдела разработки",
    "description": "Управление командой программистов",
    "parentPostId": "p2",
    "departmentId": "d3",
    "role": "Section Head",
    "level": 2,
    "orderIndex": 1,
    "code": "HEAD_DEV",
    "currentHolder": null
  }
  ```

#### Назначение сотрудника на пост
- **Эндпоинт:** `POST /api/org/posts/:id/assign`
- **Запрос:**
  ```json
  {
    "userId": "u3"
  }
  ```
- **Успешный ответ (200 OK):**
  ```json
  {
    "id": "p2",
    "title": "Заместитель по управлению",
    "parentPostId": "p1",
    "currentHolder": {
      "userId": "u3",
      "name": "Иван Свободный",
      "email": "free@example.com"
    }
  }
  ```

### 3. Модуль Инструкций (`/api/instructions`)

#### Получение списка инструкций
- **Эндпоинт:** `GET /api/instructions?postId=p2`
- **Успешный ответ (200 OK):**
  ```json
  [
    {
      "id": "ins2",
      "title": "Data Handling Guidelines",
      "postId": "p2",
      "ownerPostId": "p1",
      "status": "active",
      "version": 1,
      "content": "## Основные правила обработки данных...",
      "updatedAt": "2026-06-03T09:48:45.000Z"
    }
  ]
  ```

#### Подтверждение ознакомления
- **Эндпоинт:** `POST /api/instructions/:id/acknowledge`
- **Успешный ответ (200 OK):**
  ```json
  {
    "success": true
  }
  ```

### 4. Модуль Статистики (`/api/statistics`)

#### Сохранение ежедневного учета (Daily Entry)
- **Эндпоинт:** `POST /api/statistics/daily-entry`
- **Запрос:**
  ```json
  {
    "postId": "p1",
    "metricCode": "completedTasks",
    "date": "2026-06-01",
    "value": 8
  }
  ```
- **Успешный ответ (200 OK):**
  ```json
  {
    "postId": "p1",
    "metricCode": "completedTasks",
    "date": "2026-06-01",
    "value": 8
  }
  ```

#### Получение WoW Growth и Графиков за 30 дней
- **Эндпоинт:** `GET /api/statistics/series-30d?postId=p1&metricCode=completedTasks&weekStart=2026-06-01`
- **Успешный ответ (200 OK):**
  ```json
  {
    "postId": "p1",
    "metricCode": "completedTasks",
    "series": [
      { "date": "2026-05-15", "value": 5 },
      { "date": "2026-05-20", "value": 12 },
      { "date": "2026-06-01", "value": 8 }
    ],
    "weekOverWeekGrowthPercent": 14.28
  }
  ```

### 5. Модуль Планов Работ (`/api/work-plans`)

#### Создание плана
- **Эндпоинт:** `POST /api/work-plans`
- **Запрос:**
  ```json
  {
    "title": "План отдела разработки на Июнь",
    "postId": "p2",
    "department": "IT",
    "status": "on-track",
    "dueDate": "2026-06-30",
    "period": "2026-06",
    "messageText": "1. Развернуть сервер БД\n2. Провести рефакторинг API\n- Обновить макеты дизайна"
  }
  ```
- **Успешный ответ (201 Created):**
  ```json
  {
    "id": "wp1717409890",
    "title": "План отдела разработки на Июнь",
    "postId": "p2",
    "workflowStatus": "draft",
    "dueDate": "2026-06-30",
    "tasks": [
      { "id": "t1", "title": "Развернуть сервер БД", "orderIndex": 0 },
      { "id": "t2", "title": "Провести рефакторинг API", "orderIndex": 1 },
      { "id": "t3", "title": "Обновить макеты дизайна", "orderIndex": 2 }
    ]
  }
  ```

#### Отправка плана на согласование
- **Эндпоинт:** `POST /api/work-plans/:id/submit`
- **Запрос:**
  ```json
  {
    "approverPostId": "p1"
  }
  ```
- **Успешный ответ (200 OK):**
  ```json
  {
    "id": "wp1717409890",
    "workflowStatus": "submitted",
    "approverPostId": "p1",
    "submittedAt": "2026-06-03T09:59:43.000Z"
  }
  ```

---

## Раздел 11: Структура каталогов и компонентов (Фронтенд и Бэкенд)

```
.
├── backend/
│   ├── src/
│   │   ├── routes/           # Маршрутизаторы Express для каждого модуля
│   │   │   ├── auth.ts
│   │   │   ├── org.ts
│   │   │   ├── instructions.ts
│   │   │   ├── statistics.ts
│   │   │   ├── workPlans.ts
│   │   │   ├── finances.ts
│   │   │   ├── communication.ts
│   │   │   └── audit.ts
│   │   ├── middleware/       # Промежуточное ПО безопасности и RBAC
│   │   │   ├── auth.ts       # Валидация JWT токенов
│   │   │   ├── rbac.ts       # Проверка системных ролей
│   │   │   └── sanitize.ts   # Санитария строковых параметров
│   │   ├── services/         # Сервисы рассылок и сторонней интеграции
│   │   ├── types/            # Спецификация типов TypeScript
│   │   ├── db.ts             # Ядро работы с БД (методы запросов и транзакций)
│   │   ├── pgClient.ts       # Низкоуровневый клиент СУБД PostgreSQL
│   │   └── index.ts          # Входная точка Express приложения
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/       # Навигация, боковая и верхняя панели управления
│   │   │   ├── ui/           # Набор переиспользуемых элементов shadcn/ui
│   │   │   └── rbac/         # Компоненты условного рендера на основе ролей
│   │   ├── pages/            # Страницы модулей
│   │   │   ├── Login.tsx     # Форма авторизации
│   │   │   ├── Signup.tsx    # Форма регистрации
│   │   │   ├── VerifyEmail.tsx # Форма ввода OTP-кода подтверждения
│   │   │   ├── Dashboard.tsx # Лента логов аудита и сводные KPI
│   │   │   ├── OrgChart/     # Модуль оргструктуры
│   │   │   ├── Instructions/ # Модуль регламентов
│   │   │   ├── Statistics/   # Модуль статистик и аналитики
│   │   │   ├── WorkPlans/    # Модуль планов работ
│   │   │   ├── FinancialPlanning/ # Модуль бюджетов
│   │   │   ├── Communication/ # Модуль почты
│   │   │   └── Users/        # Модуль администрирования пользователей
│   │   ├── store/            # Глобальный Redux стейт и слайсы данных
│   │   ├── services/         # API-клиенты для связи с сервером
│   │   └── types/            # TypeScript-типы фронтенда
│   └── package.json
└── README.ru.md
```

---

## Раздел 12: Инструкции по развертыванию, миграциям и администрированию

В репозитории подготовлены конфигурации для быстрого запуска как в режиме разработки, так и для production-окружения.

### Переменные окружения (`.env`)
Для работы бэкенда необходим файл `.env` в папке `backend/.env` (или глобальный `.env` в корне для Docker Compose):
```ini
PORT=3001
JWT_SECRET=erp-upstat-dev-change-me-in-production-32chars # Должен быть >= 32 символов
NODE_ENV=development
DATABASE_URL=postgresql://erp:password@localhost:5432/erpupstat
```

### Схема базы данных и миграции
При старте сервера бэкенд автоматически запускает функцию `initDb()` (файл `backend/src/db.ts`), которая читает схему, накладывает необходимые изменения колонок и осуществляет сидирование демонстрационных данных при пустой БД.

### Локальный запуск (разработка)
1. **Бэкенд:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```
2. **Фронтенд:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Запуск через Docker (Production-стэк)
Сборка и запуск всего окружения (база данных PostgreSQL + API-сервер Express + Nginx c дистрибутивом фронтенда):
```bash
cp .env.example .env
docker compose up --build -d
```
Приложение будет доступно по адресу **http://localhost**.
