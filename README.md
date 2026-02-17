# Open Front Rank (Supabase + Static Site)

This starter gives you:
- Admin login page via Supabase magic link (`login.html`)
- Form to add a game (date, map, replay, typed player count, placements)
- Live leaderboard table based on average `placement / players_in_game`
- Average score trend chart
- Adjacent-rank comparison table using percentage gap
- Admin form to add new players
- Recent games table

## 1) Create Supabase project
1. Go to Supabase and create a new project.
2. In SQL Editor, run `schema.sql` from this repo.
3. Replace seeded player names in `public.players` with your real 7 players.

## 2) Enable auth email login
1. In Supabase Auth settings, keep Email provider enabled.
2. For production later, add your real Site URL + redirect URLs.
3. Admin email is `aliabzakh77@gmail.com`.

## 3) Add Supabase keys
Edit `app.js`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Use values from Supabase Project Settings -> API.

## 4) Run locally
Because this is a static app, you can serve it with any local server.

If you have Node installed:
```bash
npx serve .
```
Then open the shown localhost URL.
- Use `login.html` to sign in as admin.

## Scoring system
Per game score is:
- `score = placement / players_in_game`

Examples:
- 1st in 6-player game = `1/6 = 0.167`
- 3rd in 7-player game = `3/7 = 0.429`

Overall rank is each player's average score across their games:
- `avg_score = sum(game_scores) / games_played`
- Lower is better.

Comparison table formula (adjacent ranks):
- `((lower - higher) / higher) * 100`

## Notes
- Public users can read leaderboard/game data.
- Only `aliabzakh77@gmail.com` can insert new games/results/players by RLS policy.

## If you already ran an older schema
Run `schema.sql` again so the admin-only policies are recreated.
