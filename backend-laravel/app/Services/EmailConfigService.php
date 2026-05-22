<?php

namespace App\Services;

use App\Models\EmailSetting;
use App\Support\RuntimeEnv;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Illuminate\Mail\MailManager;

class EmailConfigService
{
    public const PRESETS = [
        'yandex' => [
            'label' => 'Yandex 360 / Яндекс Почта',
            'host' => 'smtp.yandex.ru',
            'port' => 465,
            'encryption' => 'ssl',
            'hint' => 'Используйте полный email как логин и пароль приложения из настроек Яндекс ID.',
        ],
        'gmail' => [
            'label' => 'Gmail / Google Workspace',
            'host' => 'smtp.gmail.com',
            'port' => 587,
            'encryption' => 'tls',
            'hint' => 'Включите двухэтапную проверку и используйте App Password, не обычный пароль аккаунта.',
        ],
        'mailru' => [
            'label' => 'Mail.ru / VK WorkMail',
            'host' => 'smtp.mail.ru',
            'port' => 465,
            'encryption' => 'ssl',
            'hint' => 'Используйте полный email как логин и пароль приложения.',
        ],
        'sendgrid' => [
            'label' => 'SendGrid SMTP',
            'host' => 'smtp.sendgrid.net',
            'port' => 587,
            'encryption' => 'tls',
            'hint' => 'Логин обычно apikey, пароль — SMTP/API key SendGrid.',
        ],
        'mailgun' => [
            'label' => 'Mailgun SMTP',
            'host' => 'smtp.mailgun.org',
            'port' => 587,
            'encryption' => 'tls',
            'hint' => 'Используйте SMTP credentials из домена Mailgun.',
        ],
        'resend' => [
            'label' => 'Resend SMTP',
            'host' => 'smtp.resend.com',
            'port' => 587,
            'encryption' => 'tls',
            'hint' => 'Логин обычно resend, пароль — API key Resend.',
        ],
        'custom' => [
            'label' => 'Другой SMTP',
            'host' => '',
            'port' => 587,
            'encryption' => 'tls',
            'hint' => 'Введите SMTP-параметры вашего почтового провайдера.',
        ],
    ];

    public function active(): ?EmailSetting
    {
        return EmailSetting::active()->latest('updated_at')->first();
    }

    public static function normalizeHost(?string $host): string
    {
        $host = strtolower(trim((string) $host));
        return $host === 'smtp.yandex.com' ? 'smtp.yandex.ru' : $host;
    }

    public static function normalizeEncryption(?string $host, int|string|null $port, ?string $encryption): ?string
    {
        $host = self::normalizeHost($host);
        $port = (int) ($port ?: 587);
        $encryption = strtolower(trim((string) $encryption));
        $encryption = $encryption === 'none' || $encryption === '' ? null : $encryption;

        if ($host === 'smtp.yandex.ru') {
            return $port === 465 ? 'ssl' : 'tls';
        }

        return $encryption;
    }

    public static function normalizeUsername(?string $host, ?string $username, ?string $fromAddress = null): ?string
    {
        $host = self::normalizeHost($host);
        $username = trim((string) $username);
        $fromAddress = strtolower(trim((string) $fromAddress));

        if ($host === 'smtp.yandex.ru' && str_ends_with($fromAddress, '@yandex.ru')) {
            return $fromAddress;
        }

        return $username !== '' ? $username : null;
    }

    public static function isSmtpAuthFailure(
        \Throwable $e
    ): bool {
        return (bool) preg_match('/authentication|auth|login|password|535|534|invalid user or password/i', $e->getMessage());
    }

