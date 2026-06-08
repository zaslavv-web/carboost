<?php

namespace App\Notifications;

use App\Support\RuntimeEnv;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Cache;

class ResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $email = strtolower((string) $notifiable->getEmailForPasswordReset());
        $url = $this->resetUrl($email);

        return (new MailMessage)
            ->subject('Восстановление пароля')
            ->greeting('Здравствуйте!')
            ->line('Вы запросили восстановление пароля для аккаунта «Пик Роста».')
            ->action('Задать новый пароль', $url)
            ->line('Ссылка действительна ограниченное время. Если вы не запрашивали восстановление, просто проигнорируйте это письмо.')
            ->withSymfonyMessage(function ($message) {
                // Маркер для AttachMonitoringBcc: критичное письмо, нужна копия на monitor inbox.
                $message->getHeaders()->addTextHeader('X-Critical', '1');
            });
    }

    private function resetUrl(string $email): string
    {
        $redirect = null;
        try {
            $redirect = Cache::get('pwd_reset_redirect:' . $email);
        } catch (\Throwable) {
            $redirect = null;
        }

        $frontend = rtrim(RuntimeEnv::url('FRONTEND_URL', RuntimeEnv::url('APP_FRONTEND_URL', config('app.url'))), '/');

        $base = rtrim((string) ($redirect ?: $frontend . '/reset-password'), '/');
        $separator = str_contains($base, '?') ? '&' : '?';

        return $base . $separator . http_build_query([
            'token' => $this->token,
            'email' => $email,
        ]);
    }
}