<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\WithDomainUsers;

/**
 * CurrencyController: баланс, правила начисления, перевод монет, история.
 */
class CurrencyControllerTest extends TestCase
{
    use RefreshDatabase, WithDomainUsers;

    private function setBalance(string $userId, string $companyId, int $balance): void
    {
        DB::table('currency_balances')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'company_id' => $companyId,
            'balance' => $balance,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function setSettings(string $companyId, array $attrs = []): void
    {
        DB::table('company_currency_settings')->insert(array_merge([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'currency_name' => 'Монеты',
            'currency_icon' => '🪙',
            'transfers_enabled' => true,
            'transfer_limit_per_day' => 1000,
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    public function test_balance_returns_amount_and_settings(): void
    {
        $company = $this->makeCompany();
        $user = $this->makeUser('employee', $company->id);
        $this->setBalance($user->id, $company->id, 250);
        $this->setSettings($company->id, ['currency_name' => 'Коины']);

        $this->actingAs($user, 'sanctum')->getJson('/api/currency/balance')
            ->assertOk()
            ->assertJsonPath('data.balance', 250)
            ->assertJsonPath('data.settings.currency_name', 'Коины')
            ->assertJsonPath('data.spent_today', 0);
    }

    public function test_earn_rules_lists_only_active_company_rules(): void
    {
        $company = $this->makeCompany();
        $user = $this->makeUser('employee', $company->id);

        DB::table('gamification_reward_types')->insert([
            'id' => (string) Str::uuid(), 'company_id' => $company->id,
            'title' => 'Активное правило', 'description' => null, 'category' => 'general',
            'icon' => '⭐', 'points' => 10, 'reward_kind' => 'currency', 'trigger_mode' => 'manual',
            'is_active' => true, 'created_by' => $user->getKey(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('gamification_reward_types')->insert([
            'id' => (string) Str::uuid(), 'company_id' => $company->id,
            'title' => 'Отключённое правило', 'description' => null, 'category' => 'general',
            'icon' => '⭐', 'points' => 5, 'reward_kind' => 'currency', 'trigger_mode' => 'manual',
            'is_active' => false, 'created_by' => $user->getKey(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/currency/earn-rules')->assertOk();
        $titles = collect($response->json('data'))->pluck('title')->all();
        $this->assertContains('Активное правило', $titles);
        $this->assertNotContains('Отключённое правило', $titles);
    }

    public function test_transfer_success_moves_coins_and_writes_two_transactions(): void
    {
        $company = $this->makeCompany();
        $sender = $this->makeUser('employee', $company->id);
        $recipient = $this->makeUser('employee', $company->id);
        $this->setBalance($sender->id, $company->id, 500);
        $this->setSettings($company->id);

        $this->actingAs($sender, 'sanctum')->postJson('/api/currency/transfer', [
            'recipient_id' => $recipient->id,
            'amount' => 100,
            'message' => 'Спасибо!',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('data.balance', 400);

        $this->assertSame(100, (int) DB::table('currency_balances')
            ->where('user_id', $recipient->id)->where('company_id', $company->id)->value('balance'));

        $this->assertSame(2, DB::table('currency_transactions')
            ->whereIn('user_id', [$sender->id, $recipient->id])->count());
        $this->assertSame(1, DB::table('currency_transactions')
            ->where('user_id', $sender->id)->where('kind', 'transfer_out')->where('amount', -100)->count());
        $this->assertSame(1, DB::table('currency_transactions')
            ->where('user_id', $recipient->id)->where('kind', 'transfer_in')->where('amount', 100)->count());
    }

    public function test_transfer_fails_with_insufficient_balance(): void
    {
        $company = $this->makeCompany();
        $sender = $this->makeUser('employee', $company->id);
        $recipient = $this->makeUser('employee', $company->id);
        $this->setBalance($sender->id, $company->id, 50);
        $this->setSettings($company->id);

        $this->actingAs($sender, 'sanctum')->postJson('/api/currency/transfer', [
            'recipient_id' => $recipient->id,
            'amount' => 100,
        ])->assertStatus(422)->assertJsonPath('ok', false);

        $this->assertSame(50, (int) DB::table('currency_balances')
            ->where('user_id', $sender->id)->value('balance'));
    }

    public function test_transfer_to_user_from_another_company_is_rejected(): void
    {
        $company = $this->makeCompany();
        $otherCompany = $this->makeCompany();
        $sender = $this->makeUser('employee', $company->id);
        $stranger = $this->makeUser('employee', $otherCompany->id);
        $this->setBalance($sender->id, $company->id, 500);
        $this->setSettings($company->id);

        $this->actingAs($sender, 'sanctum')->postJson('/api/currency/transfer', [
            'recipient_id' => $stranger->id,
            'amount' => 50,
        ])->assertStatus(422)->assertJsonPath('ok', false);
    }

    public function test_transfer_exceeding_daily_limit_is_rejected(): void
    {
        $company = $this->makeCompany();
        $sender = $this->makeUser('employee', $company->id);
        $recipient = $this->makeUser('employee', $company->id);
        $this->setBalance($sender->id, $company->id, 1000);
        $this->setSettings($company->id, ['transfer_limit_per_day' => 100]);

        // Уже потрачено 90 сегодня.
        DB::table('currency_transactions')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $sender->id, 'company_id' => $company->id,
            'amount' => -90, 'kind' => 'transfer_out', 'reference_id' => (string) Str::uuid(),
            'description' => 'ранее', 'created_by' => $sender->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($sender, 'sanctum')->postJson('/api/currency/transfer', [
            'recipient_id' => $recipient->id,
            'amount' => 20,
        ])->assertStatus(422)->assertJsonPath('ok', false);
    }

    public function test_transactions_history_returns_recent_rows_for_current_user(): void
    {
        $company = $this->makeCompany();
        $user = $this->makeUser('employee', $company->id);
        $other = $this->makeUser('employee', $company->id);

        foreach (range(1, 3) as $i) {
            DB::table('currency_transactions')->insert([
                'id' => (string) Str::uuid(), 'user_id' => $user->id, 'company_id' => $company->id,
                'amount' => 10 * $i, 'kind' => 'reward', 'description' => "Награда {$i}",
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        DB::table('currency_transactions')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $other->id, 'company_id' => $company->id,
            'amount' => 999, 'kind' => 'reward', 'description' => 'Чужая транзакция',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/currency/transactions')->assertOk();
        $rows = $response->json('data');
        $this->assertCount(3, $rows);
        $this->assertNotContains('Чужая транзакция', collect($rows)->pluck('description')->all());
    }
}
