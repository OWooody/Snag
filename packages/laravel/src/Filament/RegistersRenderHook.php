<?php

namespace SnagTech\Laravel\Filament;

use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\HtmlString;
use SnagTech\Laravel\Snag;
use Throwable;

/**
 * Adds the overlay to the end of <body> on Filament panels. Works with
 * Filament 3 and 4, and does nothing when Filament is not installed.
 */
class RegistersRenderHook
{
    /** Hook name used by Filament 3.0 before PanelsRenderHook existed. */
    private const LEGACY_BODY_END = 'panels::body.end';

    public static function available(): bool
    {
        return class_exists(\Filament\Support\Facades\FilamentView::class)
            && class_exists(\Filament\Facades\Filament::class);
    }

    public static function hookName(): string
    {
        return class_exists(\Filament\View\PanelsRenderHook::class)
            ? \Filament\View\PanelsRenderHook::BODY_END
            : self::LEGACY_BODY_END;
    }

    public static function register(Application $app): void
    {
        if (! static::available()) {
            return;
        }

        \Filament\Support\Facades\FilamentView::registerRenderHook(
            static::hookName(),
            static function () use ($app): HtmlString {
                if (! static::panelAllowed($app['config'], static::currentPanelId())) {
                    return new HtmlString('');
                }

                return $app->make(Snag::class)->render();
            },
        );
    }

    /**
     * @param  string|null  $panelId  Null when the current panel is unknown.
     */
    public static function panelAllowed(Repository $config, ?string $panelId): bool
    {
        $panels = $config->get('snag.panels', '*');

        if ($panels === '*' || $panels === ['*'] || $panels === null) {
            return true;
        }
        if ($panels === false || $panels === [] || $panelId === null) {
            return false;
        }

        return in_array($panelId, (array) $panels, true);
    }

    private static function currentPanelId(): ?string
    {
        try {
            return \Filament\Facades\Filament::getCurrentPanel()?->getId();
        } catch (Throwable) {
            return null;
        }
    }
}
