<?php

namespace Tests\Unit;

use App\Http\Controllers\Api\RpcController;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class RpcControllerLocalizeTest extends TestCase
{
    private function localize(string $raw): string
    {
        $m = new ReflectionMethod(RpcController::class, 'localize');
        $m->setAccessible(true);
        return $m->invoke(null, $raw);
    }

    public function test_rls_violation_is_localized(): void
    {
        $this->assertSame(
            'Недостаточно прав для этой операции',
            $this->localize('ERROR: new row violates row-level security policy for table'),
        );
    }

    public function test_duplicate_key_is_localized(): void
    {
        $this->assertSame(
            'Запись с такими данными уже существует',
            $this->localize('SQLSTATE[23505] duplicate key value violates unique constraint'),
        );
    }

    public function test_foreign_key_is_localized(): void
    {
        $this->assertSame(
            'Связанная запись не найдена',
            $this->localize('insert or update on table violates foreign key constraint "fk"'),
        );
    }

    public function test_raise_exception_message_is_extracted(): void
    {
        $raw = 'SQLSTATE[P0001]: raise_exception: 7 ERROR:  Не найден пользователь  CONTEXT: PL/pgSQL function';
        $this->assertSame('Не найден пользователь', $this->localize($raw));
    }

    public function test_generic_fallback(): void
    {
        $this->assertSame('Ошибка выполнения операции', $this->localize('boom'));
    }
}
