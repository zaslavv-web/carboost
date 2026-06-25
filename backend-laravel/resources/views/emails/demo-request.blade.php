<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>Новая заявка на демо</title></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
    <h2 style="margin:0 0 16px;">Новая заявка на демо</h2>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><b>Имя:</b></td><td>{{ $demoRequest->name }}</td></tr>
        <tr><td><b>Email:</b></td><td><a href="mailto:{{ $demoRequest->email }}">{{ $demoRequest->email }}</a></td></tr>
        @if($demoRequest->company)
            <tr><td><b>Компания:</b></td><td>{{ $demoRequest->company }}</td></tr>
        @endif
        @if($demoRequest->headcount)
            <tr><td><b>Численность:</b></td><td>{{ $demoRequest->headcount }}</td></tr>
        @endif
        <tr><td><b>Источник:</b></td><td>{{ $demoRequest->source }}</td></tr>
        <tr><td><b>ID:</b></td><td>{{ $demoRequest->id }}</td></tr>
        <tr><td><b>Создана:</b></td><td>{{ optional($demoRequest->created_at)->format('Y-m-d H:i') }}</td></tr>
    </table>
    <p style="color:#64748b;font-size:12px;margin-top:24px;">Это автоматическое уведомление с лендинга.</p>
</body>
</html>