    public function apply(?EmailSetting $setting = null): void
    {
        $setting ??= $this->active();

        // Если БД-настройки нет, неактивна, либо пароль не расшифровывается (APP_KEY сменился) —
        // используем SMTP из окружения, чтобы письма продолжали ходить.
        if (!$setting || !$setting->is_active || !$setting->host || !$setting->from_address || !$setting->hasUsablePassword()) {
            $this->applyRuntimeEnv();
            return;
        }

        $host = self::normalizeHost($setting->host);
        $port = (int) $setting->port;
        $encryption = self::normalizeEncryption($host, $port, $setting->encryption);

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => self::normalizeUsername($host, $setting->username, $setting->from_address),
            'password' => $setting->password,
            'timeout' => null,
            'local_domain' => env('MAIL_EHLO_DOMAIN'),
        ]);
        Config::set('mail.from', [
            'address' => $setting->from_address,
            'name' => $setting->from_name ?: config('app.name', 'Career Track'),
        ]);
        Config::set('mail.reply_to', $setting->reply_to_address ? [
            'address' => $setting->reply_to_address,
            'name' => $setting->from_name ?: config('app.name', 'Career Track'),
        ] : null);

        // Сбросить кеш уже инстанцированных мейлеров (важно после смены настроек в рантайме):
        // MailManager хранит резолвнутые драйверы в массиве и игнорирует обновления Config.
        try {
            $manager = app('mail.manager');
            if ($manager instanceof MailManager) {
                $manager->forgetMailers();
            }
        } catch (\Throwable $e) {
            // ignore
        }
    }

    public function applyRuntimeEnv(): void
    {
        $host = self::normalizeHost(RuntimeEnv::get('MAIL_HOST'));
        $from = RuntimeEnv::get('MAIL_FROM_ADDRESS');
        if (!$host || !$from) {
            return;
        }

        $port = (int) (RuntimeEnv::get('MAIL_PORT', '587') ?: 587);
        $encryption = self::normalizeEncryption($host, $port, RuntimeEnv::get('MAIL_ENCRYPTION'));

        Config::set('mail.default', RuntimeEnv::get('MAIL_MAILER', 'smtp'));
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => self::normalizeUsername($host, RuntimeEnv::get('MAIL_USERNAME'), $from),
            'password' => RuntimeEnv::get('MAIL_PASSWORD'),
            'timeout' => null,
            'local_domain' => RuntimeEnv::get('MAIL_EHLO_DOMAIN'),
        ]);
        Config::set('mail.from', [
            'address' => $from,
            'name' => RuntimeEnv::get('MAIL_FROM_NAME', config('app.name', 'Career Track')),
        ]);

        try {
            $manager = app('mail.manager');
            if ($manager instanceof MailManager) {
                $manager->forgetMailers();
            }
        } catch (\Throwable $e) {
            // ignore
        }
    }

    public function sendTest(EmailSetting $setting, string $to): void
    {
        $this->apply($setting);

        Mail::raw(
            "Тестовое письмо Career Track отправлено успешно.\n\nЭта конфигурация будет применяться к системным письмам: восстановление пароля, приглашения и уведомления.",
            function ($message) use ($to) {
                $message->to($to)->subject('Тест SMTP Career Track');
            }
        );
    }

    /**
     * Открывает реальное SMTP-соединение (TCP → EHLO → STARTTLS → AUTH) и сразу закрывает.
     * Бросает то же исключение Symfony Mailer, что и реальный send.
     *
     * @return array{host:string,port:int,encryption:?string,username:?string}
     */
    public function preflight(): array
    {
        $cfg = config('mail.mailers.smtp', []);
        $host = (string) ($cfg['host'] ?? '');
        $port = (int) ($cfg['port'] ?? 0);
        $encryption = $cfg['encryption'] ?? null;
        $username = $cfg['username'] ?? null;
        $password = $cfg['password'] ?? null;
        $ehlo = $cfg['local_domain'] ?? null;

        if ($host === '' || $port === 0) {
            throw new \RuntimeException('SMTP не сконфигурирован: пустой host или port.');
        }

        $tls = strtolower((string) $encryption) === 'ssl';

        $transport = new \Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport($host, $port, $tls);

        if ($username !== null && $username !== '') {
            $transport->setUsername($username);
        }
        if ($password !== null && $password !== '') {
            $transport->setPassword($password);
        }
        if ($ehlo) {
            $transport->setLocalDomain($ehlo);
        }

        try {
            $transport->start();
        } finally {
            try { $transport->stop(); } catch (\Throwable $e) { /* ignore */ }
        }

        return [
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => $username,
        ];
    }

    /**
     * Безопасная диагностическая обёртка: не бросает исключение.
     *
     * @return array{ok:bool,host?:string,port?:int,encryption?:?string,username?:?string,error?:string}
     */
    public function preflightSafe(): array
    {
        try {
            return ['ok' => true] + $this->preflight();
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
