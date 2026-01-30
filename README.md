# Lead Generation Pipeline 🚀

**Production-grade GCP Cloud Run Microservices | Serverless Architecture**

***

## 🏗️ Architecture (7 Microservices)

```
📍 gathercomp → 🔍 getdetails → 🤖 batchprocessgpt → 💬 chatgpt → 🎯 batchprocessantropic → 🎯 antropic → 📧 sendletters
```

## 📁 Microservices Structure

```
LeadGenerator/
├── gathercomp/              # Places API grid search (2km² cells)
├── getdetails/              # Place Details API (40/batch processing)
├── batchprocessgpt/         # Cloud Tasks orchestrator (GPT pipeline)
├── chatgpt/                 # GPT-4o-mini + scraping (scrap.js)
├── batchprocessantropic/    # Cloud Tasks (Sonnet, 50%+ threshold)
├── antropic/                # Claude 3.5 Sonnet proposals
└── sendletters/             # SMTP + IMAP delivery
```

## 🔧 Technology Stack

```
GCP Serverless Infrastructure:
├── Cloud Run (7 independent microservices)
├── Cloud Tasks (distributed orchestration + rate limiting)
├── Cloud Storage (JSON session persistence)
└── Secret Manager (API key management)

External APIs & Integrations:
├── Google Places API v1 (Text Search + Place Details)
├── Google Geocoding API (address → lat/lon)
├── OpenAI GPT-4o-mini API (structured data extraction)
├── Anthropic Claude 3.5 Sonnet API (content generation)
└── Custom geospatial grid algorithm (2km² cells)

Production Email Infrastructure:
├── Nodemailer (SMTP delivery)
├── imap-simple (Sent folder synchronization)
└── iconv-lite (UTF-8 encoding handling)

Web Scraping Pipeline:
├── Cheerio (server-side DOM parsing)
└── html-to-text (content extraction)
```

## 📊 Pipeline Stages

| # | Service | Input | Output | Key Features |
|---|---------|-------|--------|--------------|
| 1 | `gathercomp` | Location + radius | Place IDs | 2km² grid search + Places API pagination |
| 2 | `getdetails` | Place IDs | Websites + Reviews | 40 parallel requests + recursive batching |
| 3 | `batchprocessgpt` | Session JSON | GPT Tasks | Cloud Tasks (30s rate limiting) |
| 4 | `chatgpt` | Websites + Reviews | Contacts + Scores | GPT-4o JSON mode + website scraping |
| 5 | `batchprocessantropic` | Probability >50% | High-value leads | Cloud Tasks (60s) + email validation |
| 6 | `antropic` | High-value leads | Proposals | Claude 3.5 Sonnet generation |
| 7 | `sendletters` | Proposals + Emails | Delivered emails | SMTP delivery + IMAP sync |

## 🎯 Key Technical Solutions

```
✅ Custom geospatial grid algorithm (2km² cells for Places API coverage)
✅ API quota optimization (40 Place Details/batch + recursive chaining)
✅ Multi-external-API pipeline orchestration (Places → GPT → Claude)
✅ Distributed rate limiting via Cloud Tasks (30s/60s intervals)
✅ GCS session persistence (JSON merge: {...old_data, ...new_data})
✅ Recursive website crawling (contact pages + mailto targeting)
✅ Production email system (SMTP delivery + IMAP Sent folder sync)
✅ UTF-8 encoding pipeline (iconv-lite for international content)
```

***

**Production B2B Lead Generation System**  
**7 Independent Cloud Run Microservices | Serverless | Enterprise Architecture**

***