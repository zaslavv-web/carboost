<?php

namespace App\Mail;

use App\Models\PricingInquiry;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PricingInquirySubmitted extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public PricingInquiry $inquiry)
    {
    }

    public function envelope(): Envelope
    {
        $replyTo = [];
        if (! empty($this->inquiry->email)) {
            $replyTo[] = new Address(
                $this->inquiry->email,
                (string) ($this->inquiry->name ?? '')
            );
        }

        return new Envelope(
            subject: 'Новый запрос по тарифу «' . $this->inquiry->plan . '» — ' . ($this->inquiry->name ?: $this->inquiry->email),
            replyTo: $replyTo,
        );
    }

    public function content(): Content
    {
        // Inline HTML, чтобы не зависеть от наличия blade-вью на сервере
        // (deploy-скрипт может не синкать resources/views/).
        $i = $this->inquiry;
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $rows = [
            ['Тариф', $e($i->plan)],
            ['Имя', $e($i->name)],
            ['Email', '<a href="mailto:' . $e($i->email) . '">' . $e($i->email) . '</a>'],
        ];
        if (! empty($i->phone))     $rows[] = ['Телефон', $e($i->phone)];
        if (! empty($i->company))   $rows[] = ['Компания', $e($i->company)];
        if (! empty($i->headcount)) $rows[] = ['Численность', $e($i->headcount)];
        $rows[] = ['Источник', $e($i->source)];
        $rows[] = ['ID', $e($i->id)];
        $rows[] = ['Создана', $e(optional($i->created_at)->format('Y-m-d H:i'))];

        $tableRows = '';
        foreach ($rows as [$k, $v]) {
            $tableRows .= '<tr><td style="padding:6px;"><b>' . $k . ':</b></td><td style="padding:6px;">' . $v . '</td></tr>';
        }

        $message = '';
        if (! empty($i->message)) {
            $message = '<h3 style="margin-top:24px;">Сообщение</h3>'
                . '<div style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;">'
                . $e($i->message) . '</div>';
        }

        $html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Новый запрос по тарифу</title></head>'
            . '<body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">'
            . '<h2 style="margin:0 0 16px;">Новый запрос по тарифу</h2>'
            . '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' . $tableRows . '</table>'
            . $message
            . '<p style="color:#64748b;font-size:12px;margin-top:24px;">Это автоматическое уведомление со страницы тарифов.</p>'
            . '</body></html>';

        return new Content(htmlString: $html);
    }
}
