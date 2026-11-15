# Poker Nights

A mobile-friendly home poker tracker for buy-ins, cash-outs, and settling up with friends.

Static HTML, CSS, and JavaScript with fully usable guest mode and optional Google accounts for saved player groups. Cash calculations use cents; settlement rounds balanced payouts and uses direct debtor-to-creditor transfers. Chip mismatches require confirmation before adjusting payouts. Missing chips leave unclaimed cash, allocated to the biggest winner; extra chips reduce the biggest winner's payout first, then others if necessary.

## GitHub Pages

The frontend remains at https://rsr0001.github.io/Poker-Nights/. GitHub Pages serves the repository root on `main`. Keep that hosting configuration; the VPS serves only the API.

## Local use

Run `python3 -m http.server 8000` in this folder, then open http://localhost:8000. Run `node --test settlement.test.js` to check the settlement calculations.

Games save in localStorage in the same browser on the same device, with no app-imposed expiry. Browser data clearing, private browsing, or storage eviction can remove them. Download a JSON backup to keep a game; use Restore backup to load it. Games do not synchronize across devices. Buy-ins paid to a central pot should be cashed out from that pot; peer transfers are for games where cash has not already been collected.

## Optional accounts and saved groups

Sign in with Google to create named groups with player names and usual buy-in settings. Groups sync across devices. Starting a game copies the saved group: adding/removing players or changing game names does not edit the group. Game history is not uploaded. Chip-count input arrows remain at one chip.

The API is https://pokernights.duckdns.org. It validates Google ID token signatures, audience, issuer and expiry using Google's library and consumes a server-generated nonce once. Identity uses Google's stable `sub`, never a browser-supplied email. Random 12-hour session tokens are stored in the browser tab's sessionStorage; only their hashes are stored server-side. Logout revokes the session. JSON requests use bearer authorization and an exact allowed origin, avoiding cross-site cookies between GitHub Pages and DuckDNS.

Google Auth Platform needs a Web application OAuth client with authorized JavaScript origin `https://rsr0001.github.io` (no path). No redirect URI or client secret is used. While the OAuth app is in Testing, add intended accounts as test users. The public client ID is supplied by the API's `/config` endpoint; configure `GOOGLE_CLIENT_ID` in `/etc/pokernights/api.env` and restart only `pokernights.service`.

## VPS operations

- API: `/opt/pokernights`, systemd unit `pokernights.service`, Linux user `pokernights`, bound to `127.0.0.1:5010`.
- PostgreSQL database and restricted role: `pokernights`, using local Unix-socket peer authentication, with no database password. Database tables store accounts, hashed sessions, temporary nonces, and user-owned groups.
- Nginx host: `/etc/nginx/sites-available/pokernights.duckdns.org`; HTTPS certificate managed by Certbot and its existing renewal timer.
- Configuration: `/etc/pokernights/api.env`, readable only by root and the poker group. Do not commit environment files, tokens, keys or database backups.
- Check: `systemctl status pokernights`, `journalctl -u pokernights`, and `curl -fsS https://pokernights.duckdns.org/health`.
- Before application updates, make a root-only `pg_dump` of the poker database. Copy changed API files into `/opt/pokernights`, preserving root ownership and poker group read access; run `npm ci --omit=dev --ignore-scripts`, apply any reviewed additive schema changes as the poker user, and restart only `pokernights.service`.
- `backend/deploy.sh` documents the initial installation and refuses to overwrite an existing deployment. Do not rerun it for updates. It backs up Nginx before installation and verifies cricket virtual-host hashes and cricket service process identity afterward.
- Preserve cricket databases, runtimes, services, and virtual hosts. Always run `nginx -t` before a shared Nginx reload.

## Tests

Guest settlement tests: `node --test settlement.test.js`.

Install test dependencies with `cd backend && npm ci --ignore-scripts`, then run `npm test` for API input validation and frontend DOM regression tests. The real PostgreSQL integration suite runs only when `TEST_DATABASE_URL` is supplied; it creates uniquely named disposable test accounts, exercises nonce replay rejection, sessions, group ownership and logout, then removes its test data. It injects a verifier into the test app; the production server always uses Google's verifier. It does not substitute for testing a real Google login in the published frontend.
