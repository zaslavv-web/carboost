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
        return new Content(
            view: 'emails.pricing-inquiry',
            with: ['inquiry' => $this->inquiry],
        );
    }
}
