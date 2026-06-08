<?php

namespace App\Support;

/**
 * Единая точка доступа к стабильным настройкам сервиса (config/service-infra.php).
 *
 * Используется как fallback-источник SMTP и единственный источник для Google OAuth,
 * AI gateway, monitor inbox, frontend URL.
 */
class ServiceInfra
{
    /** @return array<string,mixed> */
    public static function smtpDefaults(): array
    {
        return (array) config('service-infra.smtp_defaults', []);
    }

    /** @return array<string,mixed> */
    public static function google(): array
    {
        return (array) config('service-infra.google_oauth', []);
    }

    /** @return array<string,mixed> */
    public static function ai(): array
    {
        return (array) config('service-infra.ai_gateway', []);
    }

    public static function frontendUrl(): string
    {
        return rtrim((string) config('service-infra.frontend.url', ''), '/');
    }

    public static function monitorInbox(): ?string
    {
        $inbox = trim((string) config('service-infra.mail_monitor.inbox', ''));
        return $inbox !== '' ? $inbox : null;
    }

    public static function shouldBccCritical(): bool
    {
        return (bool) config('service-infra.mail_monitor.bcc_critical', false);
    }

    public static function heartbeatEnabled(): bool
    {
        return (bool) config('service-infra.mail_monitor.heartbeat_enabled', false);
    }

    public static function heartbeatTime(): string
    {
        return (string) config('service-infra.mail_monitor.heartbeat_time', '08:00');
    }

    public static function heartbeatTimezone(): string
    {
        return (string) config('service-infra.mail_monitor.heartbeat_timezone', 'UTC');
    }
}
