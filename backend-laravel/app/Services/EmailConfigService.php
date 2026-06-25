<?php

namespace App\Services;

use App\Models\EmailSetting;
use App\Support\RuntimeEnv;
use App\Support\ServiceInfra;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
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

    public static function normalizeHost(?string $host, ?string $provider = null): string
    {
        $host = strtolower(trim((string) $host));
        if (strtolower(trim((string) $provider)) === 'yandex' && $host === '') {
            return 'smtp.yandex.ru';
        }
        return $host === 'smtp.yandex.com' ? 'smtp.yandex.ru' : $host;
    }

    public static function isYandexConfig(?string $host, ?string $provider = null): bool
    {
        return strtolower(trim((string) $provider)) === 'yandex' || self::normalizeHost($host) === 'smtp.yandex.ru';
    }

    public static function normalizePort(?string $host, int|string|null $port, ?string $provider = null): int
    {
        if (self::isYandexConfig($host, $provider)) {
            return 465;
        }

        return (int) ($port ?: 587);
    }

    public static function normalizeEncryption(?string $host, int|string|null $port, ?string $encryption): ?string
    {
        $host = self::normalizeHost($host);
        $port = self::normalizePort($host, $port);
        $encryption = strtolower(trim((string) $encryption));
        $encryption = $encryption === 'none' || $encryption === '' ? null : $encryption;

        if ($host === 'smtp.yandex.ru') {
            return 'ssl';
        }

        return $encryption;
    }

    public static function normalizeUsername(?string $host, ?string $username, ?string $fromAddress = null): ?string
    {
        $host = self::normalizeHost($host);
        $username = trim((string) $username);
        $fromAddress = strtolower(trim((string) $fromAddress));

        if ($host === 'smtp.yandex.ru' && $username === '' && filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
            return $fromAddress;
        }

        return $username !== '' ? $username : null;
    }

    public static function normalizePassword(?string $host, ?string $password, ?string $provider = null): ?string
    {
        if ($password === null) {
            return null;
        }

        $password = trim($password);

        // Пароли приложений Яндекса часто копируют с пробелами/невидимыми разделителями.
        // SMTP AUTH воспринимает их как часть секрета и возвращает 535.
        if (self::isYandexConfig($host, $provider)) {
            $password = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{FEFF}]+/u', '', $password) ?? $password;
        }

        return $password !== '' ? $password : null;
    }

    public static function isSmtpAuthFailure(
        \Throwable $e
    ): bool {
        return (bool) preg_match('/authentication|auth|login|password|535|534|invalid user or password/i', $e->getMessage());
    }

    public static function shouldFallbackToRuntimeEnv(\Throwable $e): bool
    {
        $message = $e->getMessage();

        return self::isSmtpAuthFailure($e)
            || (bool) preg_match('/неполные|расшифровывается|пароль больше не расшифровывается|Сохраните SMTP-пароль/i', $message)
            || (bool) preg_match('/unsupported cipher|incorrect key length|decrypt/i', $message)
            || $e instanceof \Illuminate\Contracts\Encryption\DecryptException;
    }

    public function hasActiveStoredSettings(): bool
    {
        $setting = $this->active();

        return (bool) ($setting && $setting->is_active && $setting->host && $setting->from_address && $setting->hasUsablePassword());
    }

    public function apply(?EmailSetting $setting = null): void
    {
        $explicit = $setting !== null;

        // НОВЫЙ приоритет: .env — единственный источник правды по умолчанию.
        // Запись в БД учитывается ТОЛЬКО если передана явно (явный вызов apply($setting) из админки/теста).
        if (!$explicit) {
            $envHost = self::normalizeHost(RuntimeEnv::get('MAIL_HOST'));
            $envFrom = RuntimeEnv::get('MAIL_FROM_ADDRESS');
            $envPass = RuntimeEnv::get('MAIL_PASSWORD') ?: RuntimeEnv::get('SMTP_PASSWORD');
            if ($envHost && $envFrom && $envPass) {
                $this->applyRuntimeEnv();
                return;
            }
            // Если в .env чего-то не хватает, пробуем файловые дефолты, потом активную запись БД.
            $defaults = ServiceInfra::smtpDefaults();
            if (!empty($defaults['host']) && !empty($defaults['from_address']) && !empty($defaults['password'])) {
                $this->applyFileDefaults();
                return;
            }
            $setting = $this->active();
            if (!$setting || !$setting->is_active) {
                $this->applyRuntimeEnv(); // last resort: пусть Laravel хотя бы попробует .env
                return;
            }
        }

        // Явный режим: применяем переданные настройки из БД.
        try {
            $hasUsable = $setting->hasUsablePassword();
        } catch (\Throwable $e) {
            if ($explicit) {
                throw new \RuntimeException('Активные SMTP-настройки неполные или пароль больше не расшифровывается. Сохраните SMTP-пароль заново. ' . $e->getMessage(), 0, $e);
            }
            Log::warning('EmailConfigService: stored SMTP password is undecryptable, falling back to .env', ['error' => $e->getMessage()]);
            $this->applyRuntimeEnv();
            return;
        }

        if (!$setting->host || !$setting->from_address || !$hasUsable) {
            if ($explicit) {
                throw new \RuntimeException('Активные SMTP-настройки неполные или пароль больше не расшифровывается. Сохраните SMTP-пароль заново.');
            }
            $this->applyRuntimeEnv();
            return;
        }

        $host = self::normalizeHost($setting->host, $setting->provider);
        $port = self::normalizePort($host, $setting->port, $setting->provider);
        $encryption = self::normalizeEncryption($host, $port, $setting->encryption);

        try {
            $smtpPassword = self::normalizePassword($host, $setting->password, $setting->provider);
        } catch (\Throwable $e) {
            throw new \RuntimeException('Активные SMTP-настройки неполные или пароль больше не расшифровывается. Сохраните SMTP-пароль заново. ' . $e->getMessage(), 0, $e);
        }

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => self::normalizeUsername($host, $setting->username, $setting->from_address),
            'password' => $smtpPassword,
            'timeout' => null,
            'local_domain' => RuntimeEnv::get('MAIL_EHLO_DOMAIN'),
        ]);
        Config::set('mail.from', [
            'address' => $setting->from_address,
            'name' => $setting->from_name ?: config('app.name', 'Career Track'),
        ]);
        Config::set('mail.reply_to', $setting->reply_to_address ? [
            'address' => $setting->reply_to_address,
            'name' => $setting->from_name ?: config('app.name', 'Career Track'),
        ] : null);

        $this->forgetResolvedMailers();
    }


    /**
     * Применить дефолты из config/service-infra.php.
     * Если в файле нет пароля — упасть в legacy applyRuntimeEnv (.env).
     */
    public function applyFileDefaults(): void
    {
        $defaults = ServiceInfra::smtpDefaults();

        $host = self::normalizeHost($defaults['host'] ?? null, $defaults['provider'] ?? null);
        $from = (string) ($defaults['from_address'] ?? '');
        $password = $defaults['password'] ?? null;

        if (!$host || !$from || !$password) {
            $this->applyRuntimeEnv();
            return;
        }

        $port = self::normalizePort($host, $defaults['port'] ?? null, $defaults['provider'] ?? null);
        $encryption = self::normalizeEncryption($host, $port, $defaults['encryption'] ?? null);

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => self::normalizeUsername($host, $defaults['username'] ?? null, $from),
            'password' => self::normalizePassword($host, $password, $defaults['provider'] ?? null),
            'timeout' => null,
            'local_domain' => RuntimeEnv::get('MAIL_EHLO_DOMAIN'),
        ]);
        Config::set('mail.from', [
            'address' => $from,
            'name' => $defaults['from_name'] ?? config('app.name', 'Career Track'),
        ]);

        $this->forgetResolvedMailers();
    }

    public function applyRuntimeEnv(): void
    {
        $host = self::normalizeHost(RuntimeEnv::get('MAIL_HOST'));
        $from = RuntimeEnv::get('MAIL_FROM_ADDRESS');
        if (!$host || !$from) {
            Config::set('mail.default', 'log');
            Config::set('mail.mailers.smtp', [
                'transport' => 'smtp',
                'host' => $host ?: '',
                'port' => 0,
                'encryption' => null,
                'username' => null,
                'password' => null,
                'timeout' => null,
                'local_domain' => RuntimeEnv::get('MAIL_EHLO_DOMAIN'),
            ]);
            Config::set('mail.from', [
                'address' => $from ?: 'noreply@example.local',
                'name' => RuntimeEnv::get('MAIL_FROM_NAME', config('app.name', 'Career Track')),
            ]);
            $this->forgetResolvedMailers();
            return;
        }

        $port = self::normalizePort($host, RuntimeEnv::get('MAIL_PORT', '587'));
        $encryption = self::normalizeEncryption($host, $port, RuntimeEnv::get('MAIL_ENCRYPTION'));

        Config::set('mail.default', RuntimeEnv::get('MAIL_MAILER', 'smtp'));
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $host,
            'port' => $port,
            'encryption' => $encryption,
            'username' => self::normalizeUsername($host, RuntimeEnv::get('MAIL_USERNAME'), $from),
            'password' => self::normalizePassword($host, RuntimeEnv::get('MAIL_PASSWORD')),
            'timeout' => null,
            'local_domain' => RuntimeEnv::get('MAIL_EHLO_DOMAIN'),
        ]);
        Config::set('mail.from', [
            'address' => $from,
            'name' => RuntimeEnv::get('MAIL_FROM_NAME', config('app.name', 'Career Track')),
        ]);

        $this->forgetResolvedMailers();
    }

    public function autoRepairActiveSettings(): ?EmailSetting
    {
        $setting = $this->active();
        if (!$setting) {
            return null;
        }

        $host = self::normalizeHost($setting->host, $setting->provider);
        $port = self::normalizePort($host, $setting->port, $setting->provider);
        $encryption = self::normalizeEncryption($host, $port, $setting->encryption);
        $username = self::normalizeUsername($host, $setting->username, $setting->from_address) ?: '';
        $password = self::normalizePassword($host, $setting->password, $setting->provider);

        $dirty = $setting->host !== $host
            || (int) $setting->port !== $port
            || ($setting->encryption ?: null) !== $encryption
            || $setting->username !== $username;

        if ($dirty) {
            $setting->forceFill([
                'host' => $host,
                'port' => $port,
                'encryption' => $encryption,
                'username' => $username,
                'last_test_error' => null,
            ]);
        }

        if ($password !== null && $password !== $setting->password) {
            $setting->password = $password;
            $dirty = true;
        }

        if ($dirty) {
            $setting->save();
        }

        return $setting->fresh();
    }

    public function sendTest(EmailSetting $setting, string $to): void
    {
        $this->apply($setting);

        try {
            $this->dispatchTestMail($to);
            return;
        } catch (\Throwable $e) {
            if (!self::isSmtpAuthFailure($e)) {
                throw $e;
            }

            // Один раз пробуем синхронизировать пароль активной Яндекс-записи
            // с file fallback (config/service-infra.php → SMTP_PASSWORD) и повторить отправку.
            $synced = $this->syncActiveYandexPasswordFromFile($setting);
            if (!$synced) {
                throw $e;
            }

            $this->apply($synced);
            $this->dispatchTestMail($to);
        }
    }

    private function dispatchTestMail(string $to): void
    {
        Mail::raw(
            "Тестовое письмо Career Track отправлено успешно.\n\nЭта конфигурация будет применяться к системным письмам: восстановление пароля, приглашения и уведомления.",
            function ($message) use ($to) {
                $message->to($to)->subject('Тест SMTP Career Track');
            }
        );
    }

    /**
     * Если активная запись — Яндекс и в config/service-infra.php лежит пароль,
     * отличный от текущего сохранённого, — обновить пароль в БД и вернуть свежую запись.
     * Иначе вернуть null (не вмешиваться в ручные настройки суперадмина).
     */
    public function syncActiveYandexPasswordFromFile(EmailSetting $setting): ?EmailSetting
    {
        if (!self::isYandexConfig($setting->host, $setting->provider)) {
            return null;
        }

        $defaults = ServiceInfra::smtpDefaults();
        if (!self::isYandexConfig($defaults['host'] ?? null, $defaults['provider'] ?? null)) {
            return null;
        }

        $filePassword = self::normalizePassword(
            $defaults['host'] ?? null,
            $defaults['password'] ?? null,
            $defaults['provider'] ?? null
        );
        if (!$filePassword) {
            return null;
        }

        try {
            $currentPassword = $setting->password;
        } catch (\Throwable $e) {
            $currentPassword = null;
        }

        if ($currentPassword === $filePassword) {
            return null;
        }

        $setting->password = $filePassword;
        $setting->forceFill(['last_test_error' => null])->save();

        Log::info('EmailConfigService: synced active Yandex SMTP password from service-infra file fallback', [
            'setting_id' => $setting->id ?? null,
        ]);

        return $setting->fresh();
    }


    private function forgetResolvedMailers(): void
    {
        try {
            $manager = app('mail.manager');
            if ($manager instanceof MailManager) {
                $manager->forgetMailers();
            }
        } catch (\Throwable $e) {
            // ignore
        }
    }

    /**
     * Безопасное описание текущей SMTP-конфигурации — без пароля.
     *
     * @return array{host:string,port:int,encryption:?string,username:?string}
     */
    public function currentSmtpSummary(): array
    {
        $cfg = config('mail.mailers.smtp', []);

        return [
            'host' => (string) ($cfg['host'] ?? ''),
            'port' => (int) ($cfg['port'] ?? 0),
            'encryption' => $cfg['encryption'] ?? null,
            'username' => $cfg['username'] ?? null,
        ];
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
            return $this->currentSmtpSummary() + [
                'ok' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
