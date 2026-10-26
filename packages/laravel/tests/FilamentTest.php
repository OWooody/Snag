<?php

namespace SnagTech\Laravel\Tests;

use Illuminate\Support\Facades\Route;
use SnagTech\Laravel\Filament\RegistersRenderHook;
use SnagTech\Laravel\Snag;

class FilamentTest extends TestCase
{
    public function test_panel_filter(): void
    {
        $config = $this->app['config'];

        $config->set('snag.panels', '*');
        $this->assertTrue(RegistersRenderHook::panelAllowed($config, 'admin'));
        $this->assertTrue(RegistersRenderHook::panelAllowed($config, null));

        $config->set('snag.panels', ['admin']);
        $this->assertTrue(RegistersRenderHook::panelAllowed($config, 'admin'));
        $this->assertFalse(RegistersRenderHook::panelAllowed($config, 'vendor'));
        $this->assertFalse(RegistersRenderHook::panelAllowed($config, null));

        $config->set('snag.panels', []);
        $this->assertFalse(RegistersRenderHook::panelAllowed($config, 'admin'));
    }

    public function test_without_filament_the_hook_is_skipped(): void
    {
        if (RegistersRenderHook::available()) {
            $this->markTestSkipped('Filament is installed.');
        }

        RegistersRenderHook::register($this->app);

        $this->assertArrayNotHasKey('filament', $this->app->make(Snag::class)->context($this->app['request']));
    }

    public function test_render_hook_outputs_the_overlay(): void
    {
        if (! RegistersRenderHook::available()) {
            $this->markTestSkipped('Filament is not installed.');
        }

        $html = (string) \Filament\Support\Facades\FilamentView::renderHook(RegistersRenderHook::hookName());

        $this->assertStringContainsString('id="snag-config"', $html);
    }

    public function test_render_hook_respects_the_panel_filter(): void
    {
        if (! RegistersRenderHook::available()) {
            $this->markTestSkipped('Filament is not installed.');
        }

        config(['snag.panels' => ['some-other-panel']]);

        $html = (string) \Filament\Support\Facades\FilamentView::renderHook(RegistersRenderHook::hookName());

        $this->assertStringNotContainsString('id="snag-config"', $html);
    }

    public function test_context_names_the_filament_page_and_resource(): void
    {
        if (! RegistersRenderHook::available()) {
            $this->markTestSkipped('Filament is not installed.');
        }

        Route::get('/admin/users/{record}/edit', Fixtures\EditUser::class)->name('filament.admin.resources.users.edit');

        $request = \Illuminate\Http\Request::create('/admin/users/1/edit');
        $request->setRouteResolver(fn () => Route::getRoutes()->match($request));

        $context = $this->app->make(Snag::class)->context($request);

        $this->assertSame(Fixtures\EditUser::class, $context['filament']['page']);
        $this->assertSame(Fixtures\UserResource::class, $context['filament']['resource']);
        $this->assertSame(Fixtures\EditUser::class, $context['livewire_page']);
    }
}
