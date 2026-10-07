-- Custom SQL migration file, put your code below! --
-- Rows stranded on the sentinel year (audit 2, data-1, 2026-10-07).
--
-- Every write stamps the camp's current year, which is the sentinel (1) until
-- a captain names the founding year; setFoundingYear then moves the sentinel
-- rows into that year. Until this release it skipped many year-scoped tables
-- (payments, dues, power, the lounge, meeting notes, the layout, kitchen
-- prices and prep, lessons), and several others were added to it only after
-- their tables existed. A row written to one of those tables before the camp
-- was founded stayed on the sentinel, where no page reads it. Production was
-- founded in 2026 and has since rolled to 2027; when it was founded is not in
-- the code, so this cannot be ruled out, and this sweep moves any such row
-- into the founding year, as setFoundingYear now does.
--
-- Safe by construction:
--   * A camp that has not named a year is left alone: setFoundingYear will
--     adopt its rows.
--   * A table's sentinel rows move only when the founding year holds none of
--     that table's rows. If it holds some, a captain may have entered the same
--     things again after founding, and moving the old rows in would show them
--     twice; they stay where they are. It also means no key can collide.
--   * A row that points at its year's parent row moves with it: car seats ride
--     their driver's profile (ON UPDATE CASCADE); a meal plan's days and a
--     layout's versions move with a copy of their parent.
--   * Re-running it changes nothing: a moved row is no longer on the sentinel.
DO $$
DECLARE
  founding integer;
  t text;
  token text;
BEGIN
  SELECT min((c->>'year')::int) INTO founding
  FROM camp_settings, jsonb_array_elements(
    CASE WHEN jsonb_typeof(config->'cycles') = 'array'
      THEN config->'cycles' ELSE '[]'::jsonb END
  ) AS c
  WHERE c->>'year' ~ '^[0-9]{4}$';
  IF founding IS NULL THEN
    RETURN;
  END IF;

  -- driver_profiles first: car_members follow it through ON UPDATE CASCADE.
  FOREACH t IN ARRAY ARRAY[
    'driver_profiles',
    'adoptees',
    'afrikaburn_deadlines',
    'camp_participations',
    'camp_tickets',
    'dues_accounts',
    'dues_charges',
    'dues_instalments',
    'dues_settle_ups',
    'dues_years',
    'fee_tiers',
    'fuel_cans',
    'generator_readiness_items',
    'inventory_bookings',
    'inventory_loans',
    'inventory_needs',
    'join_site_content',
    'kitchen_menu_items',
    'kitchen_prep_steps',
    'kitchen_shopping_prices',
    'kitchen_shopping_ticks',
    'kitchen_snacks',
    'lift_requests',
    'logistics_attendance',
    'logistics_phases',
    'lounge_offers',
    'lounge_settings',
    'lounge_slots',
    'meeting_notes',
    'payment_refunds',
    'payments',
    'power_grid_nodes',
    'power_loads',
    'power_plans',
    'power_sharing_agreements',
    'power_work_plan_tasks',
    'questionnaire_activations',
    'questionnaire_responses',
    'recipe_lessons',
    'reimbursements',
    'rental_items',
    'rental_orders',
    'shift_types',
    'team_budgets',
    'team_memberships',
    'transport_trailers',
    'volunteer_shifts'
  ] LOOP
    EXECUTE format(
      'UPDATE %1$I SET cycle = $1 WHERE cycle = 1
         AND NOT EXISTS (SELECT 1 FROM %1$I WHERE cycle = $1)',
      t
    ) USING founding;
  END LOOP;

  -- The meal plan: its days point at the plan's year with no ON UPDATE
  -- CASCADE, so the plan is copied, the days follow, the sentinel plan goes.
  IF EXISTS (SELECT 1 FROM kitchen_meal_plans WHERE cycle = 1)
     AND NOT EXISTS (SELECT 1 FROM kitchen_meal_plans WHERE cycle = founding)
     AND NOT EXISTS (SELECT 1 FROM kitchen_meal_plan_days WHERE cycle = founding)
  THEN
    INSERT INTO kitchen_meal_plans (cycle, version, updated_by_user_id, updated_at)
    SELECT founding, version, updated_by_user_id, updated_at
    FROM kitchen_meal_plans WHERE cycle = 1;
    UPDATE kitchen_meal_plan_days SET cycle = founding WHERE cycle = 1;
    DELETE FROM kitchen_meal_plans WHERE cycle = 1;
  END IF;

  -- The camp layout, the same way. Its share link is unique, so the copy
  -- takes it only once the sentinel layout is gone.
  IF EXISTS (SELECT 1 FROM camp_layouts WHERE cycle = 1)
     AND NOT EXISTS (SELECT 1 FROM camp_layouts WHERE cycle = founding)
  THEN
    SELECT share_token INTO token FROM camp_layouts WHERE cycle = 1;
    INSERT INTO camp_layouts
      (cycle, latest_version, share_token, shared_at, shared_by_user_id, updated_at)
    SELECT founding, latest_version, NULL, shared_at, shared_by_user_id, updated_at
    FROM camp_layouts WHERE cycle = 1;
    UPDATE camp_layout_versions SET cycle = founding WHERE cycle = 1;
    DELETE FROM camp_layouts WHERE cycle = 1;
    UPDATE camp_layouts SET share_token = token WHERE cycle = founding;
  END IF;

  -- A Survival Guide chapter reviewed before the camp had a year was
  -- reviewed for the founding year.
  UPDATE documents SET cycle_reviewed = founding WHERE cycle_reviewed = 1;
END $$;
