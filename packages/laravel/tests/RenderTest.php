<?php

namespace SnagTech\Laravel\Tests;

use Illuminate\Foundation\Auth\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use SnagTech\Laravel\Snag;

class RenderTest extends TestCase
{
    public function test_directive_renders_config_root_and_script(): void
    {
        $html = Blade::render('@snag');

        $this->assertStringContainsString('<div id="snag-root" x-persist="snag" data-snag-root></div>', $html);
        $this->assertStringContainsString('data-navigate-once defer', $html);
        $this->assertStringContainsString('/_snag/snag.js?v=', $html);

        $config = $this->configFrom($html);
        $this->assertSame('https://relay.example.com/functions/v1/relay', $config['endpoint']);
        $this->assertSame('snag_pk_test', $config['projectKey']);
        $this->assertSame('laravel', $config['context']['framework']);
    }

    public function test_renders_nothing_outside_allowed_environments(): void
    {
        $this->app['env'] = 'production';

        $this->assertSame('', trim(Blade::render('@snag')));
    }

    public function test_renders_nothing_without_keys_or_when_disabled(): void
    {
        config(['snag.project_key' => '']);
        $this->assertSame('', trim(Blade::render('@snag')));

        config(['snag.project_key' => 'snag_pk_test', 'snag.enabled' => false]);
        $this->assertSame('', trim(Blade::render('@snag')));
    }

    public function test_renders_once_per_request(): void
    {
        $html = Blade::render('@snag @snag');

        $this->assertSame(1, substr_count($html, 'id="snag-config"'));
    }

    public function test_config_json_cannot_break_out_of_the_script_tag(): void
    {
        Snag::extendContextUsing(fn (array $context) => $context + ['note' => '</script><script>alert(1)</script> & "q" \'s\'']);

        $html = Blade::render('@snag');

        $this->assertSame(2, substr_count($html, '</script>'));
        $this->assertSame('</script><script>alert(1)</script> & "q" \'s\'', $this->configFrom($html)['context']['note']);
    }

    public function test_requester_defaults_to_the_user_email(): void
    {
        $user = new User();
        $user->forceFill(['id' => 1, 'email' => 'ops@example.com']);
        $this->actingAs($user);

        $this->assertSame('ops@example.com', $this->configFrom(Blade::render('@snag'))['requester']);
    }

    public function test_requester_resolver_and_null_attribute(): void
    {
        $user = new User();
        $user->forceFill(['id' => 1, 'email' => 'ops@example.com', 'name' => 'Ops']);
        $this->actingAs($user);

        config(['snag.requester' => null]);
        $this->assertArrayNotHasKey('requester', $this->configFrom(Blade::render('@snag')));

        $this->app['request']->attributes->remove('snag.rendered');
        Snag::resolveRequesterUsing(fn ($user) => $user?->name);
        $this->assertSame('Ops', $this->configFrom(Blade::render('@snag'))['requester']);
    }

    public function test_published_asset_and_custom_asset_url(): void
    {
        $snag = $this->app->make(Snag::class);

        config(['snag.asset_url' => 'https://cdn.example.com/snag.js']);
        $this->assertSame('https://cdn.example.com/snag.js', $snag->scriptUrl());

        config(['snag.asset_url' => null]);
        $published = public_path(Snag::ASSET_PATH);
        @mkdir(dirname($published), 0777, true);
        file_put_contents($published, '//');
        try {
            $this->assertStringContainsString('/vendor/snag/snag.js?v=', $snag->scriptUrl());
        } finally {
            @unlink($published);
        }
    }

    public function test_script_route_serves_the_bundle(): void
    {
        $response = $this->get('/_snag/snag.js?v=1');

        $response->assertOk();
        $this->assertStringContainsString('javascript', $response->headers->get('Content-Type'));
    }

    public function test_script_route_is_hidden_when_disabled(): void
    {
        $this->app['env'] = 'production';

        $this->get('/_snag/snag.js')->assertNotFound();
    }

    public function test_context_has_route_and_controller_action(): void
    {
        Route::get('/orders/{order}', [OrdersController::class, 'show'])->name('orders.show');

        $request = Request::create('/orders/5');
        $request->setRouteResolver(fn () => Route::getRoutes()->match($request));

        $context = $this->app->make(Snag::class)->context($request);

        $this->assertSame([
            'name' => 'orders.show',
            'uri' => '/orders/{order}',
            'methods' => 'GET',
            'action' => OrdersController::class.'@show',
        ], $context['route']);
        $this->assertArrayNotHasKey('livewire_page', $context);
    }

    public function test_context_extender_from_config(): void
    {
        config(['snag.context' => AddsTenantContext::class]);

        $context = $this->app->make(Snag::class)->context(Request::create('/'));

        $this->assertSame('acme', $context['tenant']);
        $this->assertSame('laravel', $context['framework']);
    }

    public function test_failing_extender_keeps_base_context(): void
    {
        Snag::extendContextUsing(fn () => throw new \RuntimeException('boom'));

        $context = $this->app->make(Snag::class)->context(Request::create('/'));

        $this->assertSame('laravel', $context['framework']);
    }
}

class OrdersController
{
    public function show(): string
    {
        return 'ok';
    }
}

class AddsTenantContext
{
    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function __invoke(array $context, Request $request): array
    {
        return $context + ['tenant' => 'acme'];
    }
}
