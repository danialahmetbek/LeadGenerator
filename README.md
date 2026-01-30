Enterprise Lead Generation Pipeline 🚀
[
[
[

Full-stack serverless pipeline для автоматизированного поиска B2B лидов с использованием Google Cloud Platform, LLM и geospatial анализа.

🏗️ Архитектура системы
text
[Location + Radius] 
       ↓
[mapslayer] → Grid Search (2km²) → Place IDs
       ↓ 
[getDetails] → Places API (40/batch) → Websites + Reviews
       ↓
[gptlayer] → GPT-4o-mini → Contacts + Probability Scores
       ↓ (50%+ threshold)
[sonnetlayer] → Claude 3.5 → Personalized Proposals
       ↓
[sendletters] → SMTP + IMAP → Email Delivery
✨ Основные возможности
Функция	Описание	Технологии
Geospatial Grid Search	Разбиение области поиска на 2km² ячейки	Places API v1, Grid Math
API Quota Management	Batch processing (40 places/request)	Promise.all, Recursive chaining
Website Scraping	Контактные страницы + email extraction	Cheerio, html-to-text, Recursive crawler
Multi-LLM Pipeline	GPT-4o + Claude 3.5 Sonnet	JSON mode, Structured output
Rate Limiting	Cloud Tasks (30-60s intervals)	Progressive delays
Data Persistence	Session management в GCS	JSON merge pattern
Email Infrastructure	SMTP + IMAP (Sent folder sync)	Nodemailer, iconv-lite
🛠️ Технологический стек
text
🔥 GCP Services
├── Cloud Run (8 микросервисов)
├── Cloud Tasks (оркестрация)
├── Cloud Storage (сессии)
├── Secret Manager (API keys)
└── Service Accounts (OIDC)

🧠 AI/ML
├── OpenAI GPT-4o-mini (контакты + scoring)
└── Anthropic Claude 3.5 Sonnet (письма)

🌍 Geospatial
├── Google Places API v1 (Text Search + Details)
├── Geocoding API
└── Custom grid algorithm (2km² cells)

📧 Email
├── Nodemailer (SMTP)
├── imap-simple (Sent folder)
└── UTF-8 encoding (iconv-lite)

🕷️ Scraping
├── Cheerio (DOM parsing)
├── html-to-text
└── SSL bypass (HTTPS agent)
🚀 Быстрый старт
1. Клонируй репозиторий
bash
git clone https://github.com/yourusername/lead-generation-pipeline.git
cd lead-generation-pipeline
2. Настрой переменные окружения
bash
cp .env.example .env
# Заполни API ключи и GCP настройки
3. Запусти локально (Docker Compose)
bash
docker-compose up --build
4. Тестируй pipeline
bash
curl -X POST http://localhost:8080/mapslayer \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Dubai, UAE",
    "radius": 5000
  }'
📁 Структура проекта
text
lead-generation-pipeline/
├── services/
│   ├── mapslayer/           # Places API search (grid + pagination)
│   ├── getdetails/          # Place details extraction (40/batch)
│   ├── gpt/                 # GPT-4o analysis + contact extraction
│   ├── anthropic/           # Claude Sonnet proposal generation
│   ├── scraper/             # Website crawling utilities
│   └── email/               # SMTP + IMAP delivery
├── docker-compose.yml       # Local development
├── .env.example            # Environment variables
└── README.md
🔍 Pipeline в деталях
1. Geospatial Discovery (mapslayer)
text
Dubai Marina (5km radius) → 11 company types → 2km² grid → 1000+ Place IDs
2. Data Enrichment (getDetails)
text
Place IDs → Places Details API → Websites + Reviews (200 chars/review)
Quota handling: 40 places per batch, recursive chaining

3. Lead Scoring (gptlayer)
text
Website scraping + Google Reviews → GPT-4o → {emails[], phone, probability, analysis}
Output: JSON structured contacts + UAE relocation probability (0-100%)

4. Proposal Generation (sonnetlayer)
text
High-probability leads (50%+) → Claude 3.5 → Personalized proposals
Rate limited: Cloud Tasks (60s intervals)

5. Delivery (sendletters)
text
Proposals → Mail.ru SMTP → IMAP Sent folder sync
15s delay between emails per domain

📊 Производительность
Этап	Время	Параллельность
Grid Search	2-5 мин	Sequential (pagination)
Place Details	3-7 мин	40 parallel requests
GPT Analysis	45s/компания	Cloud Tasks (30s)
Claude Proposals	60s/компания	Cloud Tasks (60s)
Email Delivery	15s/email	Sequential per domain
Total: ~15 минут для 100+ компаний в 5km радиусе

🧪 Локальная разработка
bash
# 1. Установи зависимости
npm install

# 2. Запуск всех сервисов
docker-compose up

# 3. Тестирование эндпоинтов
curl -X POST http://localhost:8080/mapslayer -d '{"location":"Dubai","radius":5000}'
🔒 Безопасность
✅ Все API ключи в Secret Manager

✅ Service Accounts с минимальными правами

✅ Cloud Tasks для rate limiting

✅ GCS bucket isolation

✅ SSL bypass только для scraping

📈 Масштабируемость
Компонент	Horizontal Scaling	Auto-scaling
Cloud Run	✅ 1000 instances	✅ CPU-based
Cloud Tasks	✅ Unlimited queue	✅ Automatic
GCS	✅ Petabyte scale	✅ Global
🎯 Бизнес-результат
text
Input: "Dubai Marina, 5km"
Output: 100+ B2B companies → 25 high-probability leads → 15 personalized proposals → 5% response rate
🤝 Контакты
Yertay Ahmetbek — Backend Developer
LinkedIn | yertay@email.com
City University of Hong Kong — Computer Science

<div align="center">
Built with ❤️ for production-grade lead generation at scale

[

</div>