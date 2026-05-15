<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * Стандартные таблицы, не покрытые ранее в контексте, но используемые в RLS:
 *  - positions
 *  - team_members
 *  - notifications
 *  - support_tickets
 *  - position_career_paths
 *  - user_roles
 *
 * Их модели лежат в этом же неймспейсе (см. соседние файлы Position.php, ...).
 */
class _Index_DomainModels {} // marker
