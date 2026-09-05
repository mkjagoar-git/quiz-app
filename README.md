# Quiz Portal

Organizer/participant quiz app. Static frontend + Netlify Functions + Postgres (Neon).

## Stack
- Frontend: single page, one URL — `public/index.html` + `public/js/app.js`. Organizer and participant both sign in from the same landing page; no separate pages to navigate to.
- Backend: Netlify Functions (`netlify/functions/`), one file per endpoint
- Database: Postgres — tested against Neon, same pattern as your Instant Mechanic project
- Auth: JWT (organizer and participant are separate roles/tokens)

## One-time setup

1. **Create a Postgres database** (e.g. a new Neon project) and run `db/schema.sql` against it.
   This seeds the three fixed slots QUIZ-1 / QUIZ-2 / QUIZ-3.

2. **Generate the organizer password hash** (organizer is a single fixed account, not a DB row):
   ```
   node -e "console.log(require('bcryptjs').hashSync('your-password-here', 10))"
   ```

3. **Set environment variables** (Netlify dashboard → Site settings → Environment variables, or `netlify env:set` locally):
   - `DATABASE_URL` — your Postgres connection string
   - `JWT_SECRET` — any long random string
   - `ORGANIZER_USERNAME` — organizer's login username
   - `ORGANIZER_PASSWORD_HASH` — output from step 2

4. **Install and deploy**:
   ```
   npm install
   netlify init      # link/create the Netlify site
   netlify deploy --prod
   ```
   Or `netlify dev` to run it locally first.

## CSV formats

**Questions** (per quiz slot, replaces the whole bank on upload):
```
question,option_a,option_b,option_c,option_d,correct
"2+2=?","3","4","5","6","b"
"Pick all primes","2","4","5","9","a;c"
```
`correct` holds the letter(s) of the right option(s) — one letter for single-correct, several for multi-select.

**Participants**:
```
username
100234
100235
```
You choose the default password for the whole batch when you upload (a field next to the CSV box) — it's no longer derived from the username. Every new account in the batch starts with that password and must change it on first login. Resetting a single participant's password later works the same way: you type the new value, it doesn't get auto-generated.

## Design decisions made where the spec was underspecified

- **Multi-select scoring is all-or-nothing** per question (every correct option selected, no incorrect ones) — no partial credit. If you want partial credit, that's a different scoring function in `participant-quiz-submit.js`.
- **`num_questions`** on a quiz slot is how many questions are randomly served per attempt out of the full uploaded bank — so you can upload more questions than you show, and each attempt gets a random subset.
- **Retake grants are single-use**: the organizer unlocks one retake; after the participant submits that retake attempt, the lock reapplies automatically. Re-grant if they need another.
- **Default participant password is organizer-chosen, not derived from the username.** Set per batch at upload time, and per participant at reset time. Pick something distinct from your own organizer password — reusing your login password as everyone's default means hundreds of people end up knowing it.
- **Certificates are downloaded, not emailed** — the spec says "send downloaded certificate," and there's no email service wired up. The organizer downloads the PDF from the Reports panel and sends it manually. Say the word if you want automatic emailing added (needs an email provider, e.g. Resend or SendGrid).
- **Single fixed organizer account**, per your answer — not a multi-tenant system. If you ever need more than one organizer, the schema and auth would need to change.

## Known gaps / things to harden before this is a real deployment
- No rate limiting on login endpoints. Less severe now that the default password isn't derivable from the username, but still worth a lockout after N failed attempts before this handles real accounts.
- No CSRF protection — acceptable for a JWT-bearer-token API called only from this frontend, but worth knowing.
- No file upload size limit enforced on the CSV endpoints — a very large paste could hit Netlify Functions' payload limit (6MB).
