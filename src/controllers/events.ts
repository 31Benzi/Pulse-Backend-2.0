import type { Context } from "hono";
import fs from "fs";
import path from "path";
import { findUserByAccountId, addArenaHype } from "../db/queries";
import { getVersionInfo, logger } from "../utils/helpers";

export async function getArenaEvents(c: Context) {
  const accountId = c.req.param("accountId");
  if (!accountId) {
    return c.json({ error: "Missing accountId" }, 400);
  }

  const userAgent = c.req.header("User-Agent") || "";
  const versionInfo = getVersionInfo(userAgent);
  const season = versionInfo.season || 9;
  const seasonStr = `S${season}`;

  const eventsPath = path.join(process.cwd(), "static", "events", "events.json");
  const templatesPath = path.join(process.cwd(), "static", "events", "template.json");

  if (!fs.existsSync(eventsPath) || !fs.existsSync(templatesPath)) {
    return c.json({ error: "Events files not found" }, 500);
  }

  const eventsData = JSON.parse(fs.readFileSync(eventsPath, "utf-8")) as Record<string, unknown>[];
  const templatesData = JSON.parse(fs.readFileSync(templatesPath, "utf-8")) as Record<string, unknown>[];

  const updatedEvents = eventsData.map(evt => {
    const evtCopy = JSON.parse(JSON.stringify(evt)) as Record<string, unknown>;
    
    if (typeof evtCopy.eventId === "string") {
      evtCopy.eventId = evtCopy.eventId.replace(/S0/g, seasonStr);
    }

    if (Array.isArray(evtCopy.eventWindows)) {
      evtCopy.eventWindows = (evtCopy.eventWindows as Record<string, unknown>[]).map(w => {
        const wCopy = { ...w } as Record<string, unknown>;
        
        if (typeof wCopy.eventTemplateId === "string") {
          wCopy.eventTemplateId = wCopy.eventTemplateId.replace(/S0/g, seasonStr);
        }
        if (typeof wCopy.eventWindowId === "string") {
          wCopy.eventWindowId = wCopy.eventWindowId.replace(/S0/g, seasonStr);
        }
        if (Array.isArray(wCopy.requireAllTokens)) {
          wCopy.requireAllTokens = (wCopy.requireAllTokens as string[]).map(t => t.replace(/S0/g, seasonStr));
        }
        if (Array.isArray(wCopy.requireNoneTokensCaller)) {
          wCopy.requireNoneTokensCaller = (wCopy.requireNoneTokensCaller as string[]).map(t => t.replace(/S0/g, seasonStr));
        }

        return wCopy;
      });
    }

    return evtCopy;
  });

  const updatedTemplates = templatesData.map(t => {
    const tCopy = { ...t } as Record<string, unknown>;
    if (typeof tCopy.eventTemplateId === "string") {
      tCopy.eventTemplateId = tCopy.eventTemplateId.replace(/S0/g, seasonStr);
    }
    return tCopy;
  });

  const playerTeams: Record<string, string[]> = {
    "floating:Hype": [accountId]
  };
  for (let i = 1; i <= 10; i++) {
    const soloKey = `epicgames_Arena_${seasonStr}_Solo:Arena_${seasonStr}_Division${i}_Solo`;
    const duosKey = `epicgames_Arena_${seasonStr}_Duos:Arena_${seasonStr}_Division${i}_Duos`;
    playerTeams[soloKey] = [accountId];
    playerTeams[duosKey] = [accountId];
  }

  const user = await findUserByAccountId(accountId);
  const hype = user?.arenaHype || 0;
  const division = user?.arenaDivision || 1;

  const response = {
    events: updatedEvents,
    player: {
      accountId,
      gameId: "Fortnite",
      groupIdentity: {},
      pendingPayouts: [],
      pendingPenalties: {},
      persistentScores: {
        Hype: hype
      },
      teams: playerTeams,
      tokens: [`ARENA_${seasonStr}_Division${division}`]
    },
    templates: updatedTemplates
  };

  return c.json(response);
}

