<?php

namespace SnagTech\Laravel\Http;

use Illuminate\Http\Request;
use SnagTech\Laravel\Snag;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Serves the bundled overlay script when it has not been published to public/. */
class ScriptController
{
    public function __invoke(Request $request, Snag $snag): BinaryFileResponse
    {
        abort_unless($snag->enabled() && is_file(Snag::bundlePath()), 404);

        $response = new BinaryFileResponse(Snag::bundlePath(), 200, [
            'Content-Type' => 'text/javascript; charset=utf-8',
        ]);

        if ($request->query('v') !== null) {
            $response->setPublic();
            $response->setMaxAge(31536000);
            $response->headers->addCacheControlDirective('immutable');
        }

        return $response;
    }
}
