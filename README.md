# 🍜 Yanaka Ramen — Sito Web

Sito web per ristorante giapponese Yanaka Ramen con sistema di ordinazione takeaway, pagamento online e notifiche Telegram.

## 🚀 Stack

| Tecnologia | Ruolo |
|---|---|
| **Node.js** + **Express** | Backend server |
| **Stripe Checkout** | Pagamenti online |
| **Telegram Bot** | Notifiche ordini al ristorante |
| **File JSON** | Storage ordini (nessun DB) |
| **Railway** | Hosting (prossimo deploy) |

## 📁 Struttura Progetto

```
yanaka-ramen-web-site/
├── serve.js              ← Server Express (avvio: node serve.js)
├── package.json
├── .env                  ← Chiavi API (gitignored)
├── .env.example          ← Template variabili d'ambiente
├── README.md
│
├── data/
│   ├── menu.json         ← Menu del ristorante (48 prodotti)
│   └── orders.json       ← Ordini ricevuti (gitignored)
│
├── lib/
│   ├── hours.js           ← Logica orari apertura (12:00-15:00 / 19:00-23:00)
│   ├── orders.js          ← CRUD ordini su file JSON
│   └── telegram.js        ← Invio notifiche Telegram
│
├── public/
│   ├── index.html         ← Sito principale (single page)
│   ├── admin.html         ← Dashboard admin (protetta)
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── menu.js        ← Menu module
│   │   ├── cart.js         ← Carrello module
│   │   ├── checkout.js     ← Checkout module
│   │   └── admin.js        ← Admin dashboard module
│   └── images/            ← Foto cibi e loghi
│       ├── mmexport...    ← 38 foto cibi/piatti
│       └── yanaka-logo.png
│
├── assets/
│   ├── brand/             ← Asset brand (logo, guidelines)
│   └── photos/            ← Foto del ristorante (34 foto)
│
├── screenshots/            ← Screenshot temporanei
│
└── docs/                   ← Documentazione storica del progetto
```

## 🔧 Installazione

```bash
# 1. Clona il repo
git clone https://github.com/massimobusinessai-tech/yanaka-ramen-web-site.git
cd yanaka-ramen-web-site

# 2. Installa dipendenze
npm install

# 3. Crea file .env (copia da .env.example)
cp .env.example .env

# 4. Avvia il server
node serve.js
```

## 🌐 Variabili d'Ambiente (`.env`)

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Chiave Stripe (test: `sk_test_...`, live: `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Webhook signing secret (per ricevere conferme pagamento) |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token bot Telegram (da @BotFather) |
| `TELEGRAM_CHAT_ID` | ✅ | ID chat del ristorante su Telegram |
| `BASE_URL` | ✅ | URL del sito (es. `https://yanaka-ramen.railway.app`) |
| `ADMIN_USERNAME` | ❌ | Username admin dashboard (default: `admin`) |
| `ADMIN_PASSWORD` | ❌ | Password admin dashboard (default: `yanaka2024`) |
| `PORT` | ❌ | Porta server (default: `3000`) |

## 🧪 Test

### Carta di test Stripe
```
Numero: 4242 4242 4242 4242
Scadenza: qualsiasi data futura
CVC: qualsiasi 3 cifre
```

### Orari apertura
- Pranzo: 12:00 — 15:00
- Cena: 19:00 — 23:00

## 🚢 Deploy su Railway

```bash
# 1. Installa Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Inizializza progetto
railway init

# 4. Aggiungi variabili d'ambiente
railway env

# 5. Deploy
railway up
```

## 📋 Funzionalità

- [x] Menu digitale con 6 categorie (antipasti, gyoza, sando, ramen, donburi, dolci)
- [x] Carrello takeaway con localStorage
- [x] Checkout con selezione orario ritiro (slot 15 min)
- [x] Pagamento online con Stripe Checkout
- [x] Notifica ordine su Telegram al ristorante
- [x] Validazione orari apertura (client + server)
- [x] Admin dashboard: login, lista ordini, marca completato, cancella, sezione giornaliera
- [x] Design responsive (mobile + desktop)
- [x] Gallery immagini
- [x] Integrazione RistoBot per prenotazioni tavoli