export async function getEvents(c: Context) {
  const accountId = c.req.param("accountId");
  const seasonEnd = process.env.SEASON_END || "9999-12-31T00:00:00.000Z";

  const eventsFile = fs.readFileSync(path.join(process.cwd(), "static", "events", "events.json"), "utf-8");
  const eventsData = JSON.parse(eventsFile);

  const templateFile = fs.readFileSync(path.join(process.cwd(), "static", "events", "template.json"), "utf-8");
  const template = JSON.parse(templateFile);

  const user = await findUserByAccountId(accountId);
  const hype = user?.arenaHype || 0;
  const division = user?.arenaDivision || 1;

  const userAgent = c.req.header("User-Agent") || "";
  const versionInfo = getVersionInfo(userAgent);
  const season = versionInfo.season || 9;
  const seasonStr = `S${season}`;

  const events: Record<string, unknown>[] = [];

  for (const event of eventsData) {
    const eventId = `${event.eventType}_${accountId}`.replace("EventFlag.", "");
    events.push({
      eventId,
      eventWindows: [{
        eventWindowId: `${eventId}_Window`,
        beginTime: "2000-01-01T00:00:00.000Z",
        endTime: seasonEnd,
        round: 0,
        scoreLocation: null,
        visibility: "Public",
        publishedTime: "2000-01-01T00:00:00.000Z",
        additionalRequirements: [],
        metadata: event.metadata || {},
        tokens: event.tokens || [],
        countdownBeginTime: "2000-01-01T00:00:00.000Z",
        canLiveSpectate: true
      }],
      eventGroup: event.eventGroup || null,
      announcementTime: "2000-01-01T00:00:00.000Z",
      displayDataId: event.displayDataId || "epicgames_Arena_S13_Duos",
      eventDisplayDataId: event.eventDisplayDataId || "epicgames_Arena_S13_Duos",
      appId: null,
      devOnly: false,
      environment: null,
      link: event.link || {},
      metadata: event.metadata || {},
      regions: event.regions || ["NAE", "NAW", "EU", "OCE", "BR", "ASIA"],
      platforms: ["Windows", "Android", "IOS"],
      beginTime: "2000-01-01T00:00:00.000Z",
      endTime: seasonEnd
    });
  }

  return c.json({
    events,
    templates: template,
    player: {
      accountId,
      gameId: "Fortnite",
      teams: {},
      pendingPayouts: [],
      pendingPenalties: {},
      persistentScores: {
        Hype: hype
      },
      tokens: [`ARENA_${seasonStr}_Division${division}`]
    }
  });
}

