<?php

namespace App\Services\AI\Drivers;

use App\Services\AI\AiDisabledException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Заглушка: AI выключен админом продукта в данной компании.
 * Любой вызов кидает AiDisabledException (HTTP 423 Locked) с настраиваемым сообщением.
 * Счётчик обращений и уведомление админа реализованы в AiGatewayService.
 */
class DisabledDriver implements LlmDriverInterface
{
    public function __construct(protected string $message = 'AI отключён администратором продукта') {}

    public function name(): string { return 'disabled'; }

    public function chat(array $messages, array $options = []): array
    {
        throw new AiDisabledException($this->message);
    }

    public function stream(array $messages, array $options = []): StreamedResponse
    {
        throw new AiDisabledException($this->message);
    }
}
