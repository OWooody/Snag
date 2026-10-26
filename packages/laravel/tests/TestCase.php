<?php

namespace SnagTech\Laravel\Tests;

use Orchestra\Testbench\TestCase as Orchestra;
use SnagTech\Laravel\Snag;
use SnagTech\Laravel\SnagServiceProvider;

abstract class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        $optional = array_filter([
            \Livewire\LivewireServiceProvider::class,
            \BladeUI\Icons\BladeIconsServiceProvider::class,
            \BladeUI\Heroicons\BladeHeroiconsServiceProvider::class,
            \RyanChandler\BladeCaptureDirective\BladeCaptureDirectiveServiceProvider::class,
            \Filament\Support\SupportServiceProvider::class,
            \Filament\Actions\ActionsServiceProvider::class,
            \Filament\Schemas\SchemasServiceProvider::class,
            \Filament\Forms\FormsServiceProvider::class,
            \Filament\Infolists\InfolistsServiceProvider::class,
            \Filament\Notifications\NotificationsServiceProvider::class,
            \Filament\Tables\TablesServiceProvider::class,
            \Filament\Widgets\WidgetsServiceProvider::class,
            \Filament\FilamentServiceProvider::class,
        ], 'class_exists');

        return [...array_values($optional), SnagServiceProvider::class];
    }

    protected function defineEnvironment($app): void
    {
        $app['env'] = 'local';
        $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('a', 32)));
        $app['config']->set('snag.endpoint', 'https://relay.example.com/functions/v1/relay');
        $app['config']->set('snag.project_key', 'snag_pk_test');
    }

    protected function tearDown(): void
    {
        Snag::flushState();

        parent::tearDown();
    }

    /**
     * @return array<string, mixed>
     */
    protected function configFrom(string $html): array
    {
        $this->assertSame(1, preg_match('#<script id="snag-config" type="application/json">(.*?)</script>#s', $html, $match));

        return json_decode($match[1], true, flags: JSON_THROW_ON_ERROR);
    }
}
