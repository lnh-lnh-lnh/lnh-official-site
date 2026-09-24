# LNH Web

Static publishing package for the LNH website.

## Final Pages

The Cloudflare-ready site is in `public/`.

- `index.html`
- `brief.html`
- `direction.html`
- `build.html`
- `curation.html`
- `care.html`
- `edit.html`
- `partnership.html`
- `about.html`
- `stories.html`

## Cloudflare Pages

Connect this GitHub repository to Cloudflare Pages with:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `public`

`wrangler.toml` is included for optional CLI deployment.

## Application and Admin

The site includes a Cloudflare Pages Functions based intake system:

- `/apply.html`: initial service application
- `/brief-survey.html`: tokenized Brief follow-up survey
- `/admin/`: applicant and anonymous funnel dashboard
- `/api/*`: D1-backed Pages Functions
- `wrangler.mailer.toml`: privacy-minimized new-application email notifier

Do not publish the application system before D1, Cloudflare Access, spam protection, and the final privacy policy are configured. See [ADMIN_SETUP.md](ADMIN_SETUP.md).