export async function postEventHistory(c: Context) {
  const accountId = c.req.param("accountId");
  if (!accountId) return c.json({ error: "Missing accountId" }, 400);

  const user = await findUserByAccountId(accountId);
  if (!user) return c.json({ error: "User not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  logger.info(`[Events] Score report for ${accountId}: ${JSON.stringify(body)}`);

  const currentHype = user.arenaHype || 0;
  let hypeChange = 0;
  let scoreHandled = false;

  if (typeof body.score === "number" && body.score > 0) {
    if (body.score > currentHype) {
      hypeChange = body.score - currentHype;
      scoreHandled = true;
    }
  }

  if (!scoreHandled && typeof body.sessionHistory?.totalScore === "number" && body.sessionHistory.totalScore > 0) {
    if (body.sessionHistory.totalScore > currentHype) {
      hypeChange = body.sessionHistory.totalScore - currentHype;
      scoreHandled = true;
    }
  }

  const trackedStats: Record<string, number> = {};

  const rawStats = body.trackedStats ?? body.payload?.trackedStats ?? body.sessionHistory?.trackedStats;
  if (rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)) {
    for (const [k, v] of Object.entries(rawStats)) {
      trackedStats[k] = Number(v) || 0;
    }
  } else if (Array.isArray(rawStats)) {
    for (const s of rawStats) {
      if (s.statName != null) trackedStats[s.statName] = Number(s.statValue) || 0;
      if (s.name != null) trackedStats[s.name] = Number(s.value) || 0;
    }
  }

  if (Array.isArray(body.sessionHistory?.matches)) {
    for (const match of body.sessionHistory.matches) {
      const ms = match.trackedStats ?? match.stats;
      if (ms && typeof ms === "object") {
        for (const [k, v] of Object.entries(ms as Record<string, unknown>)) {
          trackedStats[k] = (trackedStats[k] || 0) + (Number(v) || 0);
        }
      }
    }
  }

  if (Object.keys(trackedStats).length > 0 && !scoreHandled) {
    const userAgent = c.req.header("User-Agent") || "";
    const versionInfo = getVersionInfo(userAgent);
    const season = versionInfo.season || 9;
    const seasonStr = `S${season}`;

    const templatesPath = path.join(process.cwd(), "static", "events", "template.json");
    const division = user.arenaDivision || 1;

    if (fs.existsSync(templatesPath)) {
      const templates = JSON.parse(fs.readFileSync(templatesPath, "utf-8")) as Record<string, unknown>[];
      const templateId = `eventTemplate_Arena_${seasonStr}_Division${division}_Solo`;
      let template = templates.find(t => t.eventTemplateId === templateId) as Record<string, unknown> | undefined;
      if (!template) {
        template = templates.find(t => t.eventTemplateId === `eventTemplate_Arena_S0_Division${division}_Solo`) as Record<string, unknown> | undefined;
      }

      let statsHype = 0;
      if (template && Array.isArray(template.scoringRules)) {
        for (const rule of template.scoringRules as { matchRule: string; trackedStat: string; rewardTiers: { keyValue: number; multiplicative: boolean; pointsEarned: number }[] }[]) {
          const statValue = trackedStats[rule.trackedStat] || 0;
          if (!rule.rewardTiers || rule.rewardTiers.length === 0) continue;

          if (rule.matchRule === "gte") {
            for (const tier of rule.rewardTiers) {
              if (statValue >= tier.keyValue) {
                statsHype += tier.multiplicative ? statValue * tier.pointsEarned : tier.pointsEarned;
              }
            }
          } else if (rule.matchRule === "lte") {
            let bestReward = 0;
            for (const tier of rule.rewardTiers) {
              if (statValue <= tier.keyValue && tier.pointsEarned > bestReward) {
                bestReward = tier.pointsEarned;
              }
            }
            statsHype += bestReward;
          } else if (rule.matchRule === "gtw") {
            for (const tier of rule.rewardTiers) {
              if (statValue >= tier.keyValue) {
                statsHype += tier.multiplicative ? statValue * tier.pointsEarned : tier.pointsEarned;
              }
            }
          }
        }
      } else {
        const kills = trackedStats["TEAM_ELIMS_STAT_INDEX"] || 0;
        const placement = trackedStats["PLACEMENT_STAT_INDEX"] || 0;
        statsHype = kills * 20;
        if (placement === 1) statsHype += 100;
        else if (placement <= 3) statsHype += 50;
        else if (placement <= 5) statsHype += 25;
      }

      if (statsHype > hypeChange) {
        hypeChange = statsHype;
      }
    }
  }

  let newHype = currentHype;

  if (hypeChange > 0) {
    const result = await addArenaHype(accountId, hypeChange);
    if (result) {
      newHype = result.hype;
    }
    logger.info(`[Events] Hype updated for ${accountId}: ${currentHype} -> ${newHype} (+${hypeChange})`);
  }

  return c.json({
    score: newHype,
    persistentScores: {
      Hype: newHype
    }
  });
}

export async function getEventTokens(c: Context) {
  return c.json([]);
}

export async function getLeaderboards(c: Context) {
  const accountId = c.req.param("accountId");
  return c.json({
    liveSessions: {},
    cohorts: {},
    accountId
  });
}

export async function downloadSubgame(c: Context) {
  return c.json({
    appName: "Fortnite",
    labelName: ""
  });
}
