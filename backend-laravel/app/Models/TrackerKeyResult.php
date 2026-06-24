<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class TrackerKeyResult extends Model
{
    use HasUuids;

    protected $table = 'tracker_key_results';
    protected $fillable = [
        'goal_id', 'title', 'unit', 'weight',
        'start_value', 'current_value', 'target_value', 'position',
    ];
    protected $casts = [
        'weight' => 'float',
        'start_value' => 'float',
        'current_value' => 'float',
        'target_value' => 'float',
        'position' => 'integer',
    ];

    protected static function booted(): void
    {
        $recalc = function (self $kr) {
            $kr->loadMissing('goal');
            $goal = TrackerGoal::query()->withoutGlobalScopes()->find($kr->goal_id);
            if (! $goal) return;
            $krs = self::query()->where('goal_id', $goal->id)->get();
            $weightSum = $krs->sum('weight') ?: 1;
            $progress = 0.0;
            foreach ($krs as $row) {
                $denom = $row->target_value - $row->start_value;
                $pct = $denom == 0 ? 0 : (($row->current_value - $row->start_value) / $denom) * 100;
                $pct = max(0, min(100, $pct));
                $progress += $pct * $row->weight;
            }
            $goal->progress = round($progress / $weightSum, 2);
            $goal->saveQuietly();
        };
        static::saved($recalc);
        static::deleted($recalc);
    }

    public function goal()
    {
        return $this->belongsTo(TrackerGoal::class, 'goal_id');
    }
}
