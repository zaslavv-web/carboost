<?php

namespace App\Services\AI;

/**
 * Бросается, когда провайдер AI настроен в режиме "disabled".
 * Контроллер должен возвращать HTTP 423 Locked + сообщение для пользователя.
 */
class AiDisabledException extends \RuntimeException
{
    public function __construct(string $message = 'AI отключён администратором')
    {
        parent::__construct($message, 423);
    }
}
