<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Iteration 10: Collaboration module (stage 5 of Jira/Trello replacement).
 *
 *  - tracker_comments    : комментарии к задачам с @упоминаниями
 *  - tracker_attachments : файловые вложения (хранятся в бакете tracker-attachments)
 *
 * Активность переиспользует существующий tracker_audit_log.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('tracker_comments')) {
            Schema::create('tracker_comments', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('task_id');
                $t->uuid('author_id');
                $t->text('body');                  // raw markdown
                $t->jsonb('mentions')->nullable(); // [{user_id, name}]
                $t->timestampTz('edited_at', 6)->nullable();
                $t->timestamps(6);
                $t->index('company_id');
                $t->index(['task_id', 'created_at']);
            });
        }

        if (!Schema::hasTable('tracker_attachments')) {
            Schema::create('tracker_attachments', function (Blueprint $t) {
                $t->uuid('id')->primary();
                $t->uuid('company_id');
                $t->uuid('task_id');
                $t->uuid('comment_id')->nullable();
                $t->uuid('uploader_id');
                $t->string('filename', 255);
                $t->string('mime', 160)->nullable();
                $t->bigInteger('size_bytes')->nullable();
                $t->string('storage_path', 1024);  // путь в бакете tracker-attachments
                $t->timestamps(6);
                $t->index('company_id');
                $t->index(['task_id', 'created_at']);
                $t->index('comment_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tracker_attachments');
        Schema::dropIfExists('tracker_comments');
    }
};
