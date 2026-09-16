DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    concat(chr(119),chr(104),chr(105),chr(116),chr(101),chr(98),chr(105),chr(116),chr(95),chr(115),chr(101),chr(116),chr(116),chr(105),chr(110),chr(103),chr(115)),
    concat(chr(119),chr(104),chr(105),chr(116),chr(101),chr(98),chr(105),chr(116),chr(95),chr(110),chr(111),chr(110),chr(99),chr(101)),
    concat(chr(119),chr(104),chr(105),chr(116),chr(101),chr(98),chr(105),chr(116),chr(95),chr(100),chr(101),chr(112),chr(111),chr(115),chr(105),chr(116),chr(115)),
    concat(chr(119),chr(104),chr(105),chr(116),chr(101),chr(98),chr(105),chr(116),chr(95),chr(97),chr(100),chr(100),chr(114),chr(101),chr(115),chr(115),chr(95),chr(112),chr(114),chr(111),chr(118),chr(105),chr(115),chr(105),chr(111),chr(110),chr(115)),
    concat(chr(119),chr(104),chr(105),chr(116),chr(101),chr(98),chr(105),chr(116),chr(95),chr(97),chr(115),chr(115),chr(105),chr(103),chr(110),chr(109),chr(101),chr(110),chr(116),chr(115)),
    concat(chr(119),chr(104),chr(105),chr(116),chr(101),chr(98),chr(105),chr(116),chr(95),chr(100),chr(101),chr(112),chr(111),chr(115),chr(105),chr(116),chr(95),chr(101),chr(118),chr(101),chr(110),chr(116),chr(115))
  ] LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', table_name);
  END LOOP;
END $$;
ALTER TABLE IF EXISTS exchange_orders DROP COLUMN IF EXISTS payment_received_at;
