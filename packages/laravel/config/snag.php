<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Relay
    |--------------------------------------------------------------------------
    |
    | The Snag relay URL and the project's publishable key (snag_pk_...). Leave
    | either unset and nothing renders. The relay is still the final
    | visibility gate: a disabled project hides the tab with no deploy.
    |
    */

    'endpoint' => env('SNAG_ENDPOINT'),

    'project_key' => env('SNAG_PROJECT_KEY'),

    /*
    |--------------------------------------------------------------------------
    | Where Snag renders
    |--------------------------------------------------------------------------
    |
    | Snag captures screenshots of real screen content, so it only renders in
    | these environments. Never add "production".
    |
    | "panels" limits which Filament panels get the overlay: "*" for all, or a
    | list of panel ids such as ['admin'].
    |
    */

    'enabled' => env('SNAG_ENABLED', true),

    'enabled_environments' => ['local', 'staging'],

    'panels' => '*',

    /*
    |--------------------------------------------------------------------------
    | Requester
    |--------------------------------------------------------------------------
    |
    | Who filed the request, shown in the in-app request list. The name of an
    | attribute on the authenticated user (default "email"), null to send
    | nothing, or call Snag::resolveRequesterUsing(fn ($user, $request) => ...)
    | in a service provider for custom logic.
    |
    */

    'requester' => 'email',

    /*
    |--------------------------------------------------------------------------
    | Extra context
    |--------------------------------------------------------------------------
    |
    | Snag already sends the route, controller action and Filament panel,
    | resource and page. To add more, set an invokable class name here that
    | receives (array $context, Request $request) and returns an array, or call
    | Snag::extendContextUsing(...). Context goes verbatim to the coding agent:
    | keep personal data out of it.
    |
    */

    'context' => null,

    /*
    |--------------------------------------------------------------------------
    | Script
    |--------------------------------------------------------------------------
    |
    | By default the script is served from public/vendor/snag/snag.js when you
    | have published it (php artisan vendor:publish --tag=snag-assets), and
    | from a package route otherwise. Set asset_url to load it from elsewhere.
    |
    */

    'asset_url' => env('SNAG_ASSET_URL'),

    'route_prefix' => '_snag',

    /*
    |--------------------------------------------------------------------------
    | Overlay options
    |--------------------------------------------------------------------------
    */

    'markers' => true,

    'debug' => env('SNAG_DEBUG', false),

    // Overrides for the overlay theme, for example ['accent' => '#5B4CF5'].
    'theme' => [],

];
