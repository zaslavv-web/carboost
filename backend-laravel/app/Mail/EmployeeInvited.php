<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class EmployeeInvited extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $recipientEmail,
        public string $inviteUrl,
        public ?string $recipientName = null,
        public ?string $companyName = null,
        public ?string $inviterName = null,
        public ?string $positionTitle = null,
        public ?string $department = null,
    ) {}

    /**
     * Классический build() используется намеренно вместо envelope()/content()
     * с именованными параметрами Content(htmlString:/textString:) — эти поля
     * появились только в поздних минорных релизах Laravel 10/11 и падают
     * с "Unknown named parameter $textString" на текущей версии проекта.
     */
    public function build(): self
    {
        $subject = $this->companyName
            ? 'Приглашение в «' . $this->companyName . '» — Пик Роста'
            : 'Приглашение в Пик Роста';

        return $this
            ->subject($subject)
            ->html($this->renderHtml());
    }

    private function renderHtml(): string
    {
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $greeting = $this->recipientName
            ? 'Здравствуйте, ' . $e($this->recipientName) . '!'
            : 'Здравствуйте!';

        $intro = 'Вас пригласили присоединиться к';
        if ($this->companyName) {
            $intro .= ' компании <b>' . $e($this->companyName) . '</b>';
        }
        $intro .= ' на HR-платформе <b>«Пик Роста»</b>';
        if ($this->inviterName) {
            $intro .= '. Приглашение отправил(а) ' . $e($this->inviterName);
        }
        $intro .= '.';

        $meta = '';
        if ($this->positionTitle || $this->department) {
            $meta = '<p style="margin:0 0 12px;color:#334155;">';
            if ($this->positionTitle) {
                $meta .= '<b>Должность:</b> ' . $e($this->positionTitle) . '<br>';
            }
            if ($this->department) {
                $meta .= '<b>Подразделение:</b> ' . $e($this->department);
            }
            $meta .= '</p>';
        }

        $safeUrl = $e($this->inviteUrl);

        return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Приглашение — Пик Роста</title></head>'
            . '<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">'
            . '<tr><td align="center">'
            . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">'
            . '<tr><td style="background:#1B1D22;padding:24px 32px;">'
            . '<div style="font-family:Georgia,serif;color:#D5A52A;font-size:22px;letter-spacing:0.5px;">Пик Роста</div>'
            . '<div style="color:#cbd5e1;font-size:13px;margin-top:4px;">HR-платформа для роста команд</div>'
            . '</td></tr>'
            . '<tr><td style="padding:28px 32px;">'
            . '<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">' . $greeting . '</h1>'
            . '<p style="margin:0 0 16px;line-height:1.55;">' . $intro . '</p>'
            . $meta
            . '<p style="margin:0 0 24px;line-height:1.55;">Чтобы завершить регистрацию и войти, нажмите на кнопку ниже:</p>'
            . '<p style="margin:0 0 24px;text-align:center;">'
            . '<a href="' . $safeUrl . '" style="display:inline-block;padding:12px 28px;background:#D5A52A;color:#1B1D22;font-weight:bold;text-decoration:none;border-radius:10px;">Принять приглашение</a>'
            . '</p>'
            . '<p style="margin:0 0 8px;font-size:13px;color:#64748b;">Если кнопка не работает, откройте ссылку в браузере:</p>'
            . '<p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="' . $safeUrl . '" style="color:#0369a1;">' . $safeUrl . '</a></p>'
            . '<p style="margin:0;font-size:12px;color:#94a3b8;">Если вы не ожидали это письмо — просто проигнорируйте его.</p>'
            . '</td></tr>'
            . '<tr><td style="background:#f1f5f9;padding:16px 32px;font-size:12px;color:#64748b;">'
            . '© Пик Роста'
            . '</td></tr>'
            . '</table>'
            . '</td></tr></table></body></html>';
    }
}
