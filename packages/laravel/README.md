# snag-tech/laravel

Add an in-app “fix this” tab to your Laravel staging or internal build. It works on Filament 3 and 4 panels and on any Livewire 3 or Blade page. Testers describe a change on the screen they’re looking at; Snag sends it (with a screenshot, the route, and the Filament page or Livewire component) to your team’s coding agent.

**You need two values from your Snag admin** before you start:

- `endpoint` — relay URL
- `projectKey` — your app’s `snag_pk_...` key

Your admin also has to add your staging URL (for example `https://staging.example.com`) to the project's allowed origins.

---

## 1. Install

```sh
composer require snag-tech/laravel
```

Requires PHP 8.1+, Laravel 10, 11 or 12, and Livewire 3. Filament 3 and 4 are picked up automatically when installed.

---

## 2. Add environment variables

Only set these on **local and staging**. Leave them unset in production — nothing renders.

```env
SNAG_ENDPOINT=https://<project-ref>.supabase.co/functions/v1/relay
SNAG_PROJECT_KEY=snag_pk_...
```

Snag also renders only when `APP_ENV` is `local` or `staging` (see `enabled_environments` below).

---

## 3. Show the tab

**Filament:** nothing to do. The tab is added to the end of `<body>` on every panel.

**Other pages** (Livewire or plain Blade): add `@snag` to your layout, just before `</body>`:

```blade
<body>
    {{ $slot }}

    @snag
</body>
```

`@snag` renders at most once per page, so it is safe to also have it in a layout Filament uses.

---

## That’s it

- If the env vars are set and your project is enabled, a slim tab appears at the bottom center of the screen. Click it to open the request panel.
- It keeps working across `wire:navigate` and Filament's SPA mode: the tab stays mounted, and each request carries the route of the page you're on.
- If not, nothing renders — safe to ship in every build.
- To turn Snag off remotely, your admin disables the project — no deploy needed.

---

## What the agent receives

Every request includes, next to the screenshot and your description:

- the route name, URI and controller action, for example `App\Http\Controllers\OrderController@show`
- on Filament pages: the panel id, the Resource class and the Page class, for example `App\Filament\Resources\UserResource` and `App\Filament\Resources\UserResource\Pages\EditUser`
- for each element you pick: the Livewire component it sits in, for example `app.filament.resources.user-resource.pages.edit-user`

No request input or user data is added to the context.

---

## Optional

Publish the config to change these:

```sh
php artisan vendor:publish --tag=snag-config
```

| Option | What it does |
|--------|----------------|
| `enabled_environments` | Environments where Snag renders. Default `['local', 'staging']`. Never add `production` |
| `panels` | `'*'` for every Filament panel, or a list of panel ids such as `['admin']` |
| `requester` | Attribute on the logged-in user shown as “who asked” in the request list. Default `email`; `null` to send nothing |
| `context` | Invokable class name that receives `(array $context, Request $request)` and returns extra context |
| `markers` | Set `false` to hide the numbered pins that mark open requests on the page |
| `theme` | Override colors, for example `['accent' => '#5B4CF5']` |
| `debug` | `SNAG_DEBUG=true` logs probe and request details to the browser console |
| `enabled` | `SNAG_ENABLED=false` turns Snag off without removing the keys |

For logic that doesn't fit in config, use a service provider:

```php
use SnagTech\Laravel\Snag;

public function boot(): void
{
    Snag::resolveRequesterUsing(fn ($user, $request) => $user?->name);

    Snag::extendContextUsing(fn (array $context, $request) => $context + [
        'tenant' => tenant()?->slug,
    ]);
}
```

Context goes to the coding agent as-is: keep personal data out of it. Keep it small too: the relay rejects a request whose context is over 4,000 characters of JSON, including what Snag adds on its own.

### Where the script comes from

The overlay script ships inside this package. Without any setup it is served from `/_snag/snag.js` (change the prefix with `route_prefix`). To serve it as a static file instead:

```sh
php artisan vendor:publish --tag=snag-assets
```

The script is then loaded from `public/vendor/snag/snag.js`. Laravel's default `composer.json` re-publishes `laravel-assets` on every `composer update`, which includes this file, so it stays current. To load it from a CDN, set `SNAG_ASSET_URL`.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No tab at all | `SNAG_ENDPOINT` and `SNAG_PROJECT_KEY` are set, `APP_ENV` is in `enabled_environments`, and you ran `php artisan config:clear` after changing `.env` |
| No tab, and the browser console shows a 403 from the relay | Your site's origin is missing from the project's allowed origins |
| No tab on a Filament panel | The panel id is listed in `panels`, or `panels` is `'*'` |
| No tab on a non-Filament page | `@snag` is in the layout |
| Old version of the tab after upgrading | Run `php artisan vendor:publish --tag=snag-assets --force`, or remove `public/vendor/snag` to use the package route |

---

## Security note

Screenshots capture real screen content. Only enable Snag where the data is safe to share with your coding agent, such as staging with seeded data. See [SECURITY.md](https://github.com/OWooody/Snag/blob/main/SECURITY.md).

---

## Contributing

This package lives in the [Snag monorepo](https://github.com/OWooody/Snag) under `packages/laravel`; the `snag-laravel` repository is a read-only mirror. The bundled script (`resources/js/snag.js`) is built from `packages/react`:

```sh
npm run build:laravel
```

Commit the updated `resources/js/snag.js` with your change. CI fails when it is stale.

To release, tag the monorepo `laravel-vX.Y.Z`. The split workflow pushes the tag `vX.Y.Z` to the mirror, and Packagist picks it up.
