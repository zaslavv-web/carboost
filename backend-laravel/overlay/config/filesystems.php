<?php

return [

    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [
        'local'  => ['driver' => 'local', 'root' => storage_path('app'), 'throw' => false],
        'public' => [
            'driver' => 'local', 'root' => storage_path('app/public'),
            'url' => env('APP_URL') . '/storage', 'visibility' => 'public', 'throw' => false,
        ],

        // Phase 11 buckets — public
        ...self::diskFor('avatars',       true),
        ...self::diskFor('reward-images', true),
        ...self::diskFor('shop-products', true),

        // Phase 11 buckets — private (signed URLs)
        ...self::diskFor('hr-documents',           false),
        ...self::diskFor('hrd-tests',              false),
        ...self::diskFor('employee-questionnaires', false),
        ...self::diskFor('career-submissions',     false),
    ],

    'links' => [public_path('storage') => storage_path('app/public')],
];

/**
 * Helper kept inline (PHP 8.2 doesn't allow `self::method()` in initializer
 * unless declared in a class) — see overlay/bootstrap to wire it via
 * `config(['filesystems' => require ...])` if needed. Default S3 driver is
 * picked when STORAGE_DRIVER=s3, otherwise local public/private folders.
 */
if (! function_exists('__lovable_filesystem_disk_for')) {
    function __lovable_filesystem_disk_for(string $bucket, bool $public): array {
        if (env('STORAGE_DRIVER') === 's3') {
            return [$bucket => [
                'driver' => 's3',
                'key'    => env('AWS_ACCESS_KEY_ID'),
                'secret' => env('AWS_SECRET_ACCESS_KEY'),
                'region' => env('AWS_DEFAULT_REGION'),
                'bucket' => env('AWS_BUCKET_PREFIX', '') . $bucket,
                'visibility' => $public ? 'public' : 'private',
                'throw'  => true,
            ]];
        }
        return [$bucket => [
            'driver' => 'local',
            'root'   => storage_path('app/' . ($public ? 'public/' : 'private/') . $bucket),
            'url'    => $public ? env('APP_URL') . '/storage/' . $bucket : null,
            'visibility' => $public ? 'public' : 'private',
            'throw'  => false,
        ]];
    }
}
