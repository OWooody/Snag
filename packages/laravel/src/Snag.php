<?php

namespace SnagTech\Laravel;

use Closure;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Http\Request;
use Illuminate\Support\HtmlString;
use Throwable;

class Snag
{
    public const ASSET_PATH = 'vendor/snag/snag.js';

    private const RENDERED_ATTRIBUTE = 'snag.rendered';

    /** @var (Closure(mixed, Request): ?string)|null */
    private static ?Closure $requesterResolver = null;

    /** @var list<Closure(array<string, mixed>, Request): array<string, mixed>> */
    private static array $contextExtenders = [];

    public function __construct(
        private readonly Application $app,
        private readonly ContextBuilder $context,
    ) {
    }

    /**
     * @param  Closure(mixed $user, Request $request): ?string  $resolver
     */
    public static function resolveRequesterUsing(?Closure $resolver): void
    {
        static::$requesterResolver = $resolver;
    }

    /**
     * @param  Closure(array<string, mixed> $context, Request $request): array<string, mixed>  $extender
     */
    public static function extendContextUsing(Closure $extender): void
    {
        static::$contextExtenders[] = $extender;
    }

    public static function flushState(): void
    {
        static::$requesterResolver = null;
        static::$contextExtenders = [];
    }

    public function enabled(): bool
    {
        $config = $this->app['config'];

        if (! filter_var($config->get('snag.enabled', true), FILTER_VALIDATE_BOOL)) {
            return false;
        }
        if (! $this->filled($config->get('snag.endpoint')) || ! $this->filled($config->get('snag.project_key'))) {
            return false;
        }

        $environments = (array) $config->get('snag.enabled_environments', ['local', 'staging']);

        return $environments !== [] && $this->app->environment($environments);
    }

    /**
     * Script tags for the current page, or an empty string when Snag is off.
     * Renders at most once per request, so a Filament hook and a manual
     * directive on the same page do not mount two overlays.
     */
    public function render(?Request $request = null): HtmlString
    {
        $request ??= $this->app['request'];

        if (! $this->enabled() || $request->attributes->get(self::RENDERED_ATTRIBUTE)) {
            return new HtmlString('');
        }
        $request->attributes->set(self::RENDERED_ATTRIBUTE, true);

        return new HtmlString($this->app['view']->make('snag::script', [
            'config' => static::encode($this->pageConfig($request)),
            'src' => $this->scriptUrl(),
        ])->render());
    }

    /**
     * @return array<string, mixed>
     */
    public function pageConfig(Request $request): array
    {
        $config = $this->app['config'];

        return array_filter([
            'endpoint' => (string) $config->get('snag.endpoint'),
            'projectKey' => (string) $config->get('snag.project_key'),
            'requester' => $this->requester($request),
            'context' => $this->context($request),
            'markers' => (bool) $config->get('snag.markers', true),
            'debug' => (bool) $config->get('snag.debug', false),
            'theme' => (array) $config->get('snag.theme', []) ?: null,
        ], static fn ($value) => $value !== null);
    }

    /**
     * @return array<string, mixed>
     */
    public function context(Request $request): array
    {
        $context = $this->context->build($request);

        $extender = $this->app['config']->get('snag.context');
        if (is_string($extender) && class_exists($extender)) {
            $context = $this->safely(fn () => $this->app->make($extender)($context, $request), $context);
        } elseif (is_callable($extender)) {
            $context = $this->safely(fn () => $extender($context, $request), $context);
        }

        foreach (static::$contextExtenders as $extend) {
            $context = $this->safely(fn () => $extend($context, $request), $context);
        }

        return $context;
    }

    public function requester(Request $request): ?string
    {
        $user = $this->safely(fn () => $request->user() ?? $this->app['auth']->user(), null);

        if (static::$requesterResolver) {
            $value = $this->safely(fn () => (static::$requesterResolver)($user, $request), null);
        } else {
            $attribute = $this->app['config']->get('snag.requester', 'email');
            $value = ($user && is_string($attribute) && $attribute !== '') ? data_get($user, $attribute) : null;
        }

        if (! is_scalar($value)) {
            return null;
        }
        $value = trim((string) $value);

        return ($value === '' || mb_strlen($value) > 128) ? null : $value;
    }

    public function scriptUrl(): string
    {
        $config = $this->app['config'];

        if ($this->filled($custom = $config->get('snag.asset_url'))) {
            return (string) $custom;
        }

        $published = $this->app->publicPath(self::ASSET_PATH);
        if (is_file($published)) {
            return asset(self::ASSET_PATH).'?v='.filemtime($published);
        }

        $bundle = static::bundlePath();

        return url(trim((string) $config->get('snag.route_prefix', '_snag'), '/').'/snag.js')
            .'?v='.(is_file($bundle) ? filemtime($bundle) : '0');
    }

    public static function bundlePath(): string
    {
        return dirname(__DIR__).'/resources/js/snag.js';
    }

    /**
     * JSON safe to place inside a <script> element.
     *
     * @param  array<string, mixed>  $value
     */
    public static function encode(array $value): string
    {
        return json_encode(
            $value,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
                | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR,
        ) ?: '{}';
    }

    private function filled(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }

    /**
     * @template T
     *
     * @param  Closure(): T  $callback
     * @param  T  $fallback
     * @return T
     */
    private function safely(Closure $callback, mixed $fallback): mixed
    {
        try {
            $result = $callback();
        } catch (Throwable $e) {
            report($e);

            return $fallback;
        }

        if (is_array($fallback) && ! is_array($result)) {
            return $fallback;
        }

        return $result;
    }
}
