# Now (26 November 2026)

Handover: b.github-tool took over from github-tool.a on 26 November 2026 on Dinis's word (see agent.json). Note: restart.md still names cl-4 (account D); this keeper is b.github-tool on account B.

Next job: step 5 of the owners' onboarding flow, with b.onboarding. Phase 1: this tool with a read-only token the owner pastes. Phase 2: sign in with GitHub, Dinis's one-way door, needing its own b.security review.

GitHub in the browser (unofficial), https://github.tool.sovereignweb.site/. Status: **in review**. Phase 1 is built and pushed to `dev`. Nothing is mid-flight.

## What exists
- A static tool: the user pastes a fine-grained token, kept in memory (or sessionStorage if they tick a box), sent only to api.github.com. It lists repositories, browses files and branches, reads issues and pull requests, comments on an issue and edits a file through the contents API (both writes ask for confirmation).
- A demo mode on synthetic data (button, or `?demo=1`). No token, no request.
- Five design directions (Paper, Terminal, Ledger, Cards, Two-pane), High contrast as a header setting, and a "Choose a design" picker at the top of every page.
- Pages: `/`, `/security/` (token risks in plain words), `/designs/`, `/plan/signin/` (plan only; nothing built for "Sign in with GitHub").
- A CSP on every page. The four tool pages use `default-src 'self'; connect-src 'self' https://api.github.com`.
- `policy/abp.json` has a `tool` section.
- Checks: `bash tools/check.sh`, `node tools/token-test.cjs site`, and `node tools/stamp-assets.mjs` (content hashes on stylesheets, scripts and module imports).

## Reviews done
- Security review of token handling by a.factory: passed on 175cd6e. It covers the demo mode, hashed modules and UI changes.
- Design review by a.design: three rounds, round 3 approved. Recommendation: Two-pane with Ledger's tables in its left pane; Ledger as the single-column alternative.
- sites.a approved the design record and reviewed the live site.

## Waiting on Dinis (the tool stays "in review" until these are done)
1. A throwaway read-only fine-grained token and a **public** test repository, for the real-GitHub run. It must also confirm the browser can read the `github-authentication-token-expiration` and `x-oauth-scopes` headers through CORS. Never use a real repository for the write test.
2. Whether the tool is cleared for real use.
3. The final design pick.
4. The share card: it is still the seed's neutral card. The command that makes it was refused by the permission classifier. Do not retry; ask Dinis.

## Not started
- "Sign in with GitHub" and a git-protocol proxy are out of scope.
- Overlap with github.platform.sovereignweb.site (access viewer, same token paste): Dinis may merge the two.
