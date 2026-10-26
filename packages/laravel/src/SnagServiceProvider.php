<?php

namespace SnagTech\Laravel;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use SnagTech\Laravel\Filament\RegistersRenderHook;
use SnagTech\Laravel\Http\ScriptController;

class SnagServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/snag.php', 'snag');

        $this->app->singleton(ContextBuilder::class);
        $this->app->singleton(Snag::class);
    }

    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__.'/../resources/views', 'snag');

        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__.'/../config/snag.php' => config_path('snag.php'),
            ], 'snag-config');

            $this->publishes([
                Snag::bundlePath() => public_path(Snag::ASSET_PATH),
            ], ['snag-assets', 'laravel-assets']);
        }

        Blade::directive('snag', static fn (): string => '<?php echo app(\\'.Snag::class.'::class)->render(); ?>');

        $this->registerScriptRoute();

        RegistersRenderHook::register($this->app);
    }

    private function registerScriptRoute(): void
    {
        if ($this->app->routesAreCached()) {
            return;
        }

        $prefix = trim((string) config('snag.route_prefix', '_snag'), '/');
        if ($prefix === '') {
            return;
        }

        Route::get($prefix.'/snag.js', ScriptController::class)->name('snag.script');
    }
}
