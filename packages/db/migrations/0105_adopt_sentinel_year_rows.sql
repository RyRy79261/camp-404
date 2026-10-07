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
--   * Tables whose rows point at each other move as one GROUP: a refund and
--     its payment, a gear order and its dues charge, an answer and its send, a
--     prep step and its menu item, a lounge slot and its offer, a seat and its
--     car. A group's sentinel rows move only when the founding year holds no
--     row in ANY of its tables. If it holds some, a captain may have entered
--     the same things again after founding (moving the old ones in would show
--     them twice), and moving only part of a group would split a row from the
--     row it belongs to. Either way, the whole group stays where it is.
--   * No key can collide: nothing of the group is in the founding year.
--   * Re-running it changes nothing: a moved row is no longer on the sentinel.
DO $$
DECLARE
  founding integer;
  grp text;
  tables text[];
  t text;
  taken boolean;
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

  -- One string per group, its tables comma-separated, in update order.
  FOREACH grp IN ARRAY ARRAY[
    -- The money: dues settings and accounts, charges (a settle-up's, a gear
    -- order's), payments and their refunds, the gear catalogue and orders.
    'dues_years,fee_tiers,dues_accounts,dues_settle_ups,dues_charges,dues_instalments,payments,payment_refunds,rental_items,rental_orders',
    -- Questionnaire sends and the answers given to them.
    'questionnaire_activations,questionnaire_responses',
    -- Transport: driver_profiles first, its car seats follow by ON UPDATE
    -- CASCADE; lift requests and trailers name the year's drivers.
    'driver_profiles,car_members,lift_requests,transport_trailers',
    -- Logistics phases, who helps on them, and the AfrikaBurn dates.
    'logistics_phases,logistics_attendance,afrikaburn_deadlines',
    -- Shift types (their slots and sign-ups hang off them) and members'
    -- AfrikaBurn volunteer shifts.
    'shift_types,volunteer_shifts',
    -- Inventory needs (their pledges ride along), bookings and loans.
    'inventory_needs,inventory_bookings,inventory_loans',
    -- Power: grid nodes and the loads on them, the plan and the rest.
    'power_plans,power_sharing_agreements,power_grid_nodes,power_loads,power_work_plan_tasks,fuel_cans,generator_readiness_items',
    -- The lounge programme: settings, offers and the slots built from them.
    'lounge_settings,lounge_offers,lounge_slots',
    -- Teams: memberships and budgets.
    'team_memberships,team_budgets',
    'adoptees',
    'camp_participations',
    'camp_tickets',
    'join_site_content',
    'meeting_notes',
    'recipe_lessons',
    'reimbursements'
  ] LOOP
    tables := string_to_array(grp, ',');
    taken := false;
    FOREACH t IN ARRAY tables LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE cycle = $1)', t)
        INTO taken USING founding;
      EXIT WHEN taken;
    END LOOP;
    CONTINUE WHEN taken;
    FOREACH t IN ARRAY tables LOOP
      EXECUTE format('UPDATE %I SET cycle = $1 WHERE cycle = 1', t)
        USING founding;
    END LOOP;
  END LOOP;

  -- The Kitchen, as one group: the meal plan and its days, the menu and the
  -- prep steps on it, snacks, and the shopping list's prices and ticks. The
  -- days point at the plan's year with no ON UPDATE CASCADE, so the plan is
  -- copied, the days follow, and the sentinel plan goes.
  IF EXISTS (SELECT 1 FROM kitchen_meal_plans WHERE cycle = 1)
     OR EXISTS (SELECT 1 FROM kitchen_menu_items WHERE cycle = 1)
     OR EXISTS (SELECT 1 FROM kitchen_prep_steps WHERE cycle = 1)
     OR EXISTS (SELECT 1 FROM kitchen_snacks WHERE cycle = 1)
     OR EXISTS (SELECT 1 FROM kitchen_shopping_prices WHERE cycle = 1)
     OR EXISTS (SELECT 1 FROM kitchen_shopping_ticks WHERE cycle = 1)
  THEN
    IF NOT EXISTS (SELECT 1 FROM kitchen_meal_plans WHERE cycle = founding)
       AND NOT EXISTS (SELECT 1 FROM kitchen_meal_plan_days WHERE cycle = founding)
       AND NOT EXISTS (SELECT 1 FROM kitchen_menu_items WHERE cycle = founding)
       AND NOT EXISTS (SELECT 1 FROM kitchen_prep_steps WHERE cycle = founding)
       AND NOT EXISTS (SELECT 1 FROM kitchen_snacks WHERE cycle = founding)
       AND NOT EXISTS (SELECT 1 FROM kitchen_shopping_prices WHERE cycle = founding)
       AND NOT EXISTS (SELECT 1 FROM kitchen_shopping_ticks WHERE cycle = founding)
    THEN
      INSERT INTO kitchen_meal_plans (cycle, version, updated_by_user_id, updated_at)
      SELECT founding, version, updated_by_user_id, updated_at
      FROM kitchen_meal_plans WHERE cycle = 1;
      UPDATE kitchen_meal_plan_days SET cycle = founding WHERE cycle = 1;
      DELETE FROM kitchen_meal_plans WHERE cycle = 1;
      UPDATE kitchen_menu_items SET cycle = founding WHERE cycle = 1;
      UPDATE kitchen_prep_steps SET cycle = founding WHERE cycle = 1;
      UPDATE kitchen_snacks SET cycle = founding WHERE cycle = 1;
      UPDATE kitchen_shopping_prices SET cycle = founding WHERE cycle = 1;
      UPDATE kitchen_shopping_ticks SET cycle = founding WHERE cycle = 1;
    END IF;
  END IF;

  -- The camp layout and its versions, the same way. Its share link is unique,
  -- so the copy takes it only once the sentinel layout is gone.
  IF EXISTS (SELECT 1 FROM camp_layouts WHERE cycle = 1)
     AND NOT EXISTS (SELECT 1 FROM camp_layouts WHERE cycle = founding)
     AND NOT EXISTS (SELECT 1 FROM camp_layout_versions WHERE cycle = founding)
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
