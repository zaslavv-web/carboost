<?php

/**
 * Filesystem disks (Phase 11).
 *
 * 7 буфферных дисков один в один с legacy-бакетами фронтенда. По умолчанию —
 * локальный диск (`storage/app/public/<bucket>` для публичных,
 * `storage/app/private/<bucket>` для приватных). На проде переключается на S3
 * единственным флагом `STORAGE_DRIVER=s3` + AWS_* переменными.
 */

$diskFor = function (string $bucket, bool $public): array {
    if (env('STORAGE_DRIVER') === 's3') {
        return [
            'driver' => 's3',
            'key'    => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET_PREFIX', '') . $bucket,
            'visibility' => $public ? 'public' : 'private',
            'throw'  => true,
        ];
    }

    return [
        'driver' => 'local',
        'root'   => storage_path('app/' . ($public ? 'public/' : 'private/') . $bucket),
        'url'    => $public ? env('APP_URL') . '/storage/' . $bucket : null,
        'visibility' => $public ? 'public' : 'private',
        'throw'  => false,
    ];
};

return [

    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        'local'  => ['driver' => 'local', 'root' => storage_path('app'), 'throw' => false],
        'public' => [
            'driver' => 'local', 'root' => storage_path('app/public'),
            'url' => env('APP_URL') . '/storage', 'visibility' => 'public', 'throw' => false,
        ],

        // Public buckets (CDN-friendly)
        'avatars'       => $diskFor('avatars',       true),
        'reward-images' => $diskFor('reward-images', true),
        'shop-products' => $diskFor('shop-products', true),

        // Private buckets (served via signed URLs)
        'hr-documents'            => $diskFor('hr-documents',            false),
        'hrd-tests'               => $diskFor('hrd-tests',               false),
        'employee-questionnaires' => $diskFor('employee-questionnaires', false),
        'career-submissions'      => $diskFor('career-submissions',      false),
    ],

    'links' => [public_path('storage') => storage_path('app/public')],
];
