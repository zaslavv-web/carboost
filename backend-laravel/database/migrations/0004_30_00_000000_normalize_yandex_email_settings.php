<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('email_settings')) {
            return;
        }

        DB::table('email_settings')
            ->where('host', 'smtp.yandex.com')
            ->update(['host' => 'smtp.yandex.ru']);

        DB::table('email_settings')
            ->where('host', 'smtp.yandex.ru')
            ->where('port', 465)
            ->update(['encryption' => 'ssl']);
    }

    public function down(): void
    {
        // Нормализация безопасна и не требует отката.
    }
};