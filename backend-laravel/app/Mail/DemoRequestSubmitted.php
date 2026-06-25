<?php

namespace App\Mail;

use App\Models\DemoRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DemoRequestSubmitted extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public DemoRequest $demoRequest)
    {
    }

    public function envelope(): Envelope
    {
        $replyTo = [];
        if (! empty($this->demoRequest->email)) {
            $replyTo[] = new Address(
                $this->demoRequest->email,
                (string) ($this->demoRequest->name ?? '')
            );
        }

        return new Envelope(
            subject: 'Новая заявка на демо — ' . ($this->demoRequest->name ?: $this->demoRequest->email),
            replyTo: $replyTo,
        );
    }

    public function content(): Content
    {
        // Inline HTML, чтобы не зависеть от наличия blade-вью на сервере
        // (deploy-скрипт может не синкать resources/views/).
        $r = $this->demoRequest;
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $rows = [
            ['Имя', $e($r->name)],
            ['Email', '<a href="mailto:' . $e($r->email) . '">' . $e($r->email) . '</a>'],
        ];
        if (! empty($r->company))   $rows[] = ['Компания', $e($r->company)];
        if (! empty($r->headcount)) $rows[] = ['Численность', $e($r->headcount)];
        $rows[] = ['Источник', $e($r->source)];
        $rows[] = ['ID', $e($r->id)];
        $rows[] = ['Создана', $e(optional($r->created_at)->format('Y-m-d H:i'))];

        $tableRows = '';
        foreach ($rows as [$k, $v]) {
            $tableRows .= '<tr><td style="padding:6px;"><b>' . $k . ':</b></td><td style="padding:6px;">' . $v . '</td></tr>';
        }

        $html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Новая заявка на демо</title></head>'
            . '<body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">'
            . '<h2 style="margin:0 0 16px;">Новая заявка на демо</h2>'
            . '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' . $tableRows . '</table>'
            . '<p style="color:#64748b;font-size:12px;margin-top:24px;">Это автоматическое уведомление с лендинга.</p>'
            . '</body></html>';

        return new Content(htmlString: $html);
    }
}
