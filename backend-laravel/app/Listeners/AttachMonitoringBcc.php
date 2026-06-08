<?php

namespace App\Listeners;

use App\Support\ServiceInfra;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Mime\Address;

/**
 * Добавляет BCC мониторингового ящика ко всем письмам, помеченным заголовком X-Critical: 1.
 *
 * Маркер ставится в критичных нотификациях (восстановление пароля, приглашения и т.п.):
 *   ->withSymfonyMessage(fn($m) => $m->getHeaders()->addTextHeader('X-Critical','1'))
 */
class AttachMonitoringBcc
{
    public function handle(MessageSending $event): void
    {
        try {
            if (!ServiceInfra::shouldBccCritical()) {
                return;
            }

            $message = $event->message;
            $headers = $message->getHeaders();

            $critical = $headers->get('X-Critical');
            if (!$critical || (string) $critical->getBodyAsString() !== '1') {
                return;
            }

            $monitor = ServiceInfra::monitorInbox();
            if (!$monitor) {
                return;
            }

            // Не дублируем, если получатель == монитор-инбокс.
            $toAddresses = array_map(
                fn (Address $a) => strtolower($a->getAddress()),
                $message->getTo() ?? []
            );
            if (in_array(strtolower($monitor), $toAddresses, true)) {
                return;
            }

            $existingBcc = array_map(
                fn (Address $a) => strtolower($a->getAddress()),
                $message->getBcc() ?? []
            );
            if (in_array(strtolower($monitor), $existingBcc, true)) {
                return;
            }

            $message->addBcc(new Address($monitor));
        } catch (\Throwable $e) {
            // Никогда не валим отправку основного письма.
            Log::warning('AttachMonitoringBcc failed: ' . $e->getMessage());
        }
    }
}
