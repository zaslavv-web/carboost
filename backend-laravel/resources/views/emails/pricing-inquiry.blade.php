<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>Новый запрос по тарифу</title></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
    <h2 style="margin:0 0 16px;">Новый запрос по тарифу</h2>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><b>Тариф:</b></td><td>{{ $inquiry->plan }}</td></tr>
        <tr><td><b>Имя:</b></td><td>{{ $inquiry->name }}</td></tr>
        <tr><td><b>Email:</b></td><td><a href="mailto:{{ $inquiry->email }}">{{ $inquiry->email }}</a></td></tr>
        @if($inquiry->phone)
            <tr><td><b>Телефон:</b></td><td>{{ $inquiry->phone }}</td></tr>
        @endif
        @if($inquiry->company)
            <tr><td><b>Компания:</b></td><td>{{ $inquiry->company }}</td></tr>
        @endif
        @if($inquiry->headcount)
            <tr><td><b>Численность:</b></td><td>{{ $inquiry->headcount }}</td></tr>
        @endif
        <tr><td><b>Источник:</b></td><td>{{ $inquiry->source }}</td></tr>
        <tr><td><b>ID:</b></td><td>{{ $inquiry->id }}</td></tr>
        <tr><td><b>Создана:</b></td><td>{{ optional($inquiry->created_at)->format('Y-m-d H:i') }}</td></tr>
    </table>
    @if($inquiry->message)
        <h3 style="margin-top:24px;">Сообщение</h3>
        <div style="white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px;">{{ $inquiry->message }}</div>
    @endif
    <p style="color:#64748b;font-size:12px;margin-top:24px;">Это автоматическое уведомление со страницы тарифов.</p>
</body>
</html>
