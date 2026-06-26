<?php

namespace App\Mail\Transport;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\MessageConverter;

/**
 * Symfony Mailer transport для Unisender Go HTTP API.
 *
 * Endpoint: https://go1.unisender.ru/ru/transactional/api/v1/email/send.json
 * Auth:     заголовок X-API-KEY
 * Docs:     https://godocs.unisender.ru/web-api-ref
 */
class UnisenderGoTransport extends AbstractTransport
{
    public function __construct(
        protected string $apiKey,
        protected string $endpoint = 'https://go2.unisender.ru/ru/transactional/api/v1/email/send.json',
        protected int $timeoutSeconds = 15,
    ) {
        parent::__construct();
    }

    public function __toString(): string
    {
        return 'unisender_go+' . $this->endpoint;
    }

    protected function doSend(SentMessage $message): void
    {
        /** @var Email $email */
        $email = MessageConverter::toEmail($message->getOriginalMessage());

        $from = $email->getFrom()[0] ?? null;
        if (!$from) {
            throw new \RuntimeException('Unisender Go: не указан адрес отправителя (MAIL_FROM_ADDRESS).');
        }

        $recipients = array_map(
            fn ($addr) => ['email' => $addr->getAddress(), 'substitutions' => (object) []],
            $message->getEnvelope()->getRecipients()
        );

        if (empty($recipients)) {
            throw new \RuntimeException('Unisender Go: пустой список получателей.');
        }

        $headers = [];
        foreach ($email->getReplyTo() as $addr) {
            $headers['Reply-To'] = $addr->getAddress();
            break;
        }

        $body = [
            'message' => array_filter([
                'recipients'   => $recipients,
                'from_email'   => $from->getAddress(),
                'from_name'    => $from->getName() ?: null,
                'subject'      => $email->getSubject() ?: '(без темы)',
                'body'         => array_filter([
                    'html'      => $email->getHtmlBody(),
                    'plaintext' => $email->getTextBody() ?: strip_tags((string) $email->getHtmlBody()),
                ]),
                'headers'      => $headers ?: null,
                'track_links'  => 0,
                'track_read'   => 0,
            ], static fn ($v) => $v !== null && $v !== ''),
        ];

        $response = Http::timeout($this->timeoutSeconds)
            ->withHeaders([
                'X-API-KEY'    => $this->apiKey,
                'Content-Type' => 'application/json',
            ])
            ->post($this->endpoint, $body);

        if ($response->failed() || $response->json('status') === 'error') {
            $code = $response->json('code') ?? $response->status();
            $msg  = $response->json('message') ?? $response->body();
            Log::error('Unisender Go send failed', [
                'http_status' => $response->status(),
                'api_code'    => $code,
                'message'     => $msg,
            ]);
            throw new \RuntimeException("Unisender Go API error [{$code}]: {$msg}");
        }

        $jobId = $response->json('job_id');
        if ($jobId) {
            $message->setMessageId((string) $jobId);
        }
    }
}
