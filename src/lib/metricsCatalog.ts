/**
 * Единый справочник метрик продукта.
 *
 * Каждая запись описывает:
 *  - label: человеко-понятное название (заменяет «Средний балл» и подобные).
 *  - short: короткая подпись под числом (единица + шкала).
 *  - formula: как считается.
 *  - interpretation: как читать (пороги «хорошо/плохо»).
 *  - action: что делать пользователю.
 *  - href: (опц.) куда вести кнопкой «Перейти».
 *
 * Все поля заданы через i18n-подобный объект { ru, en }, чтобы не заводить
 * отдельный неймспейс i18next. Получение — через `getMetric(key, lang)`.
 */

export type MetricLang = "ru" | "en";

export type MetricDef = {
  key: string;
  label: Record<MetricLang, string>;
  short: Record<MetricLang, string>;
  formula: Record<MetricLang, string>;
  interpretation: Record<MetricLang, string>;
  action: Record<MetricLang, string>;
  href?: string;
};

const M = <T extends Record<string, MetricDef>>(x: T) => x;

export const metricsCatalog = M({
  // ─────── Сотрудник ───────
  avg_competency_score: {
    key: "avg_competency_score",
    label: {
      ru: "Средний уровень компетенций",
      en: "Average competency level",
    },
    short: { ru: "0–5 по шкале компетенций", en: "0–5 competency scale" },
    formula: {
      ru: "Σ(оценки по всем компетенциям профиля) ÷ количество компетенций.",
      en: "Σ(scores across profile competencies) ÷ number of competencies.",
    },
    interpretation: {
      ru: "≥ 4.0 — сильный; 3.0–3.9 — норма; < 3.0 — зона роста.",
      en: "≥ 4.0 — strong; 3.0–3.9 — average; < 3.0 — growth zone.",
    },
    action: {
      ru: "Откройте цифровой паспорт и добавьте развивающие цели в IDP.",
      en: "Open your digital passport and add development goals to your IDP.",
    },
    href: "/digital-passport",
  },
  idp_completion: {
    key: "idp_completion",
    label: { ru: "Выполнение IDP", en: "IDP completion" },
    short: { ru: "% закрытых пунктов плана развития", en: "% of completed items" },
    formula: {
      ru: "Закрытых пунктов IDP ÷ всего пунктов × 100%.",
      en: "Completed IDP items ÷ total items × 100%.",
    },
    interpretation: {
      ru: "≥ 75% — план на цели; 40–74% — нужен ритм ревью; < 40% — риск срыва.",
      en: "≥ 75% on track; 40–74% needs review cadence; < 40% at risk.",
    },
    action: {
      ru: "Обновите статусы пунктов и назначьте ближайшее 1:1 с руководителем.",
      en: "Update item statuses and schedule the next 1:1 with your manager.",
    },
    href: "/idp",
  },
  track_progress: {
    key: "track_progress",
    label: { ru: "Прогресс по карьерному треку", en: "Career track progress" },
    short: { ru: "% пройденных этапов трека", en: "% of completed track steps" },
    formula: {
      ru: "Принятые этапы ÷ всего этапов в назначенном треке × 100%.",
      en: "Approved steps ÷ total steps in the assigned track × 100%.",
    },
    interpretation: {
      ru: "Отражает движение к целевой должности; сравнивается с плановым темпом.",
      en: "Reflects movement toward the target position vs. plan.",
    },
    action: {
      ru: "Откройте карьерный трек и сдайте следующий этап на согласование.",
      en: "Open your career track and submit the next step for approval.",
    },
    href: "/career",
  },
  gamification_points: {
    key: "gamification_points",
    label: { ru: "Очки лояльности", en: "Loyalty points" },
    short: { ru: "накоплено за активности", en: "earned through activities" },
    formula: {
      ru: "Сумма начислений за выполненные задачи, оценки и карьерные этапы.",
      en: "Sum of awards for tasks, assessments and career steps.",
    },
    interpretation: {
      ru: "Обмениваются на награды в разделе «Магазин».",
      en: "Redeemable for rewards in the Shop.",
    },
    action: {
      ru: "Загляните в «Магазин» и выберите награду.",
      en: "Visit the Shop to redeem a reward.",
    },
    href: "/rewards",
  },
  assessment_freshness: {
    key: "assessment_freshness",
    label: { ru: "Актуальность оценки", en: "Assessment freshness" },
    short: { ru: "дней с последней оценки", en: "days since last assessment" },
    formula: {
      ru: "Сегодня − дата последней завершённой AI-оценки, дней.",
      en: "Today − date of last completed AI assessment, in days.",
    },
    interpretation: {
      ru: "≤ 90 дн. — актуально; 91–180 — обновить; > 180 — данные устарели.",
      en: "≤ 90 d — fresh; 91–180 — refresh; > 180 — outdated.",
    },
    action: {
      ru: "Запустите AI-оценку, чтобы обновить профиль компетенций.",
      en: "Run an AI assessment to refresh your competency profile.",
    },
    href: "/ai-assessment",
  },

  // ─────── Руководитель ───────
  team_avg_score: {
    key: "team_avg_score",
    label: { ru: "Средний уровень команды", en: "Team average level" },
    short: { ru: "0–5 средний по подчинённым", en: "0–5 avg across reports" },
    formula: {
      ru: "Среднее «Среднего уровня компетенций» по подчинённым.",
      en: "Mean of reports' average competency levels.",
    },
    interpretation: {
      ru: "Сравните с бенчмарком отдела; падение — сигнал для 1:1.",
      en: "Compare to department benchmark; a drop warrants a 1:1.",
    },
    action: {
      ru: "Откройте карточки сотрудников с уровнем < 3 и назначьте IDP.",
      en: "Open reports below 3.0 and assign IDPs.",
    },
    href: "/team",
  },
  team_risk_share: {
    key: "team_risk_share",
    label: { ru: "Доля сотрудников в риске", en: "Share of at-risk reports" },
    short: { ru: "% команды с высоким риском", en: "% of team at high risk" },
    formula: {
      ru: "Кол-во подчинённых с risk_level = high ÷ всего подчинённых × 100%.",
      en: "Reports with risk_level = high ÷ total reports × 100%.",
    },
    interpretation: {
      ru: "≤ 10% — норма; 10–25% — внимание; > 25% — критично.",
      en: "≤ 10% normal; 10–25% caution; > 25% critical.",
    },
    action: {
      ru: "Отфильтруйте команду по «Высокий риск» и проведите 1:1.",
      en: "Filter team by high risk and schedule 1:1s.",
    },
    href: "/team",
  },
  team_engagement: {
    key: "team_engagement",
    label: { ru: "Вовлечённость команды", en: "Team engagement" },
    short: { ru: "индекс 0–100 по опросам пульса", en: "0–100 pulse index" },
    formula: {
      ru: "Средневзвешенный индекс по ответам последних Pulse-опросов команды.",
      en: "Weighted mean of the latest pulse survey answers.",
    },
    interpretation: {
      ru: "≥ 75 — здоровая команда; 50–74 — есть напряжение; < 50 — тревога.",
      en: "≥ 75 healthy; 50–74 tension; < 50 alarm.",
    },
    action: {
      ru: "Запустите точечный Pulse и обсудите слабые темы на ретро.",
      en: "Run a targeted pulse and discuss weak topics at a retro.",
    },
    href: "/pulse-surveys",
  },
  overdue_tasks: {
    key: "overdue_tasks",
    label: { ru: "Просроченные HR-задачи", en: "Overdue HR tasks" },
    short: { ru: "штук на команде", en: "tasks pending" },
    formula: {
      ru: "Кол-во hr_task в статусе open с due_date < сегодня.",
      en: "Count of open hr_task with due_date < today.",
    },
    interpretation: {
      ru: "> 0 — снижает управляемость. Каждая задача имеет владельца.",
      en: "> 0 — reduces control; every task has an owner.",
    },
    action: {
      ru: "Откройте вкладку задач и закройте/переназначьте просрочки.",
      en: "Open the tasks tab and close or reassign overdue items.",
    },
    href: "/tasks",
  },

  // ─────── HRD Analytics ───────
  risk_index: {
    key: "risk_index",
    label: { ru: "Индекс риска оттока", en: "Attrition risk index" },
    short: { ru: "0–100, взвешенный по компании", en: "0–100 company-weighted" },
    formula: {
      ru: "Взвешенная сумма факторов: стаж, вовлечённость, оценки, отсутствия, комфорт.",
      en: "Weighted sum of tenure, engagement, assessments, absences, comfort.",
    },
    interpretation: {
      ru: "< 30 — низкий; 30–60 — средний; > 60 — высокий риск.",
      en: "< 30 low; 30–60 medium; > 60 high.",
    },
    action: {
      ru: "Откройте риск-профиль и назначьте HR-действия для «красной» зоны.",
      en: "Open the risk profile and assign HR actions to the red zone.",
    },
    href: "/risk-analytics",
  },
  attrition_forecast: {
    key: "attrition_forecast",
    label: { ru: "Прогноз оттока (90 дн.)", en: "Attrition forecast (90 d)" },
    short: { ru: "% сотрудников с риском ухода", en: "% of employees likely to leave" },
    formula: {
      ru: "Доля сотрудников с risk_score ≥ 60 на горизонте 90 дней.",
      en: "Share of employees with risk_score ≥ 60 over 90 days.",
    },
    interpretation: {
      ru: "≤ 5% — норма для рынка; > 10% — превентивные действия.",
      en: "≤ 5% market norm; > 10% take preventive action.",
    },
    action: {
      ru: "Сформируйте retention-план для топ-риск-группы.",
      en: "Build a retention plan for the top-risk cohort.",
    },
    href: "/risk-analytics",
  },
  engagement_index: {
    key: "engagement_index",
    label: { ru: "Индекс вовлечённости", en: "Engagement index" },
    short: { ru: "0–100 по последним Pulse-опросам", en: "0–100 from recent pulse surveys" },
    formula: {
      ru: "Средневзвешенный балл всех активных Pulse-опросов за 30 дней.",
      en: "Weighted mean of all active pulse surveys in the last 30 days.",
    },
    interpretation: {
      ru: "≥ 75 — здоровая среда; 50–74 — точки напряжения; < 50 — критично.",
      en: "≥ 75 healthy; 50–74 tension points; < 50 critical.",
    },
    action: {
      ru: "Разверните разбивку по отделам и запустите точечные интервью.",
      en: "Drill into departments and run targeted interviews.",
    },
    href: "/pulse-surveys",
  },
  comfort_index: {
    key: "comfort_index",
    label: { ru: "Индекс комфорта", en: "Comfort index" },
    short: { ru: "0–10, самочувствие сотрудников", en: "0–10 wellbeing score" },
    formula: {
      ru: "Средняя оценка комфорта (условия, нагрузка, отношения) по чек-инам.",
      en: "Mean comfort score across check-ins (conditions, load, relations).",
    },
    interpretation: {
      ru: "≥ 7 — комфортно; 5–6.9 — напряжение; < 5 — выгорание.",
      en: "≥ 7 comfortable; 5–6.9 strain; < 5 burnout.",
    },
    action: {
      ru: "Изучите разбивку по факторам и запланируйте HR-действия.",
      en: "Review factor breakdown and plan HR actions.",
    },
    href: "/analytics/comfort/company",
  },
  headcount_delta: {
    key: "headcount_delta",
    label: { ru: "Динамика численности", en: "Headcount delta" },
    short: { ru: "прирост/отток за период, чел.", en: "net change over period" },
    formula: {
      ru: "Нанятые − уволенные за выбранный период.",
      en: "Hires − terminations over the selected period.",
    },
    interpretation: {
      ru: "Отрицательное значение — сокращение штата.",
      en: "Negative value means net downsizing.",
    },
    action: {
      ru: "Сверьте с планом найма и рисками оттока.",
      en: "Compare to hiring plan and attrition risk.",
    },
  },
  hiring_funnel_conversion: {
    key: "hiring_funnel_conversion",
    label: { ru: "Конверсия воронки найма", en: "Hiring funnel conversion" },
    short: { ru: "% от отклика до оффера", en: "% from application to offer" },
    formula: {
      ru: "Принятые офферы ÷ всего откликов × 100% за период.",
      en: "Accepted offers ÷ total applications × 100% for the period.",
    },
    interpretation: {
      ru: "Норма для рынка — 3–8%; ниже — узкое место в воронке.",
      en: "Market norm 3–8%; below indicates a funnel bottleneck.",
    },
    action: {
      ru: "Разверните этапы воронки и найдите этап с падением.",
      en: "Drill into stages and find where the drop happens.",
    },
  },
  absence_rate: {
    key: "absence_rate",
    label: { ru: "Доля отсутствий", en: "Absence rate" },
    short: { ru: "% рабочего времени вне работы", en: "% of work time absent" },
    formula: {
      ru: "Часы отсутствий (болезни, отпуска) ÷ норма часов × 100%.",
      en: "Absent hours (sick, leave) ÷ standard hours × 100%.",
    },
    interpretation: {
      ru: "3–5% — норма; > 7% — сигнал о выгорании или процессах.",
      en: "3–5% normal; > 7% signals burnout or process issues.",
    },
    action: {
      ru: "Разверните разбивку по отделам и проверьте комфорт.",
      en: "Drill into departments and check comfort scores.",
    },
  },
  time_to_hire: {
    key: "time_to_hire",
    label: { ru: "Срок закрытия вакансии", en: "Time to hire" },
    short: { ru: "дн. от заявки до оффера", en: "days from request to offer" },
    formula: {
      ru: "Медиана дней между открытием вакансии и принятым оффером.",
      en: "Median days from job opening to accepted offer.",
    },
    interpretation: {
      ru: "≤ 30 — быстро; 31–60 — норма; > 60 — узкое место.",
      en: "≤ 30 fast; 31–60 normal; > 60 bottleneck.",
    },
    action: {
      ru: "Найдите самый долгий этап воронки и ускорьте его.",
      en: "Find the slowest funnel stage and accelerate it.",
    },
  },
  promotion_rate: {
    key: "promotion_rate",
    label: { ru: "Доля повышений", en: "Promotion rate" },
    short: { ru: "% сотрудников с ростом уровня", en: "% of employees promoted" },
    formula: {
      ru: "Повышенные ÷ средняя численность за год × 100%.",
      en: "Promotions ÷ avg headcount for the year × 100%.",
    },
    interpretation: {
      ru: "8–15% — здоровый карьерный лифт.",
      en: "8–15% is a healthy career ladder.",
    },
    action: {
      ru: "Свяжите с карьерными треками и назначьте IDP.",
      en: "Link with career tracks and assign IDPs.",
    },
  },
  avg_tenure: {
    key: "avg_tenure",
    label: { ru: "Средний стаж", en: "Average tenure" },
    short: { ru: "лет работы в компании", en: "years at the company" },
    formula: {
      ru: "Σ(лет работы всех активных сотрудников) ÷ численность.",
      en: "Σ(years of service across active employees) ÷ headcount.",
    },
    interpretation: {
      ru: "< 1.5 — высокий отток; > 5 — стабильно, но проверьте карьерный рост.",
      en: "< 1.5 high attrition; > 5 stable but check growth paths.",
    },
    action: {
      ru: "Соотнесите с индексом риска и планом развития.",
      en: "Correlate with risk index and development plans.",
    },
  },

  // ─────── Карьерные треки ───────
  track_completion: {
    key: "track_completion",
    label: { ru: "Завершаемость треков", en: "Track completion" },
    short: { ru: "% треков, доведённых до конца", en: "% of tracks finished" },
    formula: {
      ru: "Треков со статусом completed ÷ всего назначенных × 100%.",
      en: "Tracks with status completed ÷ total assigned × 100%.",
    },
    interpretation: {
      ru: "≥ 60% — рабочие треки; < 30% — пересмотрите содержание.",
      en: "≥ 60% working tracks; < 30% revise content.",
    },
    action: {
      ru: "Откройте шаблоны треков и обновите этапы с низкой конверсией.",
      en: "Open track templates and refresh low-converting steps.",
    },
    href: "/career-strategies",
  },
  step_success_rate: {
    key: "step_success_rate",
    label: { ru: "Успех этапов", en: "Step success rate" },
    short: { ru: "% этапов, принятых с первого раза", en: "% approved on first try" },
    formula: {
      ru: "Одобренные этапы без повторных сабмишенов ÷ всего этапов × 100%.",
      en: "Steps approved without re-submission ÷ total × 100%.",
    },
    interpretation: {
      ru: "≥ 70% — понятные критерии; ниже — уточните описание этапа.",
      en: "≥ 70% clear criteria; below — clarify step description.",
    },
    action: {
      ru: "Проверьте формулировки критериев успеха этапа.",
      en: "Review the wording of step success criteria.",
    },
  },
  avg_time_per_step: {
    key: "avg_time_per_step",
    label: { ru: "Средний срок этапа", en: "Average step duration" },
    short: { ru: "дн. на прохождение этапа", en: "days per step" },
    formula: {
      ru: "Медиана дней между началом и одобрением этапа.",
      en: "Median days between step start and approval.",
    },
    interpretation: {
      ru: "Сравните с плановым сроком в шаблоне трека.",
      en: "Compare against the template's planned duration.",
    },
    action: {
      ru: "Найдите самые долгие этапы и упростите проверку.",
      en: "Identify the slowest steps and simplify review.",
    },
  },

  // ─────── Риск-профиль сотрудника ───────
  employee_attrition_risk: {
    key: "employee_attrition_risk",
    label: { ru: "Риск оттока", en: "Attrition risk" },
    short: { ru: "0–100 по сотруднику", en: "0–100 per employee" },
    formula: {
      ru: "Взвешенная сумма факторов: стаж, вовлечённость, комфорт, активность в карьерном треке, отсутствия.",
      en: "Weighted sum: tenure, engagement, comfort, career activity, absences.",
    },
    interpretation: {
      ru: "< 40 — низкий; 40–69 — средний; ≥ 70 — высокий риск ухода.",
      en: "< 40 low; 40–69 medium; ≥ 70 high risk of leaving.",
    },
    action: {
      ru: "Проведите 1:1, назначьте retention-действия и обновите IDP.",
      en: "Run a 1:1, assign retention actions, refresh the IDP.",
    },
    href: "/risk-analytics",
  },
  burnout_risk: {
    key: "burnout_risk",
    label: { ru: "Риск выгорания", en: "Burnout risk" },
    short: { ru: "0–100 по сотруднику", en: "0–100 per employee" },
    formula: {
      ru: "Взвешенная сумма: переработки, просроченные задачи, падение вовлечённости, низкий комфорт, отсутствие отпусков.",
      en: "Weighted sum: overtime, overdue tasks, engagement drop, low comfort, no vacations.",
    },
    interpretation: {
      ru: "< 40 — норма; 40–69 — напряжение; ≥ 70 — высокий риск выгорания.",
      en: "< 40 normal; 40–69 strain; ≥ 70 high burnout risk.",
    },
    action: {
      ru: "Снимите нагрузку, назначьте отпуск, проведите wellbeing-чек-ин.",
      en: "Reduce load, schedule leave, run a wellbeing check-in.",
    },
    href: "/analytics/comfort/company",
  },
  employee_engagement: {
    key: "employee_engagement",
    label: { ru: "Вовлечённость сотрудника", en: "Employee engagement" },
    short: { ru: "% по Pulse и активности", en: "% from pulse and activity" },
    formula: {
      ru: "100 − (риск оттока + риск выгорания) ÷ 2, скорректировано на ответы Pulse-опросов.",
      en: "100 − (attrition + burnout) ÷ 2, adjusted with pulse survey responses.",
    },
    interpretation: {
      ru: "≥ 70% — здоровая вовлечённость; 50–69% — напряжение; < 50% — тревога.",
      en: "≥ 70% healthy; 50–69% tension; < 50% alarm.",
    },
    action: {
      ru: "Пригласите в точечный Pulse и обсудите слабые темы на 1:1.",
      en: "Invite to a targeted pulse and discuss weak topics at a 1:1.",
    },
    href: "/pulse-surveys",
  },
  employee_risk_level: {
    key: "employee_risk_level",
    label: { ru: "Уровень риска", en: "Risk level" },
    short: { ru: "low / medium / high", en: "low / medium / high" },
    formula: {
      ru: "max(риск оттока, риск выгорания): ≥ 70 → high, ≥ 40 → medium, иначе low.",
      en: "max(attrition, burnout): ≥ 70 → high, ≥ 40 → medium, else low.",
    },
    interpretation: {
      ru: "High — требует HR-действий немедленно; medium — на мониторинге; low — стабильно.",
      en: "High — needs immediate HR action; medium — monitor; low — stable.",
    },
    action: {
      ru: "Кликните по уровню, чтобы отфильтровать таблицу и назначить действия.",
      en: "Click a level to filter the table and assign actions.",
    },
    href: "/risk-analytics",
  },
});

export type MetricKey = keyof typeof metricsCatalog;

export const getMetric = (key: MetricKey): MetricDef => metricsCatalog[key];
