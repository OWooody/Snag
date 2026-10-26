<?php

namespace SnagTech\Laravel;

use Composer\InstalledVersions;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Throwable;

/**
 * Where the requester is in the codebase: route, controller action, and the
 * Filament panel, resource and page. Never reads request input or user data.
 */
class ContextBuilder
{
    /**
     * @return array<string, mixed>
     */
    public function build(Request $request): array
    {
        $route = $request->route();
        $route = $route instanceof Route ? $route : null;

        return array_filter([
            'framework' => 'laravel',
            'laravel_version' => app()->version(),
            'livewire_version' => $this->packageVersion('livewire/livewire'),
            'route' => $route ? $this->route($route) : null,
            'livewire_page' => $route ? $this->livewirePage($route) : null,
            'filament' => $this->filament($route),
        ], static fn ($value) => $value !== null && $value !== []);
    }

    /**
     * @return array<string, string>
     */
    private function route(Route $route): array
    {
        $action = $route->getActionName();

        return array_filter([
            'name' => $route->getName(),
            'uri' => '/'.ltrim($route->uri(), '/'),
            'methods' => implode('|', array_diff($route->methods(), ['HEAD'])),
            'action' => $action === 'Closure' ? 'closure' : $action,
        ], static fn ($value) => is_string($value) && $value !== '');
    }

    /** Class of a full-page Livewire component served by this route. */
    private function livewirePage(Route $route): ?string
    {
        $class = $this->actionClass($route);

        if ($class && class_exists(\Livewire\Component::class) && is_subclass_of($class, \Livewire\Component::class)) {
            return $class;
        }

        return null;
    }

    /**
     * @return array<string, string>|null
     */
    private function filament(?Route $route): ?array
    {
        if (! class_exists(\Filament\Facades\Filament::class)) {
            return null;
        }

        try {
            $panel = \Filament\Facades\Filament::getCurrentPanel();
        } catch (Throwable) {
            $panel = null;
        }

        $page = $route ? $this->actionClass($route) : null;
        if ($page && ! (class_exists(\Filament\Pages\BasePage::class) && is_subclass_of($page, \Filament\Pages\BasePage::class))
            && ! (class_exists(\Filament\Pages\Page::class) && is_subclass_of($page, \Filament\Pages\Page::class))) {
            $page = null;
        }

        $resource = null;
        if ($page && method_exists($page, 'getResource')) {
            try {
                $resource = $page::getResource();
            } catch (Throwable) {
                $resource = null;
            }
        }

        if (! $panel && ! $page) {
            return null;
        }

        return array_filter([
            'version' => $this->packageVersion('filament/filament'),
            'panel' => $panel?->getId(),
            'resource' => is_string($resource) ? $resource : null,
            'page' => $page,
        ], static fn ($value) => is_string($value) && $value !== '');
    }

    /** @return class-string|null */
    private function actionClass(Route $route): ?string
    {
        $uses = $route->getAction('uses');
        if (! is_string($uses)) {
            return null;
        }

        $class = ltrim(explode('@', $uses)[0], '\\');

        return class_exists($class) ? $class : null;
    }

    private function packageVersion(string $package): ?string
    {
        if (! class_exists(InstalledVersions::class)) {
            return null;
        }

        try {
            return InstalledVersions::isInstalled($package)
                ? InstalledVersions::getPrettyVersion($package)
                : null;
        } catch (Throwable) {
            return null;
        }
    }
}
