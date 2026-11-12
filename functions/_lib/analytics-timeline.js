export const KST_TIME_ZONE = 'Asia/Seoul';
export const KST_UTC_OFFSET = '+09:00';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad = value => String(value).padStart(2, '0');

const utcDateKey = timestamp => {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export const getKstWindow = (now = new Date(), rangeDays = 30) => {
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(reference.getTime())) throw new TypeError('유효한 기준 시간이 필요합니다.');
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 366) throw new RangeError('집계 기간을 확인해 주세요.');

  const shifted = new Date(reference.getTime() + KST_OFFSET_MS);
  const todayStartUtcMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  ) - KST_OFFSET_MS;
  const startUtcMs = todayStartUtcMs - (rangeDays - 1) * DAY_MS;
  const endUtcMs = todayStartUtcMs + DAY_MS;

  return {
    timezone: KST_TIME_ZONE,
    utcOffset: KST_UTC_OFFSET,
    serverNow: reference.toISOString(),
    kstDate: utcDateKey(todayStartUtcMs + KST_OFFSET_MS),
    kstHour: shifted.getUTCHours(),
    rangeDays,
    startDate: utcDateKey(startUtcMs + KST_OFFSET_MS),
    endDate: utcDateKey(todayStartUtcMs + KST_OFFSET_MS),
    startUtc: new Date(startUtcMs).toISOString(),
    todayStartUtc: new Date(todayStartUtcMs).toISOString(),
    endUtc: new Date(endUtcMs).toISOString(),
    dates: Array.from({ length: rangeDays }, (_, index) => utcDateKey(startUtcMs + index * DAY_MS + KST_OFFSET_MS))
  };
};

const toCount = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
};

const bucketRows = (rows, key) => {
  const buckets = new Map();
  for (const row of rows || []) {
    const bucket = String(row?.[key] ?? '');
    if (!bucket) continue;
    const current = buckets.get(bucket) || { visit_sessions: 0, page_views: 0 };
    current.visit_sessions += toCount(row.visit_sessions);
    current.page_views += toCount(row.page_views);
    buckets.set(bucket, current);
  }
  return buckets;
};

export const buildTimeline = (context, { hourly = [], daily = [] } = {}) => {
  const hourlyBuckets = bucketRows(hourly, 'hour');
  const dailyBuckets = bucketRows(daily, 'date');
  const hourlyTimeline = Array.from({ length: 24 }, (_, hour) => {
    const values = hourlyBuckets.get(String(hour)) || { visit_sessions: 0, page_views: 0 };
    return {
      hour,
      label: pad(hour),
      visit_sessions: values.visit_sessions,
      page_views: values.page_views,
      provisional: hour === context.kstHour
    };
  });
  const today = hourlyTimeline.reduce((totals, item) => ({
    visit_sessions: totals.visit_sessions + item.visit_sessions,
    page_views: totals.page_views + item.page_views
  }), { visit_sessions: 0, page_views: 0 });
  const dailyTimeline = context.dates.map(date => {
    const values = dailyBuckets.get(date) || { visit_sessions: 0, page_views: 0 };
    const isToday = date === context.kstDate;
    return {
      date,
      visit_sessions: isToday ? today.visit_sessions : values.visit_sessions,
      page_views: isToday ? today.page_views : values.page_views,
      provisional: isToday
    };
  });

  return {
    today: { date: context.kstDate, ...today, provisional: true },
    hourly: hourlyTimeline,
    daily: dailyTimeline
  };
};
