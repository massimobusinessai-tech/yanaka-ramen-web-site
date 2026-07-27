# 2026-07-27 — Sistema Ordinazione Completo + Riorganizzazione File

## Obiettivo
Aggiungere al sito Yanaka Ramen un sistema di ordinazione takeaway con pagamento online Stripe e notifiche Telegram, deployabile su Railway.

## Cosa è stato fatto

### Backend (Express - `serve.js`)
- `POST /api/checkout` — crea Stripe Checkout Session, salva ordine in `data/orders.json`
- `POST /api/stripe-webhook` — riceve conferma pagamento da Stripe, aggiorna ordine, invia Telegram
- `GET /api/order/:id` — recupera dettagli ordine
- `GET /api/order-status` — verifica stato pagamento Stripe
- `GET /api/hours` — restituisce orari (12:00-15:00 / 19:00-23:00) e slot disponibili
- Notifica Telegram con messaggio HTML formattato

### Frontend (`public/`)
- Carrello slide-in con quantità (+/-), badge, localStorage
- Checkout overlay con form, selezione orario, riepilogo
- Overlay conferma con numero ordine e dettagli
- Pulsanti "Aggiungi" su ogni item del menu
- **Admin dashboard** protetta: login, lista ordini, marca completato, cancella, sezione ordini completati giornalieri

### Screenshot/Test Workflow
- `screenshots/screenshot.mjs` — script Puppeteer per screenshot da localhost

### Brand Assets
- `assets/brand/` — logo, guidelines
- `assets/photos/` — 34 foto del ristorante

### File Organizzazione (Refactor)
- Unificato tutte le immagini in `public/images/` (38 foto cibi)
- Spostato screenshot in `screenshots/`
- Unificato brand assets in `assets/brand/`
- Spostato documentazione storica in `docs/`
- **Rimosso duplicati root**: `js/`, `css/`, `images/`, `index.html`, `admin.html`, `menu.json`
- **Rimosso file Netlify**: `netlify.toml`, `netlify/functions/`
- Aggiornato `menu.js` fetch path da `/menu.json` a `/data/menu.json`
- Semplificato fallback SPA in `serve.js`
- Creato `README.md` con documentazione completa
- **Ripristinato**: `CLAUDE.md` e `.claude/skills/frontend-design.md` (da git history)

## Decisioni importanti

### Perché non Netlify
Netlify è hosting statico — il server Express (`serve.js`) non può girare. Abbiamo dovuto creare workaround complessi (Netlify Functions, file duplicati, demo mode). **Decisione: passare a Railway** che supporta Express nativamente.

### Stripe & Telegram
Le chiavi API vanno configurate come variabili d'ambiente su Railway (NON nel codice):
- `STRIPE_SECRET_KEY` — chiave segreta Stripe
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret
- `TELEGRAM_BOT_TOKEN` — token bot Telegram
- `TELEGRAM_CHAT_ID` — chat ID ristorante
- `BASE_URL` — URL del sito su Railway

### Carta di Test Stripe
`4242 4242 4242 4242` (qualsiasi scadenza futura, qualsiasi CVC)

## Deploy su Railway (da fare)
1. `npm i -g @railway/cli`
2. `railway login`
3. `railway init`
4. `railway env` — aggiungere tutte le variabili d'ambiente
5. `railway up`
6. Configurare webhook Stripe → puntare a `https://*.railway.app/api/stripe-webhook`
7. Testare con carta di test

## File importanti
- `serve.js` — server Express (entry point)
- `lib/hours.js` — logica orari
- `lib/orders.js` — CRUD ordini su file JSON
- `lib/telegram.js` — notifiche Telegram
- `public/index.html` — frontend principale
- `public/js/menu.js` — modulo menu
- `public/js/cart.js` — modulo carrello
- `public/js/checkout.js` — modulo checkout + conferma
- `public/js/admin.js` — dashboard admin
- `data/menu.json` — menu del ristorante
- `data/orders.json` — storage ordini
- `CLAUDE.md` — regole progetto per Claude
- `.claude/skills/frontend-design.md` — skill di design frontend