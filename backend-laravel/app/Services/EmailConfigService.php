<?php

namespace App\Services;

use App\Models\EmailSetting;
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

    public function apply(?EmailSetting $setting = null): void
    {
        $setting ??= $this->active();

        if (!$setting || !$setting->is_active || !$setting->host || !$setting->from_address) {
            return;
        }

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp', [
            'transport' => 'smtp',
            'host' => $setting->host,
            'port' => (int) $setting->port,
            'encryption' => $setting->encryption ?: null,
            'username' => $setting->username ?: null,
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
}
