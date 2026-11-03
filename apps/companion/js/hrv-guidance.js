// GENERATED from packages/shared/src/hrvGuidance.ts by apps/web/scripts/copy-companion.mjs.
// Do not edit: change the source, then run the script (npm run dev and build run it).
const VelaHrv = (() => {
  /** A baseline needs this many days before a range is a range. */
  const MIN_BASELINE_DAYS = 10;
  /** A week needs this many days before its mean and CV mean anything. */
  const MIN_WEEK_DAYS = 4;
  const WEEK = 7;
  /** The baseline is the three weeks before this one. */
  const BASELINE_WEEKS = 3;
  /** How far a stance is from "train to plan", for choosing the calmer of two reads. */
  const STANCE_DISTANCE = { hold: 0, push: 1, check: 1, ease: 2, rest: 3 };
  /**
   * Read the week. Null while there is not enough HRV to read it against — a range needs
   * MIN_BASELINE_DAYS of history and the week MIN_WEEK_DAYS of readings — in which case
   * the caller shows what it showed before.
   *
   * A single morning never decides it. The week's mean, and even its log, can be tipped by
   * one reading far from her usual: in simulated steady weeks with ordinary day-to-day
   * noise, one morning a quarter under her usual turned the read to ease or rest almost
   * every time. So the week is read again without its most unusual morning (the one furthest
   * from her baseline, in ln), and when that read is calmer, it stands and `oneOff` names
   * the morning left out. A real shift across the week survives the second read. With only
   * MIN_WEEK_DAYS readings there is nothing to leave out, and `firm` is false.
   */
  function hrvGuidance(input) {
      const full = readWeek(input);
      if (!full)
          return null;
      const weekStart = shiftDay(input.today, -(WEEK - 1));
      const mid = (full.figures.rangeLow + full.figures.rangeHigh) / 2;
      const week = input.hrv.filter((v) => v.value > 0 && v.day >= weekStart && v.day <= input.today);
      const far = (v) => Math.abs(Math.log(v.value) - mid);
      const odd = week.reduce((a, v) => (far(v) > far(a) ? v : a), week[0]);
      const without = readWeek({ ...input, hrv: input.hrv.filter((v) => v !== odd) });
      if (!without) {
          return {
              ...full,
              firm: false,
              summary: `${full.summary} · only ${MIN_WEEK_DAYS} readings this week`,
          };
      }
      if (STANCE_DISTANCE[without.stance] < STANCE_DISTANCE[full.stance]) {
          return { ...without, oneOff: odd, summary: `${without.summary} · one unusual morning left out` };
      }
      return full;
  }
  /** The tree on the week as given: hrvGuidance, before the single-morning check. */
  function readWeek(input) {
      const { today } = input;
      const weekStart = shiftDay(today, -(WEEK - 1));
      const baselineStart = shiftDay(today, -(WEEK * (BASELINE_WEEKS + 1) - 1));
      const inWeek = (d) => d >= weekStart && d <= today;
      const inBaseline = (d) => d >= baselineStart && d < weekStart;
      // HRV is read as ln(HRV): it is log-normally distributed, and the log stabilises the
      // variance so one high morning does not own the week.
      const lnHrv = input.hrv
          .filter((v) => v.value > 0)
          .map((v) => ({ day: v.day, value: Math.log(v.value) }));
      const week = lnHrv.filter((v) => inWeek(v.day)).map((v) => v.value);
      const base = lnHrv.filter((v) => inBaseline(v.day)).map((v) => v.value);
      if (week.length < MIN_WEEK_DAYS || base.length < MIN_BASELINE_DAYS)
          return null;
      const weekMean = mean(week);
      const baseMean = mean(base);
      const swc = 0.5 * sd(base);
      const rangeLow = baseMean - swc;
      const rangeHigh = baseMean + swc;
      const hrv = weekMean < rangeLow ? 'below' : weekMean > rangeHigh ? 'above' : 'within';
      // Day-to-day variability: this week's CV against the CVs of the baseline weeks. With
      // only three of those, half their standard deviation can be next to nothing, so the
      // margin is never less than a fifth of their mean — a week has to be clearly more
      // scattered than usual to count as high.
      const cv = coefficientOfVariation(week);
      const baseWeekCvs = [];
      for (let w = 1; w <= BASELINE_WEEKS; w++) {
          const start = shiftDay(weekStart, -WEEK * w);
          const end = shiftDay(weekStart, -WEEK * (w - 1) - 1);
          const days = lnHrv.filter((v) => v.day >= start && v.day <= end).map((v) => v.value);
          if (days.length >= MIN_WEEK_DAYS)
              baseWeekCvs.push(coefficientOfVariation(days));
      }
      const cvHigh = baseWeekCvs.length >= 2
          ? mean(baseWeekCvs) + Math.max(0.5 * sd(baseWeekCvs), 0.2 * mean(baseWeekCvs))
          : coefficientOfVariation(base) * 1.2;
      const variability = cv > cvHigh ? 'high' : 'low';
      // Resting heart rate lower than her normal range: the saturation check. Read the same
      // way, with the margin never under one beat.
      const restWeek = input.restingHr.filter((v) => inWeek(v.day)).map((v) => v.value);
      const restBase = input.restingHr.filter((v) => inBaseline(v.day)).map((v) => v.value);
      const restingLow = restWeek.length >= MIN_WEEK_DAYS &&
          restBase.length >= MIN_BASELINE_DAYS &&
          mean(restWeek) < mean(restBase) - Math.max(1, 0.5 * sd(restBase));
      const phase = trainingPhase(input.load, weekStart, baselineStart, today);
      const block = blockKind(input.sessions.filter((s) => inWeek(s.day)));
      const outcome = leaf(hrv, variability, restingLow, phase, block);
      const stance = STANCE[outcome];
      return {
          hrv,
          variability,
          restingLow,
          phase,
          block,
          outcome,
          stance,
          advice: ADVICE[outcome],
          note: noteFor(stance, input.readiness),
          summary: summaryFor(hrv, variability, phase, restingLow),
          oneOff: null,
          firm: true,
          figures: {
              weekMean,
              rangeLow,
              rangeHigh,
              cv,
              cvHigh,
              weekDays: week.length,
              baselineDays: base.length,
          },
      };
  }
  /**
   * The tree itself, one leaf per path. The six questions on the left of the figure are the
   * six combinations of level and variability; the rest of the path is phase, block and
   * resting heart rate.
   */
  function leaf(hrv, variability, restingLow, phase, block) {
      if (hrv === 'within') {
          if (variability === 'high')
              return phase === 'overload' ? 'expected_high_cv' : 'reduce_for_recovery';
          return phase === 'overload' ? 'coping_well' : 'ok';
      }
      if (hrv === 'below') {
          if (restingLow)
              return 'saturation';
          if (variability === 'high')
              return 'full_rest';
          if (phase === 'overload') {
              if (block === 'intensity')
                  return 'expected_intensity';
              if (block === 'volume')
                  return 'high_fatigue';
              return 'overload_block_unknown';
          }
          return phase === 'taper' ? 'taper_expected' : 'poor_coping';
      }
      // above
      if (phase === 'overload') {
          if (block === 'volume')
              return 'expected_volume';
          if (block === 'intensity') {
              return variability === 'high' ? 'intensity_insufficient_caution' : 'intensity_insufficient';
          }
          return 'above_overload_unknown';
      }
      return variability === 'high' ? 'stabilise' : 'ok';
  }
  /** The framework's own words, for the physiotherapist. */
  const ADVICE = {
      expected_high_cv: 'Expected response in an overload period. Continue to assess over the next few weeks; HRV-CV should decrease.',
      reduce_for_recovery: 'High day-to-day variability outside an overload period. Consider reducing training to enhance recovery.',
      coping_well: 'Coping well with training. Consider increasing training load to enhance adaptation.',
      ok: 'OK. No changes required.',
      saturation: 'Possible HRV saturation: HRV below range with a low resting heart rate. Check performance and wellness metrics.',
      expected_intensity: 'Expected response to a high-intensity block. Continue to assess over the next few weeks.',
      high_fatigue: 'High fatigue and negative adaptation to a high-volume block. Consider a rest period.',
      overload_block_unknown: 'HRV below range in an overload period: expected for a high-intensity block, a sign of fatigue in a high-volume one. Check which this is.',
      taper_expected: 'No changes. HRV reductions are expected during a taper or reduced training.',
      poor_coping: 'Poor coping and negative adaptation. Decrease training intensity or load.',
      full_rest: 'Full rest or a severe reduction in training intensity and load (recovery period).',
      intensity_insufficient: 'Unexpected for a high-intensity block. The high-intensity load may not be sufficient.',
      expected_volume: 'Expected response to a high-volume block. Continue to assess over the next few weeks; HRV-CV should decrease.',
      intensity_insufficient_caution: 'Unexpected for a high-intensity block: the load may not be sufficient. Be cautious because of the high HRV-CV.',
      above_overload_unknown: 'HRV above range in an overload period: expected for a high-volume block, possibly insufficient load in a high-intensity one. Check which this is.',
      stabilise: 'Add recovery and behavioural changes (sleep, slow-paced breathing, ice bath) to stabilise day-to-day variability.',
  };
  const STANCE = {
      expected_high_cv: 'hold',
      reduce_for_recovery: 'ease',
      coping_well: 'push',
      ok: 'hold',
      saturation: 'check',
      expected_intensity: 'hold',
      high_fatigue: 'rest',
      overload_block_unknown: 'ease',
      taper_expected: 'hold',
      poor_coping: 'ease',
      full_rest: 'rest',
      intensity_insufficient: 'push',
      expected_volume: 'hold',
      intensity_insufficient_caution: 'hold',
      above_overload_unknown: 'hold',
      stabilise: 'ease',
  };
  /**
   * The sentence under the gauge: what the body is asking for, crossed with what she said.
   *
   * Her read can only pull a push back to steady, or make an ease firmer; it never turns a
   * rest into a push. Warm and flat, no exclamation marks, and it never tells her to skip
   * the plan — "very light, and let your physio know" is as far as it goes, because the
   * call is the physiotherapist's. With no read yet, the middle sentence.
   */
  function noteFor(stance, readiness) {
      const feel = readiness === null ? 'mid' : readiness <= 1 ? 'low' : readiness >= 3 ? 'high' : 'mid';
      switch (stance) {
          case 'push':
              if (feel === 'high')
                  return "Recovered, and you feel it. There's room to add a little today.";
              if (feel === 'low')
                  return "Your body says it's coping well; you don't feel it. Go by the feeling and keep today steady.";
              return "Your body is coping well with training. Steady is fine, and there's room if you want it.";
          case 'hold':
              if (feel === 'high')
                  return 'Tracking as expected for this stretch of training. Train to plan.';
              if (feel === 'low')
                  return "The numbers are holding, the feeling isn't. Train to plan, but trim it if it stays heavy.";
              return 'Tracking as expected. Train to plan, and stay honest with yourself.';
          case 'ease':
              if (feel === 'high')
                  return "You feel good, but your body is still catching up. Keep today lighter than you'd like.";
              if (feel === 'low')
                  return 'Body and feeling agree: back off today. Lighter, shorter, or a walk.';
              return 'Your body is asking for a little less this week. Lighter today, and see how tomorrow reads.';
          case 'rest':
              if (feel === 'high')
                  return 'Real fatigue underneath, even if you feel fine. Keep today very light and let your physio know.';
              if (feel === 'low')
                  return 'Your body is asking for a proper rest, and you feel it. Very light today, and let your physio know.';
              return 'Your body is asking for a proper rest. Keep today very light and let your physio know.';
          case 'check':
              if (feel === 'low')
                  return "HRV and resting heart rate are both unusually low, and you're not feeling it. Worth telling your physio.";
              return "HRV and resting heart rate are both unusually low. If you're performing and feeling fine, it's fine; if not, say so.";
      }
  }
  function summaryFor(hrv, variability, phase, restingLow) {
      // Her words, not the framework's: "overload" reads as a warning to someone who did
      // not choose the term, and "variability" is a statistic. What it means is a bigger
      // week than usual, and readings that swing day to day.
      const level = hrv === 'within'
          ? 'HRV in your range'
          : hrv === 'below'
              ? 'HRV below your range'
              : 'HRV above your range';
      const cv = variability === 'high' ? 'swinging day to day' : 'steady day to day';
      const week = phase === 'overload'
          ? 'a bigger week than usual'
          : phase === 'taper'
              ? 'a lighter week than usual'
              : 'a usual week';
      return [level, cv, week, ...(restingLow ? ['resting heart rate low'] : [])].join(' · ');
  }
  /**
   * Overload, taper or neither, from load alone: this week's total against the mean of the
   * baseline weeks. A tenth more is an overload, a quarter less a taper — the smallest
   * changes a programme would call by those names. A first week with nothing before it is
   * an overload, which is what a new stimulus is.
   */
  function trainingPhase(load, weekStart, baselineStart, today) {
      const week = load
          .filter((v) => v.day >= weekStart && v.day <= today)
          .reduce((n, v) => n + v.value, 0);
      const weeks = [];
      for (let w = 1; w <= BASELINE_WEEKS; w++) {
          const start = shiftDay(weekStart, -WEEK * w);
          const end = shiftDay(weekStart, -WEEK * (w - 1) - 1);
          if (start < baselineStart)
              break;
          weeks.push(load.filter((v) => v.day >= start && v.day <= end).reduce((n, v) => n + v.value, 0));
      }
      const usual = weeks.length ? mean(weeks) : 0;
      if (usual <= 0)
          return week > 0 ? 'overload' : 'steady';
      const ratio = week / usual;
      if (ratio >= 1.1)
          return 'overload';
      if (ratio <= 0.75)
          return 'taper';
      return 'steady';
  }
  /**
   * High-intensity or high-volume, from the week's sessions: by RPE where she gave one
   * (seven and up is intense, five and a half or under is not), otherwise by what the
   * sessions were — a strength week is an intensity block, a running or mobility week a
   * volume one. Null with nothing to go on.
   */
  function blockKind(sessions) {
      if (sessions.length === 0)
          return null;
      const rpes = sessions.map((s) => s.rpe).filter((r) => r !== null && r > 0);
      if (rpes.length >= 2) {
          const m = mean(rpes);
          if (m >= 7)
              return 'intensity';
          if (m <= 5.5)
              return 'volume';
      }
      const strength = sessions.filter((s) => s.discipline === 'strength').length;
      return strength * 2 >= sessions.length ? 'intensity' : 'volume';
  }
  function mean(xs) {
      return xs.reduce((n, x) => n + x, 0) / xs.length;
  }
  function sd(xs) {
      if (xs.length < 2)
          return 0;
      const m = mean(xs);
      return Math.sqrt(xs.reduce((n, x) => n + (x - m) ** 2, 0) / (xs.length - 1));
  }
  /** In per cent. */
  function coefficientOfVariation(xs) {
      const m = mean(xs);
      return m === 0 ? 0 : (sd(xs) / m) * 100;
  }
  /** An ISO day moved by a number of days, in UTC so no clock is read. */
  function shiftDay(day, by) {
      const [y, m, d] = day.split('-').map(Number);
      const t = Date.UTC(y, (m !== null && m !== void 0 ? m : 1) - 1, (d !== null && d !== void 0 ? d : 1) + by);
      return new Date(t).toISOString().slice(0, 10);
  }
  return { MIN_BASELINE_DAYS, MIN_WEEK_DAYS, hrvGuidance, trainingPhase, blockKind };
})();
