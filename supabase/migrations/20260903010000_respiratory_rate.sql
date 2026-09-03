-- Overnight respiratory rate.
--
-- Recovery was reading sleep and HRV, and nothing else the body reports at night. Resting
-- heart rate was already being imported and simply never used; breathing rate was not
-- collected at all. Both move earlier than HRV when something is developing — an infection
-- raises them days before it is noticed — and for a population being asked every morning
-- whether to train, "earlier" is the whole value.
--
-- Apple records this from the watch during sleep, so a day's rows are a night's readings and
-- the daily mean is the honest summary. Stored like every other reading: one value per
-- metric per day, keyed on the local day so the same night cannot land twice.
alter type public.metric_type
add value if not exists 'respiratory_rate';
