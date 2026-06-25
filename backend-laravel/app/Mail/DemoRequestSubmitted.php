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
        return new Content(
            view: 'emails.demo-request',
            with: ['demoRequest' => $this->demoRequest],
        );
    }
}
