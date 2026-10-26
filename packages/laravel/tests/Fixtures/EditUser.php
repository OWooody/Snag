<?php

namespace SnagTech\Laravel\Tests\Fixtures;

if (class_exists(\Filament\Resources\Pages\EditRecord::class)) {
    class EditUser extends \Filament\Resources\Pages\EditRecord
    {
        protected static string $resource = UserResource::class;
    }
}
