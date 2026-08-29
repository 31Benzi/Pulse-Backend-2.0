import type { Context } from "hono";
import { getVersionInfo } from "../utils/helpers";

export async function getTimeline(c: Context) {
  const userAgent = c.req.header("user-agent") || "";
  const versionInfo = getVersionInfo(userAgent);

  const seasonEnd = process.env.SEASON_END || "9999-12-31T00:00:00.000Z";

  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  const storeEnd = new Date(midnight.getTime() - 60000).toISOString();

  let seasonNumber = versionInfo.season;
  if (seasonNumber === 10) {
    seasonNumber = 11;
  }

  const activeEvents = [
    {
      eventType: `EventFlag.Season${seasonNumber}`,
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "0001-01-01T00:00:00.000Z"
    },
    {
      eventType: `EventFlag.${versionInfo.lobby}`,
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "0001-01-01T00:00:00.000Z"
    }
  ];

  const response = {
    channels: {
      "client-matchmaking": {
        states: [],
        cacheExpire: "9999-01-01T00:00:00.000Z"
      },
      "client-events": {
        states: [{
          validFrom: "0001-01-01T00:00:00.000Z",
          activeEvents,
          state: {
            activeStorefronts: [],
            eventNamedWeights: {},
            seasonNumber,
            seasonTemplateId: `AthenaSeason:athenaseason${seasonNumber}`,
            matchXpBonusPoints: 0,
            seasonBegin: "0001-01-01T00:00:00Z",
            seasonEnd,
            seasonDisplayedEnd: seasonEnd,
            weeklyStoreEnd: storeEnd,
            sectionStoreEnds: {
              Featured: storeEnd
            },
            dailyStoreEnd: storeEnd
          }
        }],
        cacheExpire: "9999-01-01T00:00:00.000Z"
      }
    },
    eventsTimeOffsetHrs: 0,
    cacheIntervalMins: 10,
    currentTime: new Date().toISOString()
  };

  return c.json(response);
}

export async function getCalendar(c: Context) {
  const seasonEnd = process.env.SEASON_END || "9999-12-31T00:00:00.000Z";

  return c.json({
    channels: {
      "standalone-store": { states: [], cacheExpire: seasonEnd },
      "client-matchmaking": { states: [], cacheExpire: seasonEnd },
      "tk": { states: [], cacheExpire: seasonEnd },
      "featured-islands": { states: [], cacheExpire: seasonEnd },
      "community-votes": { states: [], cacheExpire: seasonEnd },
      "client-events": {
        states: [{
          validFrom: "2000-01-01T00:00:00.000Z",
          activeEvents: [],
          state: {
            activeStorefronts: [],
            eventNamedWeights: {},
            seasonNumber: 13,
            seasonTemplateId: "AthenaSeason:athenaseason13",
            matchXpBonusPoints: 0,
            seasonBegin: "2000-01-01T00:00:00.000Z",
            seasonEnd,
            seasonDisplayedEnd: seasonEnd,
            weeklyStoreEnd: seasonEnd,
            dailyStoreEnd: seasonEnd
          }
        }],
        cacheExpire: seasonEnd
      }
    },
    eventsTimeOffsetHrs: 0,
    cacheIntervalMins: 10,
    currentTime: new Date().toISOString()
  });
}
