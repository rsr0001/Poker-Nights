# Poker Nights

A mobile-friendly home poker tracker for buy-ins, cash-outs, and settling up with friends.

Static HTML, CSS, and JavaScript. No accounts, backend, dependencies, or paid hosting. Cash calculations use cents; settlement rounds balanced payouts and uses direct debtor-to-creditor transfers. Chip mismatches require confirmation before adjusting payouts. Missing chips leave unclaimed cash, allocated to the biggest winner; extra chips reduce the biggest winner's payout first, then others if necessary.

## GitHub Pages

Push these files to the `main` branch. In repository **Settings → Pages → Build and deployment**, choose **GitHub Actions**. The included workflow tests and deploys the app. The expected URL is https://rsr0001.github.io/Poker-Nights/ once deployment succeeds.

## Local use

Run `python3 -m http.server 8000` in this folder, then open http://localhost:8000. Run `node --test settlement.test.js` to check the settlement calculations.

Games save in localStorage in the same browser on the same device, with no app-imposed expiry. Browser data clearing, private browsing, or storage eviction can remove them. Download a JSON backup to keep a game; use Restore backup to load it. Games do not synchronize across devices. Buy-ins paid to a central pot should be cashed out from that pot; peer transfers are for games where cash has not already been collected.
